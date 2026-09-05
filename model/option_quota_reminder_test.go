package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useQuotaReminderOptionDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	previousDatabaseType := common.MainDatabaseType()
	previousEnabled := common.QuotaRemindEnabled
	common.OptionMapRWMutex.Lock()
	previousMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}, &QuotaReminderState{}))
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousDatabaseType)
		common.QuotaRemindEnabled = previousEnabled
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousMap
		common.OptionMapRWMutex.Unlock()
	})
	return db
}

func TestUpdateQuotaReminderThresholdPersistsDisplaySnapshot(t *testing.T) {
	db := useQuotaReminderOptionDB(t)
	general := operation_setting.GetGeneralSetting()
	previousUnit := general.QuotaDisplayType
	previousCustomRate := general.CustomCurrencyExchangeRate
	previousCustomSymbol := general.CustomCurrencySymbol
	previousQuotaPerUnit := common.QuotaPerUnit
	previousUSDRate := operation_setting.USDExchangeRate
	t.Cleanup(func() {
		general.QuotaDisplayType = previousUnit
		general.CustomCurrencyExchangeRate = previousCustomRate
		general.CustomCurrencySymbol = previousCustomSymbol
		common.QuotaPerUnit = previousQuotaPerUnit
		operation_setting.USDExchangeRate = previousUSDRate
	})
	general.QuotaDisplayType = common.QuotaDisplayUnitCNY
	general.CustomCurrencyExchangeRate = 2.5
	general.CustomCurrencySymbol = "C"
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.25

	require.NoError(t, UpdateOption("quota_reminder.threshold", "3"))

	var options []Option
	require.NoError(t, db.Find(&options).Error)
	values := make(map[string]string, len(options))
	for _, option := range options {
		values[option.Key] = option.Value
	}
	assert.Equal(t, "3", values["quota_reminder.threshold"])
	assert.Equal(t, common.QuotaDisplayUnitCNY, values["quota_reminder.threshold_unit"])
	assert.Equal(t, "500000", values["quota_reminder.threshold_quota_per_unit"])
	assert.Equal(t, "7.25", values["quota_reminder.threshold_usd_exchange_rate"])
	assert.Equal(t, "2.5", values["quota_reminder.threshold_custom_exchange_rate"])
	assert.Equal(t, "C", values["quota_reminder.threshold_custom_currency_symbol"])
}

func TestInitOptionMapInitializesQuotaReminderDefaultsAfterLoadingDisplaySettings(t *testing.T) {
	db := useQuotaReminderOptionDB(t)
	general := operation_setting.GetGeneralSetting()
	previousGeneral := *general
	previousUSDRate := operation_setting.USDExchangeRate
	t.Cleanup(func() {
		*general = previousGeneral
		operation_setting.USDExchangeRate = previousUSDRate
	})

	general.QuotaDisplayType = common.QuotaDisplayUnitUSD
	operation_setting.USDExchangeRate = 7.3
	require.NoError(t, db.Create(&Option{Key: "general_setting.quota_display_type", Value: common.QuotaDisplayUnitCNY}).Error)
	require.NoError(t, db.Create(&Option{Key: "USDExchangeRate", Value: "8.2"}).Error)

	require.NoError(t, InitOptionMap())

	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, "1", common.OptionMap["quota_reminder.threshold"])
	assert.Equal(t, common.QuotaDisplayUnitCNY, common.OptionMap["quota_reminder.threshold_unit"])
	assert.Equal(t, "8.2", common.OptionMap["quota_reminder.threshold_usd_exchange_rate"])
}

func TestInitOptionMapPreservesPersistedQuotaReminderSnapshot(t *testing.T) {
	db := useQuotaReminderOptionDB(t)
	general := operation_setting.GetGeneralSetting()
	previousGeneral := *general
	previousUSDRate := operation_setting.USDExchangeRate
	t.Cleanup(func() {
		*general = previousGeneral
		operation_setting.USDExchangeRate = previousUSDRate
	})

	require.NoError(t, db.Create(&[]Option{
		{Key: "general_setting.quota_display_type", Value: common.QuotaDisplayUnitCNY},
		{Key: "USDExchangeRate", Value: "8.2"},
		{Key: "quota_reminder.threshold", Value: "3"},
		{Key: "quota_reminder.threshold_unit", Value: common.QuotaDisplayUnitUSD},
		{Key: "quota_reminder.threshold_quota_per_unit", Value: "500000"},
		{Key: "quota_reminder.threshold_usd_exchange_rate", Value: "7.25"},
		{Key: "quota_reminder.threshold_custom_exchange_rate", Value: "2"},
		{Key: "quota_reminder.threshold_custom_currency_symbol", Value: "$"},
	}).Error)

	require.NoError(t, InitOptionMap())

	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, "3", common.OptionMap["quota_reminder.threshold"])
	assert.Equal(t, common.QuotaDisplayUnitUSD, common.OptionMap["quota_reminder.threshold_unit"])
	assert.Equal(t, "7.25", common.OptionMap["quota_reminder.threshold_usd_exchange_rate"])
}

func TestDisablingQuotaReminderSuppressesPendingDelivery(t *testing.T) {
	db := useQuotaReminderOptionDB(t)
	state := QuotaReminderState{
		UserID: 201, BalanceKind: QuotaReminderBalanceWallet,
		Armed: false, Status: QuotaReminderStatusLowPending,
		LastBalance: 20, Threshold: 50,
	}
	require.NoError(t, db.Create(&state).Error)

	require.NoError(t, UpdateOption("quota_reminder.enabled", "false"))
	require.NoError(t, db.First(&state, state.ID).Error)
	assert.Equal(t, QuotaReminderStatusSuppressed, state.Status)
	assert.False(t, state.Armed)
	assert.False(t, common.QuotaRemindEnabled)
}

func TestQuotaReminderEnableWritesActivationTokenAndDisablingClearsIt(t *testing.T) {
	db := useQuotaReminderOptionDB(t)
	require.NoError(t, UpdateOption("quota_reminder.enabled", "false"))
	require.NoError(t, UpdateOption("quota_reminder.enabled", "true"))

	var marker Option
	require.NoError(t, db.First(&marker, "key = ?", QuotaReminderBaselinePendingOptionKey).Error)
	assert.Equal(t, "true", marker.Value)
	var token Option
	require.NoError(t, db.First(&token, "key = ?", QuotaReminderActivationTokenOptionKey).Error)
	assert.NotEmpty(t, token.Value)
	firstToken := token.Value

	// Updating an already-enabled configuration must not start a second
	// baseline generation.
	require.NoError(t, UpdateOption("quota_reminder.enabled", "true"))
	require.NoError(t, db.First(&token, "key = ?", QuotaReminderActivationTokenOptionKey).Error)
	assert.Equal(t, firstToken, token.Value)

	require.NoError(t, UpdateOption("quota_reminder.enabled", "false"))
	require.NoError(t, db.First(&marker, "key = ?", QuotaReminderBaselinePendingOptionKey).Error)
	require.NoError(t, db.First(&token, "key = ?", QuotaReminderActivationTokenOptionKey).Error)
	assert.Equal(t, "false", marker.Value)
	assert.Empty(t, token.Value)
}

func TestCompleteQuotaReminderBaselineHonorsActivationToken(t *testing.T) {
	db := useQuotaReminderOptionDB(t)
	require.NoError(t, UpdateOption("quota_reminder.enabled", "false"))
	require.NoError(t, UpdateOption("quota_reminder.enabled", "true"))
	firstToken, err := QuotaReminderActivationToken()
	require.NoError(t, err)
	require.NotEmpty(t, firstToken)

	completed, err := CompleteQuotaReminderBaseline("stale-token")
	require.NoError(t, err)
	assert.False(t, completed)
	assert.True(t, IsQuotaReminderBaselinePending())

	completed, err = CompleteQuotaReminderBaseline(firstToken)
	require.NoError(t, err)
	assert.True(t, completed)
	assert.False(t, IsQuotaReminderBaselinePending())

	var marker Option
	require.NoError(t, db.First(&marker, "key = ?", QuotaReminderBaselinePendingOptionKey).Error)
	assert.Equal(t, "false", marker.Value)
	var token Option
	require.NoError(t, db.First(&token, "key = ?", QuotaReminderActivationTokenOptionKey).Error)
	assert.Empty(t, token.Value)
}

func TestCompleteQuotaReminderBaselineReportsMissingMarker(t *testing.T) {
	useQuotaReminderOptionDB(t)
	completed, err := CompleteQuotaReminderBaseline("missing-marker")
	require.Error(t, err)
	assert.False(t, completed)
}

func TestUpdateQuotaReminderOptionsWritesSnapshotAndSuppressesInOneTransaction(t *testing.T) {
	db := useQuotaReminderOptionDB(t)
	general := operation_setting.GetGeneralSetting()
	previousGeneral := *general
	previousUSDRate := operation_setting.USDExchangeRate
	previousQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() {
		*general = previousGeneral
		operation_setting.USDExchangeRate = previousUSDRate
		common.QuotaPerUnit = previousQuotaPerUnit
	})

	general.QuotaDisplayType = common.QuotaDisplayUnitCNY
	operation_setting.USDExchangeRate = 7.2
	common.QuotaPerUnit = 500_000
	state := QuotaReminderState{
		UserID: 202, BalanceKind: QuotaReminderBalanceWallet,
		Armed: false, Status: QuotaReminderStatusLowPending,
		LastBalance: 20, Threshold: 50,
	}
	require.NoError(t, db.Create(&state).Error)

	require.NoError(t, UpdateQuotaReminderOptions(false, "3", "custom", `{"subject":"Low {{username}}","html":"<p>{{remaining_quota}}</p>","text":"{{remaining_quota}}"}`))

	var options []Option
	require.NoError(t, db.Find(&options).Error)
	values := make(map[string]string, len(options))
	for _, option := range options {
		values[option.Key] = option.Value
	}
	assert.Equal(t, "false", values["quota_reminder.enabled"])
	assert.Equal(t, "3", values["quota_reminder.threshold"])
	assert.Equal(t, common.QuotaDisplayUnitCNY, values["quota_reminder.threshold_unit"])
	assert.Equal(t, "7.2", values["quota_reminder.threshold_usd_exchange_rate"])
	assert.Equal(t, "custom", values["quota_reminder.template"])
	require.NoError(t, db.First(&state, state.ID).Error)
	assert.Equal(t, QuotaReminderStatusSuppressed, state.Status)
}
