package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type topUpPageResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    struct {
		Page     int           `json:"page"`
		PageSize int           `json:"page_size"`
		Total    int           `json:"total"`
		Items    []model.TopUp `json:"items"`
	} `json:"data"`
}

func setupTopUpControllerTestDB(t *testing.T) *gorm.DB {
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
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}))

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

func performAdminTopUpQuery(t *testing.T, query string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup?"+query, nil)
	c.Set("id", 99)
	c.Set("role", common.RoleRootUser)
	GetAllTopUps(c)
	return recorder
}

func seedTopUpQueryUsersAndRows(t *testing.T, db *gorm.DB) {
	t.Helper()
	now := time.Now().Unix()
	require.NoError(t, db.Create(&[]model.User{
		{Id: 1, Username: "topup-query-user-one", Password: "password", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "topup-query-aff-one"},
		{Id: 2, Username: "topup-query-user-two", Password: "password", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "topup-query-aff-two"},
	}).Error)
	require.NoError(t, db.Create(&[]model.TopUp{
		{Id: 1, UserId: 1, CreateTime: now - 60*24*60*60, TradeNo: "u1-old"},
		{Id: 2, UserId: 1, CreateTime: now - 2*24*60*60, TradeNo: "u1-middle"},
		{Id: 3, UserId: 1, CreateTime: now - 24*60*60, TradeNo: "u1-new"},
		{Id: 4, UserId: 2, CreateTime: now - 12*60*60, TradeNo: "u2-new"},
	}).Error)
}

func decodeTopUpPage(t *testing.T, recorder *httptest.ResponseRecorder) topUpPageResponse {
	t.Helper()
	var response topUpPageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func TestGetAllTopUpsUserIDFiltersAndReturnsPaginationContract(t *testing.T) {
	db := setupTopUpControllerTestDB(t)
	seedTopUpQueryUsersAndRows(t, db)

	response := decodeTopUpPage(t, performAdminTopUpQuery(t, "user_id=1&p=2&page_size=2"))
	assert.True(t, response.Success)
	assert.Equal(t, 2, response.Data.Page)
	assert.Equal(t, 2, response.Data.PageSize)
	assert.Equal(t, 3, response.Data.Total)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "u1-old", response.Data.Items[0].TradeNo)
}

func TestGetAllTopUpsWithoutUserIDPreservesAllPlatformResults(t *testing.T) {
	db := setupTopUpControllerTestDB(t)
	seedTopUpQueryUsersAndRows(t, db)

	response := decodeTopUpPage(t, performAdminTopUpQuery(t, "p=1&page_size=2"))
	assert.True(t, response.Success)
	assert.Equal(t, 4, response.Data.Total)
	require.Len(t, response.Data.Items, 2)
	assert.Equal(t, []string{"u2-new", "u1-new"}, []string{response.Data.Items[0].TradeNo, response.Data.Items[1].TradeNo})
}

func TestGetAllTopUpsRejectsInvalidUserID(t *testing.T) {
	db := setupTopUpControllerTestDB(t)
	seedTopUpQueryUsersAndRows(t, db)

	for _, userID := range []string{"abc", "0", "-1", "18446744073709551615"} {
		response := decodeTopUpPage(t, performAdminTopUpQuery(t, "user_id="+userID))
		assert.False(t, response.Success, "user_id=%s", userID)
	}
}

func TestGetAllTopUpsRejectsTargetUserAtSameRole(t *testing.T) {
	db := setupTopUpControllerTestDB(t)
	seedTopUpQueryUsersAndRows(t, db)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/user/topup?user_id=1", nil)
	c.Set("id", 99)
	c.Set("role", common.RoleCommonUser)
	GetAllTopUps(c)

	response := decodeTopUpPage(t, recorder)
	assert.False(t, response.Success)
}
