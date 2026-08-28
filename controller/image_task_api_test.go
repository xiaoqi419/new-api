package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type taskListAPIResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Total int              `json:"total"`
		Items []map[string]any `json:"items"`
	} `json:"data"`
}

func setupImageTaskAPITestDB(t *testing.T) *gorm.DB {
	t.Helper()

	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousMainDatabaseType, previousLogDatabaseType := common.MainDatabaseType(), common.LogDatabaseType()
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB, model.LOG_DB = db, db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Task{}))

	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func performTaskListRequest(t *testing.T, target string, userID int, handler gin.HandlerFunc) (*httptest.ResponseRecorder, taskListAPIResponse) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, target, nil)
	ctx.Set("id", userID)
	handler(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response taskListAPIResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	return recorder, response
}

func createImageTaskAPIUsers(t *testing.T, db *gorm.DB) (model.User, model.User) {
	t.Helper()

	users := []model.User{
		{Id: 101, Username: "image-task-owner", Password: "password", Group: "default", Status: common.UserStatusEnabled, AffCode: "image-task-owner-aff"},
		{Id: 202, Username: "other-image-user", Password: "password", Group: "default", Status: common.UserStatusEnabled, AffCode: "other-image-user-aff"},
	}
	require.NoError(t, db.Create(&users).Error)
	return users[0], users[1]
}

func imageTaskAPIFixture(taskID string, userID, channelID int) model.Task {
	return model.Task{
		TaskID:    taskID,
		Platform:  constant.TaskPlatformImage,
		UserId:    userID,
		Group:     "default",
		ChannelId: channelID,
		Quota:     1234,
		Action:    constant.TaskActionImagesGeneration,
		Status:    model.TaskStatusSuccess,
		Progress:  "100%",
		Properties: model.Properties{
			Input:           "safe prompt",
			OriginModelName: "gpt-image-2",
		},
		PrivateData: model.TaskPrivateData{
			Key:            "private-provider-key-should-not-leak",
			UpstreamTaskID: "upstream-task-id-should-not-leak",
			ResultURL:      "/api/drawing_logs/image/safe-capability?variant=original",
			BillingSource:  "private-billing-source-should-not-leak",
			SubscriptionId: 9876,
			TokenId:        5432,
			NodeName:       "private-node-name-should-not-leak",
			BillingContext: &model.TaskBillingContext{
				ModelPrice:      9.99,
				OriginModelName: "private-billing-model-should-not-leak",
			},
		},
		Data: []byte(`[{"status":"available","key":"safe-capability","thumbnail_url":"/api/drawing_logs/image/safe-capability","original_url":"/api/drawing_logs/image/safe-capability?variant=original"}]`),
	}
}

func assertTaskPrivateDataIsNotSerialized(t *testing.T, recorder *httptest.ResponseRecorder, item map[string]any) {
	t.Helper()

	for _, field := range []string{
		"private_data",
		"upstream_task_id",
		"billing_source",
		"subscription_id",
		"token_id",
		"node_name",
		"billing_context",
	} {
		assert.NotContains(t, item, field)
	}

	body := recorder.Body.String()
	for _, secret := range []string{
		"private-provider-key-should-not-leak",
		"upstream-task-id-should-not-leak",
		"private-billing-source-should-not-leak",
		"private-node-name-should-not-leak",
		"private-billing-model-should-not-leak",
	} {
		assert.NotContains(t, body, secret)
	}
}

func TestGetUserTaskScopesToAuthenticatedUserAndKeepsImageDataSafe(t *testing.T) {
	db := setupImageTaskAPITestDB(t)
	owner, other := createImageTaskAPIUsers(t, db)
	ownerTask := imageTaskAPIFixture("task-owned-image", owner.Id, 17)
	otherTask := imageTaskAPIFixture("task-other-image", other.Id, 29)
	require.NoError(t, db.Create(&[]model.Task{ownerTask, otherTask}).Error)

	recorder, response := performTaskListRequest(t, "/api/task/self?p=1&page_size=20", owner.Id, GetUserTask)
	require.Equal(t, 1, response.Data.Total)
	require.Len(t, response.Data.Items, 1)
	item := response.Data.Items[0]
	assert.Equal(t, ownerTask.TaskID, item["task_id"])
	assert.EqualValues(t, owner.Id, item["user_id"])
	assert.NotEqual(t, otherTask.TaskID, item["task_id"])
	assertTaskPrivateDataIsNotSerialized(t, recorder, item)
	assert.Equal(t, "/api/drawing_logs/image/safe-capability?variant=original", item["result_url"])

	data, ok := item["data"].([]any)
	require.True(t, ok)
	require.Len(t, data, 1)
	result, ok := data[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "available", result["status"])
	assert.Equal(t, "safe-capability", result["key"])
	assert.Equal(t, "/api/drawing_logs/image/safe-capability", result["thumbnail_url"])
	assert.Equal(t, "/api/drawing_logs/image/safe-capability?variant=original", result["original_url"])
}

func TestGetAllTaskKeepsAdminMetadataWithoutSerializingPrivateData(t *testing.T) {
	db := setupImageTaskAPITestDB(t)
	owner, other := createImageTaskAPIUsers(t, db)
	ownerTask := imageTaskAPIFixture("task-admin-owner-image", owner.Id, 41)
	otherTask := imageTaskAPIFixture("task-admin-other-image", other.Id, 42)
	require.NoError(t, db.Create(&[]model.Task{ownerTask, otherTask}).Error)

	recorder, response := performTaskListRequest(t, "/api/task/?p=1&page_size=20", 999, GetAllTask)
	require.Equal(t, 2, response.Data.Total)
	require.Len(t, response.Data.Items, 2)

	itemsByTaskID := make(map[string]map[string]any, len(response.Data.Items))
	for _, item := range response.Data.Items {
		taskID, ok := item["task_id"].(string)
		require.True(t, ok)
		itemsByTaskID[taskID] = item
		assertTaskPrivateDataIsNotSerialized(t, recorder, item)
	}

	ownerItem := itemsByTaskID[ownerTask.TaskID]
	require.NotNil(t, ownerItem)
	assert.EqualValues(t, owner.Id, ownerItem["user_id"])
	assert.EqualValues(t, ownerTask.ChannelId, ownerItem["channel_id"])
	assert.Equal(t, owner.Username, ownerItem["username"])
	assert.Equal(t, "/api/drawing_logs/image/safe-capability?variant=original", ownerItem["result_url"])

	otherItem := itemsByTaskID[otherTask.TaskID]
	require.NotNil(t, otherItem)
	assert.EqualValues(t, other.Id, otherItem["user_id"])
	assert.EqualValues(t, otherTask.ChannelId, otherItem["channel_id"])
	assert.Equal(t, other.Username, otherItem["username"])
}
