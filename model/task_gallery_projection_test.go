package model

import (
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestTaskListsExposeOnlySafeImageGalleryData(t *testing.T) {
	truncateTables(t)
	tasks := []Task{
		{TaskID: "gallery-image", Platform: constant.TaskPlatformImage, UserId: 77, Data: []byte(`[{"status":"available","key":"local-key","thumbnail_url":"https://provider.invalid/secret","original_url":"https://provider.invalid/secret","provider_secret":"hidden"}]`)},
		{TaskID: "gallery-plugin", Platform: "task-plugin", UserId: 77, Data: []byte(`{"api_key":"plugin-private"}`)},
		{TaskID: "gallery-other-user", Platform: constant.TaskPlatformImage, UserId: 88, Data: []byte(`[{"status":"available","key":"other-user-key"}]`)},
	}
	require.NoError(t, DB.Create(&tasks).Error)
	user := TaskGetAllUserTask(77, 0, 20, SyncTaskQueryParams{})
	require.Len(t, user, 2)
	for _, task := range user {
		if task.Platform != constant.TaskPlatformImage {
			assert.Empty(t, task.Data)
			continue
		}
		assert.JSONEq(t, `[{"status":"available","key":"local-key","thumbnail_url":"/api/drawing_logs/image/local-key","original_url":"/api/drawing_logs/image/local-key?variant=original"}]`, string(task.Data))
		assert.NotContains(t, string(task.Data), "secret")
	}
	admin := TaskGetAllTasks(0, 20, SyncTaskQueryParams{})
	require.Len(t, admin, 3)
	for _, task := range admin {
		if task.Platform != constant.TaskPlatformImage {
			assert.Empty(t, task.Data)
		}
	}
}
