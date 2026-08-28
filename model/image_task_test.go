package model

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpsertTerminalImageTaskSuccessIsIdempotent(t *testing.T) {
	truncateTables(t)

	requestID := "req-image-success"
	start := int64(1_787_882_400)
	first, err := UpsertTerminalImageTask(TerminalImageTaskParams{
		RequestID:  requestID,
		UserID:     42,
		Group:      "premium",
		ChannelID:  7,
		Quota:      25000,
		Action:     constant.TaskActionImagesGeneration,
		Status:     TaskStatusSuccess,
		ModelName:  "gpt-image-2",
		Prompt:     "a lighthouse in a storm",
		SubmitTime: start,
		FinishTime: start + 5,
		Results: []taskdto.ImageTaskResult{
			{Status: taskdto.ImageTaskResultStatusAvailable, Key: "first-key"},
			{Status: taskdto.ImageTaskResultStatusAvailable, Key: "second-key"},
		},
	})
	require.NoError(t, err)
	require.NotNil(t, first)

	second, err := UpsertTerminalImageTask(TerminalImageTaskParams{
		RequestID:  requestID,
		UserID:     42,
		Group:      "premium",
		ChannelID:  9,
		Quota:      30000,
		Action:     constant.TaskActionImagesGeneration,
		Status:     TaskStatusSuccess,
		ModelName:  "gpt-image-2",
		Prompt:     "a lighthouse in a storm",
		SubmitTime: start,
		FinishTime: start + 6,
		Results: []taskdto.ImageTaskResult{
			{Status: taskdto.ImageTaskResultStatusAvailable, Key: "first-key"},
			{Status: taskdto.ImageTaskResultStatusAvailable, Key: "second-key"},
		},
	})
	require.NoError(t, err)
	require.NotNil(t, second)
	assert.Equal(t, first.ID, second.ID)
	assert.Equal(t, first.TaskID, second.TaskID)

	var count int64
	require.NoError(t, DB.Model(&Task{}).Where("task_id = ?", first.TaskID).Count(&count).Error)
	assert.EqualValues(t, 1, count)

	var stored Task
	require.NoError(t, DB.Where("task_id = ?", first.TaskID).First(&stored).Error)
	assert.EqualValues(t, constant.TaskPlatformImage, stored.Platform)
	assert.Equal(t, constant.TaskActionImagesGeneration, stored.Action)
	assert.EqualValues(t, TaskStatusSuccess, stored.Status)
	assert.Equal(t, "100%", stored.Progress)
	assert.Equal(t, 9, stored.ChannelId)
	assert.Equal(t, 30000, stored.Quota)
	assert.Equal(t, "premium", stored.Group)
	assert.Equal(t, "gpt-image-2", stored.Properties.OriginModelName)
	assert.Equal(t, "a lighthouse in a storm", stored.Properties.Input)
	assert.Equal(t, start, stored.SubmitTime)
	assert.Equal(t, start, stored.StartTime)
	assert.Equal(t, start+6, stored.FinishTime)

	var results []taskdto.ImageTaskResult
	require.NoError(t, common.Unmarshal(stored.Data, &results))
	require.Len(t, results, 2)
	assert.Equal(t, taskdto.ImageTaskResultStatusAvailable, results[0].Status)
	assert.Equal(t, "first-key", results[0].Key)
	assert.Equal(t, "/api/drawing_logs/image/first-key", results[0].ThumbnailURL)
	assert.Equal(t, "/api/drawing_logs/image/first-key?variant=original", results[0].OriginalURL)
	assert.Equal(t, "second-key", results[1].Key)
	assert.Equal(t, results[0].OriginalURL, stored.PrivateData.ResultURL)
}

func TestUpsertTerminalImageTaskFailureHasNoResultURL(t *testing.T) {
	truncateTables(t)

	task, err := UpsertTerminalImageTask(TerminalImageTaskParams{
		RequestID:  "req-image-failure",
		UserID:     11,
		Group:      "default",
		ChannelID:  3,
		Action:     constant.TaskActionImagesEdit,
		Status:     TaskStatusFailure,
		FailReason: "upstream unavailable",
		ModelName:  "gpt-image-2",
		Prompt:     "remove the background",
		SubmitTime: 100,
		FinishTime: 104,
		Results:    []taskdto.ImageTaskResult{{Status: taskdto.ImageTaskResultStatusAvailable, Key: "must-not-leak"}},
	})
	require.NoError(t, err)
	require.NotNil(t, task)
	assert.EqualValues(t, TaskStatusFailure, task.Status)
	assert.Equal(t, "upstream unavailable", task.FailReason)
	assert.Empty(t, task.PrivateData.ResultURL)
	assert.Empty(t, task.GetResultURL())

	var results []taskdto.ImageTaskResult
	require.NoError(t, common.Unmarshal(task.Data, &results))
	assert.Empty(t, results)
}

func TestUpsertTerminalImageTaskPreservesUnavailableResultOrderWithoutFakeURL(t *testing.T) {
	truncateTables(t)

	task, err := UpsertTerminalImageTask(TerminalImageTaskParams{
		RequestID:  "req-image-partial-capture",
		UserID:     12,
		Action:     constant.TaskActionImagesGeneration,
		Status:     TaskStatusSuccess,
		ModelName:  "gpt-image-2",
		SubmitTime: 100,
		FinishTime: 104,
		Results: []taskdto.ImageTaskResult{
			{Status: taskdto.ImageTaskResultStatusAvailable, Key: "first-key"},
			{Status: taskdto.ImageTaskResultStatusUnavailable, ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed},
			{Status: taskdto.ImageTaskResultStatusAvailable, Key: "third-key"},
		},
	})
	require.NoError(t, err)
	require.NotNil(t, task)

	var results []taskdto.ImageTaskResult
	require.NoError(t, common.Unmarshal(task.Data, &results))
	require.Len(t, results, 3)
	assert.Equal(t, taskdto.ImageTaskResultStatusAvailable, results[0].Status)
	assert.Equal(t, "/api/drawing_logs/image/first-key?variant=original", results[0].OriginalURL)
	assert.Equal(t, taskdto.ImageTaskResult{
		Status:    taskdto.ImageTaskResultStatusUnavailable,
		ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
	}, results[1])
	assert.Equal(t, taskdto.ImageTaskResultStatusAvailable, results[2].Status)
	assert.Equal(t, "/api/drawing_logs/image/third-key?variant=original", results[2].OriginalURL)
	assert.Equal(t, results[0].OriginalURL, task.PrivateData.ResultURL)
}

func TestUpsertTerminalImageTaskSuccessfulOutcomeWithNoCapturedAssetHasNoResultURL(t *testing.T) {
	truncateTables(t)

	task, err := UpsertTerminalImageTask(TerminalImageTaskParams{
		RequestID:  "req-image-all-capture-failed",
		Action:     constant.TaskActionImagesGeneration,
		Status:     TaskStatusSuccess,
		SubmitTime: 100,
		FinishTime: 104,
		Results: []taskdto.ImageTaskResult{{
			Status:    taskdto.ImageTaskResultStatusUnavailable,
			ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
		}},
	})
	require.NoError(t, err)
	require.NotNil(t, task)
	assert.Empty(t, task.GetResultURL())

	var results []taskdto.ImageTaskResult
	require.NoError(t, common.Unmarshal(task.Data, &results))
	require.Equal(t, []taskdto.ImageTaskResult{{
		Status:    taskdto.ImageTaskResultStatusUnavailable,
		ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
	}}, results)
}

func TestRecordImageTaskFromConsumeLogUsesFinalLogValues(t *testing.T) {
	truncateTables(t)
	gin.SetMode(gin.TestMode)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	c.Set(common.RequestIdKey, "req-consume-values")
	common.SetContextKey(c, constant.ContextKeyRequestStartTime, time.Unix(1_787_882_400, 0))
	common.SetContextKey(c, constant.ContextKeyDrawingPrompt, "painted city skyline")
	common.SetContextKey(c, constant.ContextKeyDrawingResultKeys, []string{"image-one"})
	common.SetContextKey(c, constant.ContextKeyDrawingTaskResults, []taskdto.ImageTaskResult{{
		Status: taskdto.ImageTaskResultStatusAvailable, Key: "image-one",
	}})

	err := recordImageTaskFromConsumeLog(c, &Log{
		UserId:    8,
		Group:     "auto-low",
		ChannelId: 19,
		Quota:     45678,
		ModelName: "gpt-image-2",
		LogMode:   "images_generation",
		CreatedAt: 1_787_882_407,
		UseTime:   7,
	})
	require.NoError(t, err)

	var stored Task
	require.NoError(t, DB.Where("task_id = ?", StableImageTaskID("req-consume-values")).First(&stored).Error)
	assert.Equal(t, 19, stored.ChannelId)
	assert.Equal(t, 45678, stored.Quota)
	assert.Equal(t, "auto-low", stored.Group)
	assert.Equal(t, int64(1_787_882_407), stored.FinishTime)
}

func TestRecordConsumeLogCreatesImageTaskWhenConsumeLoggingDisabled(t *testing.T) {
	truncateTables(t)
	gin.SetMode(gin.TestMode)

	previous := common.LogConsumeEnabled
	common.LogConsumeEnabled = false
	t.Cleanup(func() { common.LogConsumeEnabled = previous })

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", nil)
	c.Set(common.RequestIdKey, "req-log-disabled")
	common.SetContextKey(c, constant.ContextKeyRequestStartTime, time.Unix(1_787_882_500, 0))
	common.SetContextKey(c, constant.ContextKeyDrawingPrompt, "replace the sky")
	common.SetContextKey(c, constant.ContextKeyDrawingResultKeys, []string{"edited-image"})
	common.SetContextKey(c, constant.ContextKeyDrawingTaskResults, []taskdto.ImageTaskResult{{
		Status: taskdto.ImageTaskResultStatusAvailable, Key: "edited-image",
	}})

	RecordConsumeLog(c, 15, RecordConsumeLogParams{
		ChannelId:      27,
		ModelName:      "gpt-image-2",
		Quota:          61234,
		UseTimeSeconds: 9,
		Group:          "international",
		IsImage:        true,
		LogMode:        constant.TaskActionImagesEdit,
	})

	var taskCount int64
	require.NoError(t, DB.Model(&Task{}).Count(&taskCount).Error)
	assert.EqualValues(t, 1, taskCount)
	var logCount int64
	require.NoError(t, DB.Model(&Log{}).Count(&logCount).Error)
	assert.Zero(t, logCount, "disabling consume logs must still suppress the usage/drawing log pipeline")

	var stored Task
	require.NoError(t, DB.First(&stored).Error)
	assert.EqualValues(t, TaskStatusSuccess, stored.Status)
	assert.Equal(t, 61234, stored.Quota)
	assert.Equal(t, 27, stored.ChannelId)
	assert.Equal(t, constant.TaskActionImagesEdit, stored.Action)
	assert.Equal(t, "/api/drawing_logs/image/edited-image?variant=original", stored.GetResultURL())
}

func TestTerminalImageTasksNeverEnterUnfinishedPoller(t *testing.T) {
	truncateTables(t)

	_, err := UpsertTerminalImageTask(TerminalImageTaskParams{
		RequestID: "req-terminal-success", Action: constant.TaskActionImagesGeneration,
		Status: TaskStatusSuccess, SubmitTime: 100, FinishTime: 101,
	})
	require.NoError(t, err)
	_, err = UpsertTerminalImageTask(TerminalImageTaskParams{
		RequestID: "req-terminal-failure", Action: constant.TaskActionImagesEdit,
		Status: TaskStatusFailure, SubmitTime: 100, FinishTime: 101,
	})
	require.NoError(t, err)

	assert.Empty(t, GetAllUnFinishSyncTasks(100))
	assert.Empty(t, GetTimedOutUnfinishedTasks(200, 100))
	assert.False(t, HasUnfinishedSyncTasks())
}

func TestStableImageTaskID(t *testing.T) {
	a := StableImageTaskID("req-stable")
	b := StableImageTaskID("req-stable")
	c := StableImageTaskID("req-other")

	assert.Equal(t, a, b)
	assert.NotEqual(t, a, c)
	assert.Regexp(t, `^task_[0-9a-f]{32}$`, a)
	assert.Empty(t, StableImageTaskID(""))
}

func TestImageTaskFailureLogMessageIncludesRequestIdentityWithoutErrorDetails(t *testing.T) {
	message := ImageTaskFailureLogMessage("req-log-456", "materialization")

	assert.Equal(t, "image task operation failed request_id=req-log-456 operation=materialization", message)
	assert.NotContains(t, message, "http://")
	assert.NotContains(t, message, "https://")
}
