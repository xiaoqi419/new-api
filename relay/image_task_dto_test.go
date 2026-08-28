package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
)

func TestTaskModel2DtoKeepsImageResultsSafeAndFailureURLBlank(t *testing.T) {
	success := &model.Task{
		TaskID:   "task_image_success",
		Platform: constant.TaskPlatformImage,
		Status:   model.TaskStatusSuccess,
		PrivateData: model.TaskPrivateData{
			Key:       "provider-secret",
			ResultURL: "/api/drawing_logs/image/key?variant=original",
		},
		Data: []byte(`[{"status":"available","key":"key","thumbnail_url":"/api/drawing_logs/image/key","original_url":"/api/drawing_logs/image/key?variant=original"}]`),
	}
	dto := TaskModel2Dto(success)
	assert.Equal(t, success.PrivateData.ResultURL, dto.ResultURL)
	assert.JSONEq(t, string(success.Data), string(dto.Data))

	failure := &model.Task{
		TaskID:     "task_image_failure",
		Platform:   constant.TaskPlatformImage,
		Status:     model.TaskStatusFailure,
		FailReason: "upstream unavailable",
	}
	assert.Empty(t, TaskModel2Dto(failure).ResultURL)
}

func TestTaskModel2DtoPreservesLegacyVideoResultFallback(t *testing.T) {
	legacyVideo := &model.Task{
		TaskID:     "task_legacy_video",
		Platform:   "kling",
		Status:     model.TaskStatusSuccess,
		FailReason: "https://example.com/legacy-video.mp4",
	}
	assert.Equal(t, legacyVideo.FailReason, TaskModel2Dto(legacyVideo).ResultURL)
}
