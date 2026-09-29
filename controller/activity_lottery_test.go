package controller

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useActivityLotteryControllerDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousQuotaPerUnit, previousRate := common.QuotaPerUnit, operation_setting.USDExchangeRate
	general := operation_setting.GetGeneralSetting()
	previousDisplayType := general.QuotaDisplayType
	previousCustomSymbol := general.CustomCurrencySymbol
	previousCustomRate := general.CustomCurrencyExchangeRate
	previousRedis := common.RedisEnabled
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.QuotaPerUnit, operation_setting.USDExchangeRate = 500_000, 7.3
	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
	general.CustomCurrencySymbol = "¤"
	general.CustomCurrencyExchangeRate = 1
	common.RedisEnabled = false
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB, model.LOG_DB = db, db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.Redemption{}, &model.Log{}, &model.ActivityLotteryCampaign{}, &model.ActivityLotteryPrize{}, &model.ActivityLotteryWinner{}))
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		common.QuotaPerUnit, operation_setting.USDExchangeRate = previousQuotaPerUnit, previousRate
		general.QuotaDisplayType = previousDisplayType
		general.CustomCurrencySymbol = previousCustomSymbol
		general.CustomCurrencyExchangeRate = previousCustomRate
		common.RedisEnabled = previousRedis
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestActivityLotteryCurrentEndpointShowsGiftStatusOnlyToWinner(t *testing.T) {
	db := useActivityLotteryControllerDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := model.CreateActivityLotteryDraft(model.ActivityLotteryDraftInput{
		Title: "充值抽奖", DrawAt: drawAt.Unix(),
		Prizes: []model.ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 50_000}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := model.PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	users := []model.User{
		{Username: "winner", AffCode: "winner-aff", Status: common.UserStatusEnabled},
		{Username: "other", AffCode: "other-aff", Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	require.NoError(t, db.Create(&model.TopUp{
		UserId: users[0].Id, TradeNo: "activity-paid", Status: common.TopUpStatusSuccess,
		Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + 1,
	}).Error)
	_, err = model.DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)

	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(previousMode) })
	request := func(userId int) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/activity/lottery/current", nil)
		ctx.Set("id", userId)
		GetActivityLotteryCurrent(ctx)
		return recorder
	}

	winnerResponse := request(users[0].Id)
	assert.Equal(t, http.StatusOK, winnerResponse.Code)
	assert.Contains(t, winnerResponse.Body.String(), `"granted":true`)
	otherResponse := request(users[1].Id)
	assert.Equal(t, http.StatusOK, otherResponse.Code)
	assert.NotContains(t, otherResponse.Body.String(), `"granted":true`)
	anonymousResponse := request(0)
	assert.Equal(t, http.StatusOK, anonymousResponse.Code)
	assert.NotContains(t, anonymousResponse.Body.String(), `"granted":true`)
}

func TestActivityLotteryAdminDraftIsPrivateUntilPublished(t *testing.T) {
	useActivityLotteryControllerDB(t)
	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(previousMode) })

	drawAt := time.Now().AddDate(0, 0, 10).Unix()
	requestBody, err := common.Marshal(model.ActivityLotteryDraftInput{
		Title: "充值抽奖", DrawAt: drawAt,
		Prizes: []model.ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 50_000}},
	})
	require.NoError(t, err)
	createRecorder := httptest.NewRecorder()
	createContext, _ := gin.CreateTestContext(createRecorder)
	createContext.Request = httptest.NewRequest(http.MethodPost, "/api/activity/lottery/admin/rounds", bytes.NewReader(requestBody))
	createContext.Request.Header.Set("Content-Type", "application/json")
	AdminCreateActivityLotteryCampaign(createContext)
	var created struct {
		Success bool                          `json:"success"`
		Data    model.ActivityLotteryCampaign `json:"data"`
	}
	require.NoError(t, common.Unmarshal(createRecorder.Body.Bytes(), &created))
	require.True(t, created.Success)
	assert.Equal(t, model.ActivityLotteryStatusDraft, created.Data.Status)

	beforeRecorder := httptest.NewRecorder()
	beforeContext, _ := gin.CreateTestContext(beforeRecorder)
	beforeContext.Request = httptest.NewRequest(http.MethodGet, "/api/activity/lottery/current", nil)
	GetActivityLotteryCurrent(beforeContext)
	assert.Contains(t, beforeRecorder.Body.String(), `"data":null`)

	publishRecorder := httptest.NewRecorder()
	publishContext, _ := gin.CreateTestContext(publishRecorder)
	publishContext.Params = gin.Params{{Key: "id", Value: strconv.Itoa(created.Data.Id)}}
	publishContext.Request = httptest.NewRequest(http.MethodPost, "/api/activity/lottery/admin/rounds/1/publish", nil)
	AdminPublishActivityLotteryCampaign(publishContext)
	var published struct {
		Success bool                          `json:"success"`
		Data    model.ActivityLotteryCampaign `json:"data"`
	}
	require.NoError(t, common.Unmarshal(publishRecorder.Body.Bytes(), &published))
	require.True(t, published.Success)
	assert.Equal(t, model.ActivityLotteryStatusOpen, published.Data.Status)
	assert.Greater(t, published.Data.Prizes[0].Quota, 0)
}

func TestAdminExportActivityLotteryWinnersReturnsUtf8CSV(t *testing.T) {
	db := useActivityLotteryControllerDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := model.CreateActivityLotteryDraft(model.ActivityLotteryDraftInput{
		Title: "导出测试", DrawAt: drawAt.Unix(), MinParticipants: 1,
		Prizes: []model.ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 500}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := model.PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	user := model.User{Username: "csv-winner", DisplayName: "=HYPERLINK(\"https://example.invalid\")", AffCode: "csv-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, db.Create(&model.TopUp{
		UserId: user.Id, TradeNo: "csv-topup", Status: common.TopUpStatusSuccess,
		Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + 1,
	}).Error)
	_, err = model.DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(campaign.Id)}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/activity/lottery/admin/rounds/1/winners/export", nil)
	AdminExportActivityLotteryWinners(ctx)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Header().Get("Content-Type"), "text/csv")
	assert.Contains(t, recorder.Header().Get("Content-Disposition"), "activity-lottery-winners-")
	body := recorder.Body.Bytes()
	assert.Equal(t, []byte{0xEF, 0xBB, 0xBF}, body[:3])
	assert.Contains(t, string(body), "'=HYPERLINK")
	assert.Contains(t, string(body), "一等奖")
	assert.Contains(t, string(body), "奖项金额（CNY）")
	assert.Contains(t, string(body), "5.00")
	assert.Contains(t, string(body), "+08:00")
}
