package relay

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskali "github.com/QuantumNous/new-api/relay/channel/task/ali"
	taskdoubao "github.com/QuantumNous/new-api/relay/channel/task/doubao"
	taskGemini "github.com/QuantumNous/new-api/relay/channel/task/gemini"
	"github.com/QuantumNous/new-api/relay/channel/task/hailuo"
	taskjimeng "github.com/QuantumNous/new-api/relay/channel/task/jimeng"
	"github.com/QuantumNous/new-api/relay/channel/task/kling"
	tasksora "github.com/QuantumNous/new-api/relay/channel/task/sora"
	"github.com/QuantumNous/new-api/relay/channel/task/suno"
	taskvertex "github.com/QuantumNous/new-api/relay/channel/task/vertex"
	taskVidu "github.com/QuantumNous/new-api/relay/channel/task/vidu"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"strconv"
)

type legacyTaskAdaptor interface {
	Init(info *relaycommon.RelayInfo)

	ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *taskdto.TaskError

	// ── Billing ──────────────────────────────────────────────────────

	// EstimateBilling returns OtherRatios for pre-charge based on user request.
	// Called after ValidateRequestAndSetAction, before price calculation.
	// Adaptors should extract duration, resolution, etc. from the parsed request
	// and return them as ratio multipliers (e.g. {"seconds": 5, "size": 1.666}).
	// Return nil to use the base model price without extra ratios.
	EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64

	// AdjustBillingOnSubmit returns adjusted OtherRatios from the upstream
	// submit response. Called after a successful DoResponse.
	// If the upstream returned actual parameters that differ from the estimate
	// (e.g. actual seconds), return updated ratios so the caller can recalculate
	// the quota and settle the delta with the pre-charge.
	// Return nil if no adjustment is needed.
	AdjustBillingOnSubmit(info *relaycommon.RelayInfo, taskData []byte) map[string]float64

	// AdjustBillingOnComplete returns the actual quota when a task reaches a
	// terminal state (success/failure) during polling.
	// Called by the polling loop after ParseTaskResult.
	// Return a positive value to trigger delta settlement (supplement / refund).
	// Return 0 to keep the pre-charged amount unchanged.
	AdjustBillingOnComplete(task *model.Task, taskResult *relaycommon.TaskInfo) int

	// ── Request / Response ───────────────────────────────────────────

	BuildRequestURL(info *relaycommon.RelayInfo) (string, error)
	BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error
	BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error)

	DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error)
	DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, err *taskdto.TaskError)

	GetModelList() []string
	GetChannelName() string

	// ── Polling ──────────────────────────────────────────────────────

	FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error)
	ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error)
}

// legacyTaskBridge retains the provider contracts used by persisted numeric
// platforms while exposing the new parse-before-commit task pipeline.
type legacyTaskBridge struct{ legacyTaskAdaptor }

type legacyTaskResponseWriter struct {
	gin.ResponseWriter
	body   bytes.Buffer
	status int
}

func (w *legacyTaskResponseWriter) WriteHeader(status int)            { w.status = status }
func (w *legacyTaskResponseWriter) WriteHeaderNow()                   {}
func (w *legacyTaskResponseWriter) Write(b []byte) (int, error)       { return w.body.Write(b) }
func (w *legacyTaskResponseWriter) WriteString(s string) (int, error) { return w.body.WriteString(s) }
func (w *legacyTaskResponseWriter) Status() int                       { return w.status }
func (w *legacyTaskResponseWriter) Size() int                         { return w.body.Len() }
func (w *legacyTaskResponseWriter) Written() bool                     { return w.body.Len() > 0 }
func (w *legacyTaskResponseWriter) Flush()                            {}

func (a *legacyTaskBridge) ParseResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*channel.TaskSubmitResponse, *taskdto.TaskError) {
	writer := &legacyTaskResponseWriter{ResponseWriter: c.Writer, status: http.StatusOK}
	local := c.Copy()
	local.Writer = writer
	id, data, err := a.legacyTaskAdaptor.DoResponse(local, resp, info)
	if err != nil {
		return nil, err
	}
	var response any
	if writer.body.Len() > 0 {
		response = json.RawMessage(append([]byte(nil), writer.body.Bytes()...))
	}
	return &channel.TaskSubmitResponse{UpstreamTaskID: id, TaskData: data, ClientResponse: response}, nil
}
func (a *legacyTaskBridge) FetchTask(baseURL, key string, task *model.Task, proxy string) (*http.Response, error) {
	return a.legacyTaskAdaptor.FetchTask(baseURL, key, map[string]any{"task_id": task.GetUpstreamTaskID(), "action": task.Action}, proxy)
}
func (a *legacyTaskBridge) ParseTaskResult(_ *model.Task, _ *http.Response, body []byte) (*relaycommon.TaskInfo, error) {
	return a.legacyTaskAdaptor.ParseTaskResult(body)
}
func (a *legacyTaskBridge) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	if converter, ok := a.legacyTaskAdaptor.(channel.OpenAIVideoConverter); ok {
		return converter.ConvertToOpenAIVideo(task)
	}
	return nil, fmt.Errorf("platform %s does not support OpenAI video conversion", task.Platform)
}
func (a *legacyTaskBridge) ConvertToArkVideo(task *model.Task) ([]byte, error) {
	if converter, ok := a.legacyTaskAdaptor.(channel.ArkVideoConverter); ok {
		return converter.ConvertToArkVideo(task)
	}
	return nil, fmt.Errorf("platform %s does not support Ark video conversion", task.Platform)
}

func getLegacyTaskAdaptor(platform constant.TaskPlatform) legacyTaskAdaptor {
	switch platform {
	//case constant.APITypeAIProxyLibrary:
	//	return &aiproxy.Adaptor{}
	case constant.TaskPlatformSuno:
		return &suno.TaskAdaptor{}
	}
	if channelType, err := strconv.ParseInt(string(platform), 10, 64); err == nil {
		switch channelType {
		case constant.ChannelTypeAli:
			return &taskali.TaskAdaptor{}
		case constant.ChannelTypeKling:
			return &kling.TaskAdaptor{}
		case constant.ChannelTypeJimeng:
			return &taskjimeng.TaskAdaptor{}
		case constant.ChannelTypeVertexAi:
			return &taskvertex.TaskAdaptor{}
		case constant.ChannelTypeVidu:
			return &taskVidu.TaskAdaptor{}
		case constant.ChannelTypeDoubaoVideo, constant.ChannelTypeVolcEngine:
			return &taskdoubao.TaskAdaptor{}
		case constant.ChannelTypeSora, constant.ChannelTypeOpenAI:
			return &tasksora.TaskAdaptor{}
		case constant.ChannelTypeGemini:
			return &taskGemini.TaskAdaptor{}
		case constant.ChannelTypeMiniMax:
			return &hailuo.TaskAdaptor{}
		}
	}
	return nil
}

func (a *legacyTaskBridge) FetchMode() string {
	if _, ok := a.legacyTaskAdaptor.(*suno.TaskAdaptor); ok {
		return "batch"
	}
	return "per_task"
}
func (a *legacyTaskBridge) FetchBatchTasks(baseURL, key string, tasks []*model.Task, proxy string) (*http.Response, error) {
	ids := make([]string, 0, len(tasks))
	for _, task := range tasks {
		ids = append(ids, task.GetUpstreamTaskID())
	}
	return a.legacyTaskAdaptor.FetchTask(baseURL, key, map[string]any{"ids": ids}, proxy)
}
func (a *legacyTaskBridge) ParseBatchResult(_ []*model.Task, _ *http.Response, body []byte) (map[string]*service.BatchTaskResult, error) {
	var response taskdto.TaskResponse[[]taskdto.SunoDataResponse]
	if err := common.Unmarshal(body, &response); err != nil {
		return nil, err
	}
	if !response.IsSuccess() {
		return nil, fmt.Errorf("legacy Suno task query failed")
	}
	results := make(map[string]*service.BatchTaskResult, len(response.Data))
	for _, item := range response.Data {
		status := item.Status
		if item.FailReason != "" {
			status = string(model.TaskStatusFailure)
		}
		results[item.TaskID] = &service.BatchTaskResult{
			TaskInfo: relaycommon.TaskInfo{TaskID: item.TaskID, Status: status, Reason: item.FailReason},
			Action:   item.Action, SubmitTime: item.SubmitTime, StartTime: item.StartTime, FinishTime: item.FinishTime, Data: item.Data,
		}
	}
	return results, nil
}
