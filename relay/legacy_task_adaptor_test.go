package relay

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLegacyTaskParseDoesNotWriteBeforePersistence(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v3/contents/generations/tasks", nil)
	c.Set("relay_response_format", "ark")
	info := &relaycommon.RelayInfo{TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task-public"}}
	adaptor := GetTaskAdaptor(constant.TaskPlatform(strconv.Itoa(constant.ChannelTypeDoubaoVideo)))
	require.NotNil(t, adaptor)
	parsed, err := adaptor.ParseResponse(c, &http.Response{Body: io.NopCloser(strings.NewReader(`{"id":"vendor-task"}`))}, info)
	require.Nil(t, err)
	require.NotNil(t, parsed)
	assert.False(t, c.Writer.Written())
	assert.Empty(t, recorder.Body.String())
	assert.Equal(t, "vendor-task", parsed.UpstreamTaskID)
	raw, marshalErr := common.Marshal(parsed.ClientResponse)
	require.NoError(t, marshalErr)
	assert.JSONEq(t, `{"id":"task-public"}`, string(raw))
}

func TestLegacySunoBatchKeepsTerminalFailureAndData(t *testing.T) {
	adaptor := GetTaskAdaptor(constant.TaskPlatformSuno).(*legacyTaskBridge)
	assert.Equal(t, "batch", adaptor.FetchMode())
	results, err := adaptor.ParseBatchResult(nil, nil, []byte(`{"code":"success","data":[{"task_id":"vendor-task","status":"SUCCESS","fail_reason":"failed upstream","finish_time":42,"data":{"clips":[]}}]}`))
	require.NoError(t, err)
	require.Contains(t, results, "vendor-task")
	assert.Equal(t, string(model.TaskStatusFailure), results["vendor-task"].TaskInfo.Status)
	assert.Equal(t, int64(42), results["vendor-task"].FinishTime)
}
