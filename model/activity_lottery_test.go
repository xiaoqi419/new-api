package model

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupActivityLotteryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB, previousLogDB := DB, LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousQuotaPerUnit := common.QuotaPerUnit
	previousUSDRate := operation_setting.USDExchangeRate
	general := operation_setting.GetGeneralSetting()
	previousDisplayType := general.QuotaDisplayType
	previousCustomSymbol := general.CustomCurrencySymbol
	previousCustomRate := general.CustomCurrencyExchangeRate
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
	general.CustomCurrencySymbol = "¤"
	general.CustomCurrencyExchangeRate = 1

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	DB, LOG_DB = db, db
	require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}, &Redemption{}, &Log{}, &ActivityLotteryCampaign{}, &ActivityLotteryPrize{}, &ActivityLotteryWinner{}))

	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		common.QuotaPerUnit = previousQuotaPerUnit
		operation_setting.USDExchangeRate = previousUSDRate
		general.QuotaDisplayType = previousDisplayType
		general.CustomCurrencySymbol = previousCustomSymbol
		general.CustomCurrencyExchangeRate = previousCustomRate
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestActivityLotteryParticipationCountsSuccessfulWalletTopupsOncePerAccount(t *testing.T) {
	db := setupTopUpQueryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	start := time.Date(2026, time.September, 28, 0, 0, 0, 0, shanghai).Unix()
	end := start + 24*60*60
	campaign := &ActivityLotteryCampaign{QualificationStartAt: start, QualificationEndAt: end}

	topups := []TopUp{
		{UserId: 1, TradeNo: "wallet-first", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: start + 1},
		{UserId: 1, TradeNo: "wallet-repeat", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: start + 2},
		{UserId: 2, TradeNo: "wallet-second", Status: common.TopUpStatusSuccess, Amount: 2, Money: 10, CompleteTime: end - 1},
		{UserId: 3, TradeNo: "pending", Status: common.TopUpStatusPending, Amount: 1, Money: 5, CompleteTime: start + 3},
		{UserId: 4, TradeNo: "before-day", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: start - 1},
		{UserId: 5, TradeNo: "after-day", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: end},
		{UserId: 6, TradeNo: "subscription", Status: common.TopUpStatusSuccess, Amount: 0, Money: 5, CompleteTime: start + 4},
		{UserId: 7, TradeNo: "groupbuy", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, GroupBuyId: 10, CompleteTime: start + 5},
		{UserId: 8, TradeNo: "agent-prepay", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, AgentPrepayId: 10, CompleteTime: start + 6},
		{UserId: 9, TradeNo: "free-credit", Status: common.TopUpStatusSuccess, Amount: 1, Money: 0, CompleteTime: start + 7},
		{UserId: 0, TradeNo: "orphaned-topup", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: start + 8},
	}
	require.NoError(t, db.Create(&topups).Error)

	count, joined, err := GetActivityLotteryParticipation(campaign, 1)
	require.NoError(t, err)
	assert.EqualValues(t, 2, count)
	assert.True(t, joined)

	_, joined, err = GetActivityLotteryParticipation(campaign, 3)
	require.NoError(t, err)
	assert.False(t, joined)
}

func TestActivityLotteryPublishFreezesBeijingDayAndYuanPrizeQuotas(t *testing.T) {
	setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, time.October, 7, 15, 30, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:           "充值抽奖",
		Description:     "活动发布当天充值自动参与",
		DrawAt:          drawAt.Unix(),
		MinParticipants: 4,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000},
			{Name: "二等奖", Count: 3, AmountCents: 20_000},
		},
	}, now)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDraft, draft.Status)

	published, err := PublishActivityLotteryCampaign(draft.Id, now)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusOpen, published.Status)
	assert.Equal(t, time.Date(2026, time.October, 7, 0, 0, 0, 0, shanghai).Unix(), published.QualificationStartAt)
	assert.Equal(t, drawAt.Unix(), published.QualificationEndAt)
	assert.Equal(t, now.Unix(), published.PublishedAt)
	assert.Equal(t, 7.3, published.USDExchangeRate)
	assert.Equal(t, 500_000.0, published.QuotaPerUnit)
	assert.Equal(t, operation_setting.QuotaDisplayTypeCNY, published.DisplayCurrency)
	assert.Equal(t, "¥", published.DisplayCurrencySymbol)
	assert.Equal(t, 7.3, published.DisplayCurrencyRate)
	require.Len(t, published.Prizes, 2)
	assert.Equal(t, 34_246_575, published.Prizes[0].Quota)
	assert.Equal(t, 13_698_630, published.Prizes[1].Quota)
}

func TestActivityLotteryPublishUsesConfiguredUSDCurrency(t *testing.T) {
	setupActivityLotteryTestDB(t)
	general := operation_setting.GetGeneralSetting()
	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	shanghai := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, time.October, 7, 15, 30, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "美元抽奖", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 50_000}},
	}, now)
	require.NoError(t, err)
	assert.Equal(t, operation_setting.QuotaDisplayTypeUSD, draft.DisplayCurrency)
	assert.Equal(t, "$", draft.DisplayCurrencySymbol)
	assert.Equal(t, float64(1), draft.DisplayCurrencyRate)

	published, err := PublishActivityLotteryCampaign(draft.Id, now)
	require.NoError(t, err)
	assert.Equal(t, 250_000_000, published.Prizes[0].Quota)
	assert.Equal(t, operation_setting.QuotaDisplayTypeUSD, published.DisplayCurrency)
	assert.Equal(t, "$", published.DisplayCurrencySymbol)
	assert.Equal(t, float64(1), published.DisplayCurrencyRate)
}

func TestActivityLotteryPublishUsesConfiguredCustomCurrencyAndTokens(t *testing.T) {
	setupActivityLotteryTestDB(t)
	general := operation_setting.GetGeneralSetting()
	shanghai := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, time.October, 7, 15, 30, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeCustom
	general.CustomCurrencySymbol = "€"
	general.CustomCurrencyExchangeRate = 2.5
	customDraft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "自定义币种抽奖", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 50_000}},
	}, now)
	require.NoError(t, err)
	custom, err := PublishActivityLotteryCampaign(customDraft.Id, now)
	require.NoError(t, err)
	assert.Equal(t, 100_000_000, custom.Prizes[0].Quota)
	assert.Equal(t, "€", custom.DisplayCurrencySymbol)
	assert.Equal(t, 2.5, custom.DisplayCurrencyRate)

	_, err = CancelActivityLotteryCampaign(custom.Id, now.Add(time.Minute))
	require.NoError(t, err)
	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
	tokenDraft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "额度抽奖", DrawAt: drawAt.Add(time.Hour).Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 1234}},
	}, now)
	require.NoError(t, err)
	tokens, err := PublishActivityLotteryCampaign(tokenDraft.Id, now.Add(time.Minute))
	require.NoError(t, err)
	assert.Equal(t, 1234, tokens.Prizes[0].Quota)
	assert.Equal(t, operation_setting.QuotaDisplayTypeTokens, tokens.DisplayCurrency)
	assert.Empty(t, tokens.DisplayCurrencySymbol)
}

func TestActivityLotteryLegacyRowsRemainCNYWhenCurrencySnapshotIsEmpty(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	campaign := &ActivityLotteryCampaign{
		Title: "历史活动", Status: ActivityLotteryStatusDrawn,
		PublishedAt: 1, USDExchangeRate: 7.3,
	}
	require.NoError(t, db.Create(campaign).Error)

	loaded, err := GetActivityLotteryCampaignById(campaign.Id)
	require.NoError(t, err)
	assert.Equal(t, operation_setting.QuotaDisplayTypeCNY, loaded.DisplayCurrency)
	assert.Equal(t, "¥", loaded.DisplayCurrencySymbol)
	assert.Equal(t, 7.3, loaded.DisplayCurrencyRate)
	assert.Equal(t, "¥500.00", FormatActivityLotteryAmount(loaded, 50_000))
}

func TestActivityLotterySelectedStartIncludesEarlierTopupsUntilDraw(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	startAt := time.Date(2026, time.September, 28, 0, 0, 0, 0, shanghai)
	publishedAt := time.Date(2026, time.September, 29, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "跨日充值抽奖", QualificationStartAt: startAt.Unix(), DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	assert.Equal(t, startAt.Unix(), campaign.QualificationStartAt)
	assert.Equal(t, drawAt.Unix(), campaign.QualificationEndAt)

	require.NoError(t, db.Create(&[]TopUp{
		{UserId: 1, TradeNo: "before-start", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: startAt.Add(-time.Second).Unix()},
		{UserId: 2, TradeNo: "start-boundary", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: startAt.Unix()},
		{UserId: 3, TradeNo: "after-publication", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: publishedAt.Add(time.Hour).Unix()},
		{UserId: 4, TradeNo: "before-draw", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: drawAt.Add(-time.Second).Unix()},
		{UserId: 5, TradeNo: "at-draw", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: drawAt.Unix()},
	}).Error)

	count, joined, err := GetActivityLotteryParticipation(campaign, 2)
	require.NoError(t, err)
	assert.EqualValues(t, 3, count)
	assert.True(t, joined)
	_, joined, err = GetActivityLotteryParticipation(campaign, 4)
	require.NoError(t, err)
	assert.True(t, joined)
	_, joined, err = GetActivityLotteryParticipation(campaign, 1)
	require.NoError(t, err)
	assert.False(t, joined)
	_, joined, err = GetActivityLotteryParticipation(campaign, 5)
	require.NoError(t, err)
	assert.False(t, joined)
}

func TestActivityLotteryStartMustBeBeijingMidnightBeforeDraw(t *testing.T) {
	setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, time.September, 29, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	input := ActivityLotteryDraftInput{
		Title: "充值抽奖", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}
	for _, startAt := range []int64{
		time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai).Unix(),
		drawAt.Unix(),
		time.Date(2026, time.September, 30, 0, 0, 0, 0, shanghai).Unix(),
	} {
		input.QualificationStartAt = startAt
		_, err := CreateActivityLotteryDraft(input, now)
		require.Error(t, err)
	}
}

func TestActivityLotteryDraftChangesBeforePublishButLocksRulesAfterPublish(t *testing.T) {
	setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "原活动", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 50_000}},
	}, now)
	require.NoError(t, err)

	change := ActivityLotteryDraftInput{
		Title: "充值活动", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 2, AmountCents: 20_000}},
	}
	updated, err := UpdateActivityLotteryDraft(draft.Id, change, now.Add(time.Minute))
	require.NoError(t, err)
	assert.Equal(t, "充值活动", updated.Title)
	require.Len(t, updated.Prizes, 1)
	assert.Equal(t, 2, updated.Prizes[0].Count)

	_, err = PublishActivityLotteryCampaign(draft.Id, now.Add(2*time.Minute))
	require.NoError(t, err)
	change.Title = "偷偷改奖项"
	_, err = UpdateActivityLotteryDraft(draft.Id, change, now.Add(3*time.Minute))
	require.Error(t, err)
	stored, err := GetActivityLotteryCampaignById(draft.Id)
	require.NoError(t, err)
	assert.Equal(t, "充值活动", stored.Title)
	assert.Equal(t, 2, stored.Prizes[0].Count)
}

func TestActivityLotteryDueDrawCreditsUniqueWinnersExactlyOnce(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 15, 30, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:           "充值抽奖",
		DrawAt:          drawAt.Unix(),
		MinParticipants: 4,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000},
			{Name: "二等奖", Count: 3, AmountCents: 20_000},
		},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)

	users := []User{
		{Username: "raffle-1", AffCode: "raffle-aff-1", Status: common.UserStatusEnabled},
		{Username: "raffle-2", AffCode: "raffle-aff-2", Status: common.UserStatusEnabled},
		{Username: "raffle-3", AffCode: "raffle-aff-3", Status: common.UserStatusEnabled},
		{Username: "raffle-4", AffCode: "raffle-aff-4", Status: common.UserStatusEnabled},
		{Username: "raffle-5", AffCode: "raffle-aff-5", Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	topups := make([]TopUp, 0, len(users))
	for i, user := range users {
		topups = append(topups, TopUp{
			UserId: user.Id, TradeNo: fmt.Sprintf("raffle-topup-%d", i+1),
			Status: common.TopUpStatusSuccess, Amount: 1, Money: 5,
			CompleteTime: campaign.QualificationStartAt + int64(i+1),
		})
	}
	require.NoError(t, db.Create(&topups).Error)

	_, err = DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt.Add(-time.Second))
	require.Error(t, err)
	var codeCount int64
	require.NoError(t, db.Model(&Redemption{}).Count(&codeCount).Error)
	assert.Zero(t, codeCount)

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)
	assert.EqualValues(t, 5, drawn.ParticipantCount)
	assert.Equal(t, drawAt.Unix(), drawn.DrawnAt)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&winners).Error)
	require.Len(t, winners, 4)
	winningUsers := make(map[int]bool, len(winners))
	prizeCounts := map[string]int{}
	for _, winner := range winners {
		assert.False(t, winningUsers[winner.UserId])
		winningUsers[winner.UserId] = true
		prizeCounts[winner.PrizeName]++

		assert.Equal(t, ActivityLotteryGrantStatusGranted, winner.CreditStatus)
		assert.Greater(t, winner.GrantedAt, int64(0))
		assert.Equal(t, winner.Quota, readUserQuotaForActivityLotteryTest(t, db, winner.UserId))
	}
	assert.Equal(t, map[string]int{"一等奖": 1, "二等奖": 3}, prizeCounts)

	_, err = DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt.Add(time.Minute))
	require.NoError(t, err)
	require.NoError(t, db.Model(&Redemption{}).Count(&codeCount).Error)
	assert.Zero(t, codeCount)
}

func TestActivityLotteryDrawAutomaticallyCreditsWinnerAsActivityGift(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "自动赠金抽奖", DrawAt: drawAt.Unix(), MinParticipants: 1,
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 500}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	user := &User{Username: "activity-gift-winner", AffCode: "activity-gift-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(user).Error)
	require.NoError(t, db.Create(&TopUp{
		UserId: user.Id, TradeNo: "activity-gift-topup", Status: common.TopUpStatusSuccess,
		Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + 1,
	}).Error)

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	require.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)

	var winner ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).First(&winner).Error)
	assert.Equal(t, ActivityLotteryGrantStatusGranted, winner.CreditStatus)
	assert.Greater(t, winner.GrantedAt, int64(0))
	assert.Equal(t, winner.Quota, readUserQuotaForActivityLotteryTest(t, db, user.Id))
	var giftLog Log
	require.NoError(t, db.Where("user_id = ? AND type = ?", user.Id, LogTypeTopup).First(&giftLog).Error)
	assert.Contains(t, giftLog.Content, "活动赠金到账")

	var codeCount int64
	require.NoError(t, db.Model(&Redemption{}).Count(&codeCount).Error)
	assert.Zero(t, codeCount)
}

func readUserQuotaForActivityLotteryTest(t *testing.T, db *gorm.DB, userId int) int {
	t.Helper()
	var user User
	require.NoError(t, db.Select("quota").First(&user, userId).Error)
	return user.Quota
}

func TestActivityLotteryConcurrentDrawsCannotDuplicateWinners(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "并发开奖", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	user := &User{Username: "concurrent-draw-winner", AffCode: "concurrent-draw-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(user).Error)
	require.NoError(t, db.Create(&TopUp{
		UserId: user.Id, TradeNo: "concurrent-draw-topup", Status: common.TopUpStatusSuccess,
		Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + 1,
	}).Error)

	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)
	for range 2 {
		go func() {
			defer wg.Done()
			<-start
			_, _ = DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
		}()
	}
	close(start)
	wg.Wait()

	// A contender may receive SQLite's lock error; the scheduler retries it.
	finalized, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDrawn, finalized.Status)
	var winnerCount, codeCount int64
	require.NoError(t, db.Model(&ActivityLotteryWinner{}).Count(&winnerCount).Error)
	require.NoError(t, db.Model(&Redemption{}).Count(&codeCount).Error)
	assert.EqualValues(t, 1, winnerCount)
	assert.Zero(t, codeCount)
}

func TestActivityLotteryDrawsWhenParticipantsFallShortOfPrizes(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:  "充值抽奖",
		DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000},
			{Name: "二等奖", Count: 3, AmountCents: 20_000},
		},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	assert.Equal(t, 4, campaign.MinParticipants)

	// Three accounts qualify for four slots. The round must still draw and
	// leave the fourth slot unawarded instead of ending without a draw.
	accounts := []struct{ name, trade string }{
		{"short-one", "short-topup-one"},
		{"short-two", "short-topup-two"},
		{"short-three", "short-topup-three"},
	}
	for i, account := range accounts {
		user := &User{Username: account.name, AffCode: account.name + "-aff", Status: common.UserStatusEnabled}
		require.NoError(t, db.Create(user).Error)
		require.NoError(t, db.Create(&TopUp{
			UserId: user.Id, TradeNo: account.trade, Status: common.TopUpStatusSuccess,
			Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + int64(i) + 1,
		}).Error)
	}

	result, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDrawn, result.Status)
	assert.EqualValues(t, 3, result.ParticipantCount)
	assert.NotZero(t, result.DrawnAt)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Order("id asc").Find(&winners).Error)
	require.Len(t, winners, 3)
	assert.Equal(t, "一等奖", winners[0].PrizeName)
	assert.Equal(t, "二等奖", winners[1].PrizeName)
	assert.Equal(t, "二等奖", winners[2].PrizeName)

	seen := map[int]bool{}
	for _, winner := range winners {
		assert.False(t, seen[winner.UserId], "a user must not win twice")
		seen[winner.UserId] = true
	}
}

func TestActivityLotteryDrawsWithNoParticipantsAtAll(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:  "无人参与",
		DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 500}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)

	// An empty pool must still finalize as drawn with zero winners rather than
	// panicking on an out-of-range slot lookup.
	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)
	assert.Zero(t, drawn.ParticipantCount)

	var winnerCount int64
	require.NoError(t, db.Model(&ActivityLotteryWinner{}).
		Where("campaign_id = ?", campaign.Id).Count(&winnerCount).Error)
	assert.Zero(t, winnerCount)
}

func TestActivityLotteryPerTierDesignatedUsersTakeTheirOwnTier(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	topTier := &User{Username: "tier-top", AffCode: "tier-top-aff", Status: common.UserStatusEnabled}
	secondTier := &User{Username: "tier-second", AffCode: "tier-second-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(topTier).Error)
	require.NoError(t, db.Create(secondTier).Error)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:           "档位级指定",
		DrawAt:          drawAt.Unix(),
		MinParticipants: 3,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000, DesignatedUserId: topTier.Id},
			{Name: "二等奖", Count: 2, AmountCents: 20_000, DesignatedUserId: secondTier.Id},
		},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)

	// The second tier keeps one random slot after the designation, so a single
	// qualified account should take it.
	participant := &User{Username: "tier-random", AffCode: "tier-random-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(participant).Error)
	require.NoError(t, db.Create(&TopUp{
		UserId: participant.Id, TradeNo: "tier-random-topup", Status: common.TopUpStatusSuccess,
		Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + 1,
	}).Error)

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	require.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Order("id asc").Find(&winners).Error)
	require.Len(t, winners, 3)

	tierOf := map[int]string{}
	for _, winner := range winners {
		assert.False(t, tierOf[winner.UserId] != "", "no account wins twice")
		tierOf[winner.UserId] = winner.PrizeName
	}
	assert.Equal(t, "一等奖", tierOf[topTier.Id])
	assert.Equal(t, "二等奖", tierOf[secondTier.Id])
	assert.Equal(t, "二等奖", tierOf[participant.Id])

	// Both designated accounts count as participants even without a top-up.
	assert.EqualValues(t, 3, drawn.ParticipantCount)
}

func TestActivityLotteryRejectsDuplicateTierDesignatedUser(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	repeated := &User{Username: "tier-repeat", AffCode: "tier-repeat-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(repeated).Error)

	_, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:           "重复指定",
		DrawAt:          drawAt.Unix(),
		MinParticipants: 2,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000, DesignatedUserId: repeated.Id},
			{Name: "二等奖", Count: 1, AmountCents: 20_000, DesignatedUserId: repeated.Id},
		},
	}, publishedAt)
	require.Error(t, err, "the same account must not be designated twice")

	// An unknown account is rejected as well.
	_, err = CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:           "未知指定",
		DrawAt:          drawAt.Unix(),
		MinParticipants: 1,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000, DesignatedUserId: 999_999},
		},
	}, publishedAt)
	require.Error(t, err, "an unknown designated account must be rejected")
}

func TestActivityLotteryDesignatedAccountAlsoInPoolWinsOnlyOnce(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	// This account both qualifies through a top-up and is designated. It must
	// be excluded from the random sample, otherwise the second win would
	// collide with the winner table's unique index and fail the whole draw.
	both := &User{Username: "tier-both", AffCode: "tier-both-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(both).Error)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:           "既参与又指定",
		DrawAt:          drawAt.Unix(),
		MinParticipants: 3,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000, DesignatedUserId: both.Id},
			{Name: "二等奖", Count: 2, AmountCents: 20_000},
		},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	require.NoError(t, db.Create(&TopUp{
		UserId: both.Id, TradeNo: "tier-both-topup", Status: common.TopUpStatusSuccess,
		Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + 1,
	}).Error)

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	require.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&winners).Error)
	require.Len(t, winners, 1, "only the designated account qualified once")
	assert.Equal(t, both.Id, winners[0].UserId)
	assert.Equal(t, "一等奖", winners[0].PrizeName)
	// The account is counted once even though it is both designated and qualified.
	assert.EqualValues(t, 1, drawn.ParticipantCount)
}

func TestActivityLotteryLegacyCampaignFieldStillTargetsTopTier(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	legacy := &User{Username: "legacy-designated", AffCode: "legacy-designated-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(legacy).Error)

	// Campaigns stored before per-tier designation keep their behaviour: the
	// campaign level field still reserves the top tier.
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:            "旧字段兼容",
		DrawAt:           drawAt.Unix(),
		MinParticipants:  2,
		DesignatedUserId: legacy.Id,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000},
			{Name: "二等奖", Count: 1, AmountCents: 20_000},
		},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	require.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&winners).Error)
	require.Len(t, winners, 1)
	assert.Equal(t, legacy.Id, winners[0].UserId)
	assert.Equal(t, "一等奖", winners[0].PrizeName)
}

func TestActivityLotteryDueCampaignIsScheduledOnlyUntilItIsFinalized(t *testing.T) {
	setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "定时抽奖", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 50_000}},
	}, publishedAt)
	require.NoError(t, err)
	_, err = PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)

	due, err := HasDueActivityLotteryCampaign(drawAt.Add(-time.Second))
	require.NoError(t, err)
	assert.False(t, due)
	due, err = HasDueActivityLotteryCampaign(drawAt)
	require.NoError(t, err)
	assert.True(t, due)
	ids, err := ListDueActivityLotteryCampaignIds(drawAt, 10)
	require.NoError(t, err)
	assert.Equal(t, []int{draft.Id}, ids)

	_, err = DrawActivityLotteryCampaign(context.Background(), draft.Id, drawAt)
	require.NoError(t, err)
	due, err = HasDueActivityLotteryCampaign(drawAt.Add(time.Second))
	require.NoError(t, err)
	assert.False(t, due)
}

func TestActivityLotteryResultShowsGiftOnlyToItsWinner(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "充值抽奖", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 50_000}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	users := []User{
		{Username: "raffle-winner", AffCode: "raffle-winner-aff", Status: common.UserStatusEnabled},
		{Username: "raffle-bystander", AffCode: "raffle-bystander-aff", Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	require.NoError(t, db.Create(&TopUp{
		UserId: users[0].Id, TradeNo: "winner-topup", Status: common.TopUpStatusSuccess,
		Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + 1,
	}).Error)
	_, err = DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)

	winnerView, err := GetActivityLotteryPublicView(campaign.Id, users[0].Id, drawAt)
	require.NoError(t, err)
	require.NotNil(t, winnerView.MyPrize)
	assert.Equal(t, "一等奖", winnerView.MyPrize.Name)
	assert.True(t, winnerView.MyPrize.Granted)
	assert.Equal(t, 34_246_575, winnerView.MyPrize.Quota)
	assert.EqualValues(t, 1, winnerView.ParticipantCount)
	assert.True(t, winnerView.Joined)

	otherView, err := GetActivityLotteryPublicView(campaign.Id, users[1].Id, drawAt)
	require.NoError(t, err)
	assert.Nil(t, otherView.MyPrize)
	assert.False(t, otherView.Joined)
	require.Len(t, otherView.Winners, 1)
	assert.Positive(t, otherView.Winners[0].Id)
	assert.NotContains(t, otherView.Winners[0].MaskedName, "raffle-winner")
	publicJSON, err := common.Marshal(otherView)
	require.NoError(t, err)
	assert.NotContains(t, string(publicJSON), "activity-gift-winner")
}

func TestActivityLotteryCurrentPrefersOpenCampaignAndIgnoresDrafts(t *testing.T) {
	setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	firstDay := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	firstDrawAt := time.Date(2026, time.September, 30, 0, 0, 0, 0, shanghai)
	first, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "已结束", DrawAt: firstDrawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}, firstDay)
	require.NoError(t, err)
	_, err = PublishActivityLotteryCampaign(first.Id, firstDay)
	require.NoError(t, err)
	_, err = DrawActivityLotteryCampaign(context.Background(), first.Id, firstDrawAt)
	require.NoError(t, err)

	secondDay := time.Date(2026, time.October, 1, 12, 0, 0, 0, shanghai)
	secondDrawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	second, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "进行中", DrawAt: secondDrawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}, secondDay)
	require.NoError(t, err)
	_, err = PublishActivityLotteryCampaign(second.Id, secondDay)
	require.NoError(t, err)
	_, err = CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title: "未发布", DrawAt: secondDrawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}, secondDay)
	require.NoError(t, err)

	current, err := GetCurrentPublishedActivityLotteryCampaign()
	require.NoError(t, err)
	assert.Equal(t, second.Id, current.Id)
	assert.Equal(t, ActivityLotteryStatusOpen, current.Status)
}

func TestActivityLotteryOnlyOneCampaignCanBeOpenUntilCancellation(t *testing.T) {
	setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)
	input := ActivityLotteryDraftInput{
		Title: "充值抽奖", DrawAt: drawAt.Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}
	first, err := CreateActivityLotteryDraft(input, now)
	require.NoError(t, err)
	second, err := CreateActivityLotteryDraft(input, now)
	require.NoError(t, err)
	_, err = PublishActivityLotteryCampaign(first.Id, now)
	require.NoError(t, err)
	_, err = PublishActivityLotteryCampaign(second.Id, now)
	require.ErrorContains(t, err, "another activity lottery is already open")
	storedSecond, err := GetActivityLotteryCampaignById(second.Id)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDraft, storedSecond.Status)

	_, err = CancelActivityLotteryCampaign(first.Id, now.Add(time.Minute))
	require.NoError(t, err)
	publishedSecond, err := PublishActivityLotteryCampaign(second.Id, now.Add(2*time.Minute))
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusOpen, publishedSecond.Status)
}

func TestActivityLotteryCanceledPublishedCampaignRemainsVisibleWithoutExposingDrafts(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	input := ActivityLotteryDraftInput{
		Title: "充值抽奖", DrawAt: time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai).Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}
	draftOnly, err := CreateActivityLotteryDraft(input, now)
	require.NoError(t, err)
	_, err = CancelActivityLotteryCampaign(draftOnly.Id, now)
	require.NoError(t, err)

	published, err := CreateActivityLotteryDraft(input, now)
	require.NoError(t, err)
	_, err = PublishActivityLotteryCampaign(published.Id, now)
	require.NoError(t, err)
	require.NoError(t, db.Create(&[]TopUp{
		{UserId: 1, TradeNo: "before-cancel", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: now.Add(30 * time.Second).Unix()},
		{UserId: 2, TradeNo: "after-cancel", Status: common.TopUpStatusSuccess, Amount: 1, Money: 5, CompleteTime: now.Add(2 * time.Minute).Unix()},
	}).Error)
	_, err = CancelActivityLotteryCampaign(published.Id, now.Add(time.Minute))
	require.NoError(t, err)

	_, err = GetActivityLotteryPublicView(draftOnly.Id, 0, now)
	require.Error(t, err)
	view, err := GetActivityLotteryPublicView(published.Id, 1, now)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusCanceled, view.Campaign.Status)
	assert.EqualValues(t, 1, view.ParticipantCount)
	assert.True(t, view.Joined)
	afterCancelView, err := GetActivityLotteryPublicView(published.Id, 2, now)
	require.NoError(t, err)
	assert.False(t, afterCancelView.Joined)

	items, total, err := GetPublishedActivityLotteryCampaigns(0, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, items, 1)
	assert.Equal(t, published.Id, items[0].Id)
	current, err := GetCurrentPublishedActivityLotteryCampaign()
	require.NoError(t, err)
	assert.Equal(t, published.Id, current.Id)
}

func TestActivityLotteryHistoryOrdersByPublicationRatherThanDraftCreation(t *testing.T) {
	setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	firstDay := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	secondDay := firstDay.Add(24 * time.Hour)
	thirdDay := secondDay.Add(24 * time.Hour)
	input := ActivityLotteryDraftInput{
		Title: "活动", DrawAt: time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai).Unix(),
		Prizes: []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 100}},
	}
	olderDraft, err := CreateActivityLotteryDraft(input, firstDay)
	require.NoError(t, err)
	newerDraft, err := CreateActivityLotteryDraft(input, secondDay)
	require.NoError(t, err)
	_, err = PublishActivityLotteryCampaign(newerDraft.Id, secondDay)
	require.NoError(t, err)
	_, err = CancelActivityLotteryCampaign(newerDraft.Id, secondDay.Add(time.Hour))
	require.NoError(t, err)
	_, err = PublishActivityLotteryCampaign(olderDraft.Id, thirdDay)
	require.NoError(t, err)

	items, total, err := GetPublishedActivityLotteryCampaigns(0, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 2, total)
	require.Len(t, items, 2)
	assert.Equal(t, olderDraft.Id, items[0].Id)
	assert.Equal(t, newerDraft.Id, items[1].Id)
}

func TestActivityLotteryDesignatedUserReceivesTopPrizeWithoutQualifyingTopUp(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	// The designated account never tops up, so it must not appear in the
	// qualified participant sample; it is granted the top tier regardless.
	designated := &User{Username: "designated-winner", AffCode: "designated-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(designated).Error)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:            "指定发奖",
		DrawAt:           drawAt.Unix(),
		MinParticipants:  3,
		DesignatedUserId: designated.Id,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000},
			{Name: "二等奖", Count: 2, AmountCents: 20_000},
		},
	}, publishedAt)
	require.NoError(t, err)
	require.Equal(t, designated.Id, draft.DesignatedUserId)

	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)

	// Two qualified accounts fill the two remaining prize slots.
	users := []User{
		{Username: "designated-draw-1", AffCode: "designated-draw-aff-1", Status: common.UserStatusEnabled},
		{Username: "designated-draw-2", AffCode: "designated-draw-aff-2", Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	for i, user := range users {
		require.NoError(t, db.Create(&TopUp{
			UserId: user.Id, TradeNo: fmt.Sprintf("designated-draw-topup-%d", i+1),
			Status: common.TopUpStatusSuccess, Amount: 1, Money: 5,
			CompleteTime: campaign.QualificationStartAt + int64(i+1),
		}).Error)
	}

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	require.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&winners).Error)
	require.Len(t, winners, 3)

	var designatedWinner *ActivityLotteryWinner
	for i := range winners {
		if winners[i].UserId == designated.Id {
			designatedWinner = &winners[i]
		}
	}
	require.NotNil(t, designatedWinner, "designated winner received a prize")
	assert.Equal(t, "一等奖", designatedWinner.PrizeName)

	prizeCounts := map[string]int{}
	winningUsers := map[int]bool{}
	for _, winner := range winners {
		assert.False(t, winningUsers[winner.UserId], "no account wins twice")
		winningUsers[winner.UserId] = true
		prizeCounts[winner.PrizeName]++
	}
	assert.Equal(t, map[string]int{"一等奖": 1, "二等奖": 2}, prizeCounts)
	assert.True(t, winningUsers[designated.Id])

	// The designated account is counted as a participant even without a top-up.
	assert.EqualValues(t, 3, drawn.ParticipantCount)

	var designatedQuota User
	require.NoError(t, db.Select("quota").First(&designatedQuota, designated.Id).Error)
	expectedQuota, err := activityLotteryPrizeQuota(50_000, activityLotteryCurrencyForCampaign(campaign), campaign.QuotaPerUnit)
	require.NoError(t, err)
	assert.Equal(t, expectedQuota, designatedQuota.Quota)
}

func TestActivityLotteryDesignatedUserWinsWithoutAnyOtherParticipants(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	designated := &User{Username: "lone-designated", AffCode: "lone-designated-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(designated).Error)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:            "仅指定用户",
		DrawAt:           drawAt.Unix(),
		MinParticipants:  1,
		DesignatedUserId: designated.Id,
		Prizes:           []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 500}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)
	assert.EqualValues(t, 1, drawn.ParticipantCount)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&winners).Error)
	require.Len(t, winners, 1)
	assert.Equal(t, designated.Id, winners[0].UserId)
}

func TestActivityLotteryMissingDesignatedUserFallsBackToRandomDraw(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	participant := &User{Username: "fallback-participant", AffCode: "fallback-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(participant).Error)
	// The designated account must pass draft validation, then disappear
	// before the draw to exercise the fallback path.
	soonDeleted := &User{Username: "fallback-designated", AffCode: "fallback-designated-aff", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(soonDeleted).Error)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:            "兜底随机",
		DrawAt:           drawAt.Unix(),
		MinParticipants:  1,
		DesignatedUserId: soonDeleted.Id,
		Prizes:           []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 500}},
	}, publishedAt)
	require.NoError(t, err)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	require.NoError(t, db.Create(&TopUp{
		UserId: participant.Id, TradeNo: "fallback-topup", Status: common.TopUpStatusSuccess,
		Amount: 1, Money: 5, CompleteTime: campaign.QualificationStartAt + 1,
	}).Error)

	// Simulate the designated account being deleted before the draw.
	require.NoError(t, db.Delete(&User{}, soonDeleted.Id).Error)

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&winners).Error)
	require.Len(t, winners, 1)
	assert.Equal(t, participant.Id, winners[0].UserId, "falls back to the random draw")
}

func TestActivityLotteryDraftRejectsUnknownDesignatedUser(t *testing.T) {
	setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	_, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:            "未知用户",
		DrawAt:           drawAt.Unix(),
		MinParticipants:  1,
		DesignatedUserId: 987_654,
		Prizes:           []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 500}},
	}, publishedAt)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "designated user")

	_, err = CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:            "负数用户",
		DrawAt:           drawAt.Unix(),
		MinParticipants:  1,
		DesignatedUserId: -3,
		Prizes:           []ActivityLotteryPrizeInput{{Name: "一等奖", Count: 1, AmountCents: 500}},
	}, publishedAt)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "designated user")
}

func TestActivityLotteryBlankDesignatedUserKeepsRandomDraw(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 28, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:           "纯随机",
		DrawAt:          drawAt.Unix(),
		MinParticipants: 2,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000},
			{Name: "二等奖", Count: 1, AmountCents: 20_000},
		},
	}, publishedAt)
	require.NoError(t, err)
	assert.Zero(t, draft.DesignatedUserId)
	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)

	users := []User{
		{Username: "plain-random-1", AffCode: "plain-random-aff-1", Status: common.UserStatusEnabled},
		{Username: "plain-random-2", AffCode: "plain-random-aff-2", Status: common.UserStatusEnabled},
		{Username: "plain-random-3", AffCode: "plain-random-aff-3", Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	for i, user := range users {
		require.NoError(t, db.Create(&TopUp{
			UserId: user.Id, TradeNo: fmt.Sprintf("plain-random-topup-%d", i+1),
			Status: common.TopUpStatusSuccess, Amount: 1, Money: 5,
			CompleteTime: campaign.QualificationStartAt + int64(i+1),
		}).Error)
	}

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	assert.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)
	assert.EqualValues(t, 3, drawn.ParticipantCount)

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&winners).Error)
	require.Len(t, winners, 2)
	seen := map[int]bool{}
	for _, winner := range winners {
		assert.False(t, seen[winner.UserId])
		seen[winner.UserId] = true
	}
}

// TestActivityLotteryDesignatedAdminDrawEndToEnd walks the full product flow
// with the administrator designated: draft -> publish -> top-ups -> draw. The
// administrator holds the top prize while every remaining slot goes to a
// randomly sampled qualified account.
func TestActivityLotteryDesignatedAdminDrawEndToEnd(t *testing.T) {
	db := setupActivityLotteryTestDB(t)
	shanghai := time.FixedZone("CST", 8*60*60)
	publishedAt := time.Date(2026, time.September, 29, 12, 0, 0, 0, shanghai)
	drawAt := time.Date(2026, time.October, 8, 0, 0, 0, 0, shanghai)

	admin := &User{Username: "admin", DisplayName: "Root User", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AffCode: "e2e-admin-aff"}
	require.NoError(t, db.Create(admin).Error)
	require.Equal(t, 1, admin.Id, "the first account is the administrator")

	testUsers := make([]User, 0, 10)
	for i := 1; i <= 10; i++ {
		testUsers = append(testUsers, User{
			Username: fmt.Sprintf("e2e-user-%d", i), AffCode: fmt.Sprintf("e2e-aff-%d", i),
			Status: common.UserStatusEnabled, DisplayName: fmt.Sprintf("Test User %d", i),
		})
	}
	require.NoError(t, db.Create(&testUsers).Error)

	draft, err := CreateActivityLotteryDraft(ActivityLotteryDraftInput{
		Title:                "指定管理员中奖",
		Description:          "一等奖内定给管理员，其余随机",
		QualificationStartAt: beijingDayStart(publishedAt),
		DrawAt:               drawAt.Unix(),
		MinParticipants:      6,
		DesignatedUserId:     admin.Id,
		Prizes: []ActivityLotteryPrizeInput{
			{Name: "一等奖", Count: 1, AmountCents: 50_000},
			{Name: "二等奖", Count: 2, AmountCents: 20_000},
			{Name: "三等奖", Count: 3, AmountCents: 5_000},
		},
	}, publishedAt)
	require.NoError(t, err)
	require.Equal(t, admin.Id, draft.DesignatedUserId)

	campaign, err := PublishActivityLotteryCampaign(draft.Id, publishedAt)
	require.NoError(t, err)
	require.Equal(t, ActivityLotteryStatusOpen, campaign.Status)

	// Five ordinary accounts qualify; the designated administrator does not
	// top up at all.
	qualified := make(map[int]bool, 5)
	for i, user := range testUsers[:5] {
		require.NoError(t, db.Create(&TopUp{
			UserId: user.Id, TradeNo: fmt.Sprintf("e2e-topup-%d", i+1),
			Status: common.TopUpStatusSuccess, Amount: 1, Money: 5,
			CompleteTime: campaign.QualificationStartAt + int64(i+1),
		}).Error)
		qualified[user.Id] = true
	}

	drawn, err := DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt)
	require.NoError(t, err)
	require.Equal(t, ActivityLotteryStatusDrawn, drawn.Status)
	assert.EqualValues(t, 6, drawn.ParticipantCount, "5 qualified accounts plus the designated administrator")

	var winners []ActivityLotteryWinner
	require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&winners).Error)
	require.Len(t, winners, 6)

	prizeCounts := map[string]int{}
	seen := map[int]bool{}
	var adminPrizeName string
	for _, winner := range winners {
		prizeCounts[winner.PrizeName]++
		assert.False(t, seen[winner.UserId], "no account wins twice")
		seen[winner.UserId] = true
		assert.Equal(t, ActivityLotteryGrantStatusGranted, winner.CreditStatus)
		assert.Equal(t, winner.Quota, readUserQuotaForActivityLotteryTest(t, db, winner.UserId))
		if winner.UserId == admin.Id {
			adminPrizeName = winner.PrizeName
		} else {
			assert.True(t, qualified[winner.UserId], "remaining winners come from the qualified pool")
		}
	}
	assert.Equal(t, "一等奖", adminPrizeName, "the designated administrator receives the top prize")
	assert.Equal(t, map[string]int{"一等奖": 1, "二等奖": 2, "三等奖": 3}, prizeCounts)

	_, err = DrawActivityLotteryCampaign(context.Background(), campaign.Id, drawAt.Add(time.Minute))
	require.NoError(t, err)
	var total int64
	require.NoError(t, db.Model(&ActivityLotteryWinner{}).Count(&total).Error)
	assert.EqualValues(t, 6, total, "re-running the draw does not duplicate prizes")
}
