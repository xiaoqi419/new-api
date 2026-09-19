package controller

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type announcementListResponse struct {
	Success bool                 `json:"success"`
	Data    []model.Announcement `json:"data"`
}

type announcementPageResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Items    []model.Announcement `json:"items"`
		Total    int                  `json:"total"`
		Page     int                  `json:"page"`
		PageSize int                  `json:"page_size"`
	} `json:"data"`
}

type announcementDetailResponse struct {
	Success bool               `json:"success"`
	Data    model.Announcement `json:"data"`
}

func useAnnouncementControllerDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Announcement{}))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		assert.NoError(t, sqlDB.Close())
	})
	return db
}

func performPublicAnnouncementRequest(t *testing.T, path string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(previousMode) })
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, path, nil)
	handler(ctx)
	return recorder
}

func TestPublicAnnouncementsExcludeDraftAndScheduled(t *testing.T) {
	db := useAnnouncementControllerDB(t)
	now := common.GetTimestamp()
	require.NoError(t, db.Create([]model.Announcement{
		{Title: "past", Type: model.AnnouncementTypeSystem, Published: true, PublishTime: now - 60},
		{Title: "current", Type: model.AnnouncementTypeSystem, Published: true, PublishTime: now},
		{Title: "scheduled", Type: model.AnnouncementTypeSystem, Published: true, PublishTime: now + 3600},
		{Title: "draft", Type: model.AnnouncementTypeSystem, Published: false, PublishTime: now - 60},
	}).Error)

	recorder := performPublicAnnouncementRequest(t, "/api/announcements", GetAnnouncements)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response announcementListResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data, 2)
	assert.Equal(t, []string{"current", "past"}, []string{response.Data[0].Title, response.Data[1].Title})
}

func TestPublicAnnouncementDetailRequiresPublishedPastOrCurrent(t *testing.T) {
	db := useAnnouncementControllerDB(t)
	now := common.GetTimestamp()
	announcements := []model.Announcement{
		{Title: "past", Type: model.AnnouncementTypeSystem, Published: true, PublishTime: now - 60},
		{Title: "current", Type: model.AnnouncementTypeSystem, Published: true, PublishTime: now},
		{Title: "scheduled", Type: model.AnnouncementTypeSystem, Published: true, PublishTime: now + 3600},
		{Title: "draft", Type: model.AnnouncementTypeSystem, Published: false, PublishTime: now - 60},
	}
	require.NoError(t, db.Create(&announcements).Error)

	for _, test := range []struct {
		name    string
		id      int
		success bool
	}{
		{name: "past", id: announcements[0].Id, success: true},
		{name: "current", id: announcements[1].Id, success: true},
		{name: "scheduled", id: announcements[2].Id, success: false},
		{name: "draft", id: announcements[3].Id, success: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			id := strconv.Itoa(test.id)
			ctx.Params = gin.Params{{Key: "id", Value: id}}
			ctx.Request = httptest.NewRequest(http.MethodGet, "/api/announcements/detail/"+id, nil)
			GetAnnouncement(ctx)

			var response announcementDetailResponse
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.Equal(t, test.success, response.Success)
		})
	}
}

func TestAdminAnnouncementDetailIncludesDraftAndScheduled(t *testing.T) {
	db := useAnnouncementControllerDB(t)
	now := common.GetTimestamp()
	announcements := []model.Announcement{
		{Title: "scheduled", Type: model.AnnouncementTypeSystem, Published: true, PublishTime: now + 3600},
		{Title: "draft", Type: model.AnnouncementTypeSystem, Published: false, PublishTime: now - 60},
	}
	require.NoError(t, db.Create(&announcements).Error)

	for _, announcement := range announcements {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		id := strconv.Itoa(announcement.Id)
		ctx.Params = gin.Params{{Key: "id", Value: id}}
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/announcement/detail/"+id, nil)
		AdminGetAnnouncement(ctx)

		var response announcementDetailResponse
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		assert.True(t, response.Success)
		assert.Equal(t, announcement.Title, response.Data.Title)
	}
}

func TestPublicAnnouncementsPaginationFiltersModalAndPreservesOrdering(t *testing.T) {
	db := useAnnouncementControllerDB(t)
	now := common.GetTimestamp()
	require.NoError(t, db.Create([]model.Announcement{
		{Title: "modal pinned", Type: model.AnnouncementTypeSystem, Level: "modal", Pinned: true, Published: true, PublishTime: now - 120},
		{Title: "modal newest", Type: model.AnnouncementTypeSystem, Level: "modal", Published: true, PublishTime: now},
		{Title: "modal older", Type: model.AnnouncementTypeSystem, Level: "modal", Published: true, PublishTime: now - 60},
		{Title: "ordinary pinned", Type: model.AnnouncementTypeSystem, Level: model.AnnouncementLevelDefault, Pinned: true, Published: true, PublishTime: now},
		{Title: "modal scheduled", Type: model.AnnouncementTypeSystem, Level: "modal", Pinned: true, Published: true, PublishTime: now + 3600},
		{Title: "modal draft", Type: model.AnnouncementTypeSystem, Level: "modal", Published: false, PublishTime: now},
	}).Error)

	recorder := performPublicAnnouncementRequest(t, "/api/announcements?p=1&page_size=2&type=system&level=modal", GetAnnouncements)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response announcementPageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.Equal(t, 3, response.Data.Total)
	assert.Equal(t, 1, response.Data.Page)
	assert.Equal(t, 2, response.Data.PageSize)
	require.Len(t, response.Data.Items, 2)
	assert.Equal(t, []string{"modal pinned", "modal newest"}, []string{response.Data.Items[0].Title, response.Data.Items[1].Title})

	recorder = performPublicAnnouncementRequest(t, "/api/announcements?p=2&page_size=2&type=system&level=modal", GetAnnouncements)
	require.Equal(t, http.StatusOK, recorder.Code)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "modal older", response.Data.Items[0].Title)
}

func TestAnnouncementModalLevelCanBeSaved(t *testing.T) {
	useAnnouncementControllerDB(t)
	announcement := model.Announcement{
		Title: "Important maintenance",
		Type:  model.AnnouncementTypeSystem,
		Level: "modal",
	}

	require.NoError(t, announcement.Insert())
	announcement.Title = "Updated maintenance"
	require.NoError(t, announcement.Update())

	stored, err := model.GetAnnouncementById(announcement.Id)
	require.NoError(t, err)
	assert.Equal(t, model.AnnouncementLevelModal, stored.Level)
	assert.Equal(t, announcement.Title, stored.Title)
}
