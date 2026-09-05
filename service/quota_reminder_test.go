package service

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQuotaReminderCompensationRecoversMissingStateAndPaginates(t *testing.T) {
	truncate(t)
	oldEnabled := common.QuotaRemindEnabled
	common.QuotaRemindEnabled = true
	t.Cleanup(func() { common.QuotaRemindEnabled = oldEnabled })
	common.OptionMapRWMutex.Lock()
	oldOptions := common.OptionMap
	common.OptionMap = map[string]string{
		quotaReminderEnabledKey:            "true",
		quotaReminderThresholdKey:          "50",
		quotaReminderThresholdUnitKey:      common.QuotaDisplayUnitTokens,
		quotaReminderThresholdQuotaPerUnit: "1",
		quotaReminderThresholdUSDRate:      "1",
		quotaReminderThresholdCustomRate:   "1",
		quotaReminderThresholdCustomSymbol: "¤",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptions
		common.OptionMapRWMutex.Unlock()
	})

	// Put the low-balance user after five full pages. A fixed LIMIT would miss
	// it; the compensation pass must continue with its keyset cursor.
	for id := 20_000; id < 21_000; id++ {
		require.NoError(t, model.DB.Create(&model.User{
			Id: id, Username: "comp-user-" + strconv.Itoa(id), AffCode: strconv.Itoa(id), Password: "unused",
			Status: common.UserStatusEnabled, Quota: 100,
		}).Error)
	}
	lowID := 21_000
	require.NoError(t, model.DB.Create(&model.User{
		Id: lowID, Username: "compensation-low-user", Password: "unused",
		Status: common.UserStatusEnabled, Quota: 10,
	}).Error)

	require.NoError(t, compensateQuotaReminderBalances())
	state, err := model.GetQuotaReminderState(lowID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	require.Equal(t, model.QuotaReminderStatusLowPending, state.Status)
	require.Equal(t, int64(10), state.LastBalance)
	snapshot, ok := state.QuotaReminderSnapshot()
	require.True(t, ok)
	require.Equal(t, common.QuotaDisplayUnitTokens, snapshot.DisplayUnit)
	require.Equal(t, float64(1), snapshot.QuotaPerUnit)

	// A second compensation pass sees the existing low cycle and must not
	// create a second logical reminder or alter its snapshot.
	require.NoError(t, compensateQuotaReminderBalances())
	var count int64
	require.NoError(t, model.DB.Model(&model.QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ?", lowID, model.QuotaReminderBalanceWallet, 0).
		Count(&count).Error)
	require.Equal(t, int64(1), count)
}

func TestRunQuotaReminderTaskSuppressesPendingWhenDisabled(t *testing.T) {
	truncate(t)
	oldEnabled := common.QuotaRemindEnabled
	common.QuotaRemindEnabled = false
	t.Cleanup(func() { common.QuotaRemindEnabled = oldEnabled })
	withQuotaReminderOptions(t, map[string]string{quotaReminderEnabledKey: "false"})
	require.NoError(t, model.DB.Create(&model.User{
		Id: 21_001, Username: "disabled-reminder-user", Password: "unused",
		Status: common.UserStatusEnabled, Quota: 10,
	}).Error)

	triggered, err := model.TransitionQuotaReminder(21_001, model.QuotaReminderBalanceWallet, 0, 100, 10, 50)
	require.NoError(t, err)
	require.True(t, triggered)
	result, err := RunQuotaReminderTaskOnce()
	require.NoError(t, err)
	require.Zero(t, result.Pending)

	state, err := model.GetQuotaReminderState(21_001, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	require.Equal(t, model.QuotaReminderStatusSuppressed, state.Status)
	require.Empty(t, state.DeliveryToken)

	// Re-enabling while the balance is still low must not recreate the old
	// cycle; a later high-to-low crossing is required.
	common.QuotaRemindEnabled = true
	common.OptionMapRWMutex.Lock()
	common.OptionMap[quotaReminderEnabledKey] = "true"
	common.OptionMapRWMutex.Unlock()
	_, err = RunQuotaReminderTaskOnce()
	require.NoError(t, err)
	state, err = model.GetQuotaReminderState(21_001, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.Equal(t, model.QuotaReminderStatusSuppressed, state.Status)
}

func TestQuotaReminderReenableRequiresNewCrossing(t *testing.T) {
	truncate(t)
	general := operation_setting.GetGeneralSetting()
	previousGeneral := *general
	previousQuotaPerUnit := common.QuotaPerUnit
	previousUSDRate := operation_setting.USDExchangeRate
	previousEnabled := common.QuotaRemindEnabled
	t.Cleanup(func() {
		*general = previousGeneral
		common.QuotaPerUnit = previousQuotaPerUnit
		operation_setting.USDExchangeRate = previousUSDRate
		common.QuotaRemindEnabled = previousEnabled
	})
	general.QuotaDisplayType = common.QuotaDisplayUnitTokens
	common.QuotaPerUnit = 1
	operation_setting.USDExchangeRate = 1
	withQuotaReminderOptions(t, map[string]string{})

	require.NoError(t, model.UpdateQuotaReminderOptions(false, "50", "default", ""))
	const userID = 21_004
	require.NoError(t, model.DB.Create(&model.User{
		Id: userID, Username: "reenable-reminder-user", Password: "unused",
		Status: common.UserStatusEnabled, Quota: 10,
	}).Error)

	// Enabling records a token and the first task pass baselines the already-low
	// balance without opening a delivery cycle.
	require.NoError(t, model.UpdateQuotaReminderOptions(true, "50", "default", ""))
	result, err := RunQuotaReminderTaskOnce()
	require.NoError(t, err)
	require.Zero(t, result.Pending)
	state, err := model.GetQuotaReminderState(userID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	require.Equal(t, model.QuotaReminderStatusSuppressed, state.Status)

	// Recovery re-arms the state; only a subsequent high-to-low observation may
	// create a new retryable reminder cycle.
	model.ObserveQuotaReminderBalanceWithPrevious(userID, model.QuotaReminderBalanceWallet, 0, 10, 100)
	model.ObserveQuotaReminderBalanceWithPrevious(userID, model.QuotaReminderBalanceWallet, 0, 100, 10)
	state, err = model.GetQuotaReminderState(userID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, model.QuotaReminderStatusLowPending, state.Status)
	assert.False(t, state.Armed)
}

func TestQuotaReminderCompensationRearmsRecoveredState(t *testing.T) {
	truncate(t)
	oldEnabled := common.QuotaRemindEnabled
	common.QuotaRemindEnabled = true
	t.Cleanup(func() { common.QuotaRemindEnabled = oldEnabled })
	withQuotaReminderOptions(t, map[string]string{
		quotaReminderEnabledKey:       "true",
		quotaReminderThresholdKey:     "50",
		quotaReminderThresholdUnitKey: common.QuotaDisplayUnitTokens,
	})
	const userID = 21_002
	require.NoError(t, model.DB.Create(&model.User{
		Id: userID, Username: "recovered-reminder-user", Password: "unused",
		Status: common.UserStatusEnabled, Quota: 100,
	}).Error)
	_, err := model.TransitionQuotaReminder(userID, model.QuotaReminderBalanceWallet, 0, 100, 10, 50)
	require.NoError(t, err)
	state, err := model.GetQuotaReminderState(userID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.Equal(t, model.QuotaReminderStatusLowPending, state.Status)

	require.NoError(t, compensateQuotaReminderBalances())
	state, err = model.GetQuotaReminderState(userID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.Equal(t, model.QuotaReminderStatusArmed, state.Status)
	require.True(t, state.Armed)
	require.Equal(t, int64(100), state.LastBalance)
}

func TestQuotaReminderCompensationRecoversMissingSubscriptionState(t *testing.T) {
	truncate(t)
	oldEnabled := common.QuotaRemindEnabled
	common.QuotaRemindEnabled = true
	t.Cleanup(func() { common.QuotaRemindEnabled = oldEnabled })
	withQuotaReminderOptions(t, map[string]string{
		quotaReminderEnabledKey:            "true",
		quotaReminderThresholdKey:          "50",
		quotaReminderThresholdUnitKey:      common.QuotaDisplayUnitTokens,
		quotaReminderThresholdQuotaPerUnit: "1",
		quotaReminderThresholdUSDRate:      "1",
		quotaReminderThresholdCustomRate:   "1",
	})

	const (
		userID         = 21_003
		subscriptionID = 31_003
	)
	require.NoError(t, model.DB.Create(&model.User{
		Id: userID, Username: "subscription-compensation-user", Password: "unused",
		Status: common.UserStatusEnabled, Quota: 100,
	}).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:          subscriptionID,
		UserId:      userID,
		AmountTotal: 100,
		AmountUsed:  90,
		Status:      "active",
		StartTime:   common.GetTimestamp() - 60,
		EndTime:     common.GetTimestamp() + 3600,
	}).Error)

	require.NoError(t, compensateQuotaReminderBalances())
	state, err := model.GetQuotaReminderState(userID, model.QuotaReminderBalanceSubscription, subscriptionID)
	require.NoError(t, err)
	require.NotNil(t, state)
	require.Equal(t, model.QuotaReminderStatusLowPending, state.Status)
	require.Equal(t, int64(10), state.LastBalance)

	walletState, err := model.GetQuotaReminderState(userID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.Nil(t, walletState, "a low subscription must not create a wallet reminder state")

	// Re-running the pass keeps the same subscription cycle and does not create
	// a second state row or accidentally reset the wallet lifecycle.
	require.NoError(t, compensateQuotaReminderBalances())
	var count int64
	require.NoError(t, model.DB.Model(&model.QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ?", userID, model.QuotaReminderBalanceSubscription, subscriptionID).
		Count(&count).Error)
	require.Equal(t, int64(1), count)
}

func withQuotaReminderOptions(t *testing.T, options map[string]string) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = options
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})
}

func TestEffectiveQuotaReminderThresholdUsesDisplayedUnitAndUserSnapshot(t *testing.T) {
	oldUnit := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldQuotaPerUnit := common.QuotaPerUnit
	oldUSDExchangeRate := operation_setting.USDExchangeRate
	t.Cleanup(func() {
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldUnit
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldUSDExchangeRate
	})
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	operation_setting.GetGeneralSetting().QuotaDisplayType = common.QuotaDisplayUnitUSD
	withQuotaReminderOptions(t, map[string]string{
		quotaReminderEnabledKey:       "true",
		quotaReminderThresholdKey:     "1",
		quotaReminderThresholdUnitKey: common.QuotaDisplayUnitUSD,
	})

	global, err := EffectiveQuotaReminderThresholdForUser(dto.UserSetting{})
	require.NoError(t, err)
	require.Equal(t, 500_000, global)

	personal := dto.UserSetting{
		QuotaWarningThreshold:             2,
		QuotaWarningThresholdUnit:         common.QuotaDisplayUnitUSD,
		QuotaWarningThresholdQuotaPerUnit: 500_000,
		QuotaWarningThresholdUSDRate:      7.3,
	}
	override, err := EffectiveQuotaReminderThresholdForUser(personal)
	require.NoError(t, err)
	require.Equal(t, 1_000_000, override)
}

func TestEffectiveQuotaReminderThresholdDefaultsToOneDisplayedUnit(t *testing.T) {
	oldUnit := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldQuotaPerUnit := common.QuotaPerUnit
	oldUSDExchangeRate := operation_setting.USDExchangeRate
	oldCustomRate := operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate
	t.Cleanup(func() {
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldUnit
		operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = oldCustomRate
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldUSDExchangeRate
	})
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = 2.5
	for _, tc := range []struct {
		unit string
		want int
	}{
		{common.QuotaDisplayUnitUSD, 500_000},
		{common.QuotaDisplayUnitCNY, 68_493},
		{common.QuotaDisplayUnitCustom, 200_000},
		{common.QuotaDisplayUnitTokens, 1},
	} {
		t.Run(tc.unit, func(t *testing.T) {
			operation_setting.GetGeneralSetting().QuotaDisplayType = tc.unit
			withQuotaReminderOptions(t, map[string]string{quotaReminderThresholdUnitKey: tc.unit})
			threshold, err := EffectiveQuotaReminderThresholdForUser(dto.UserSetting{})
			require.NoError(t, err)
			require.Equal(t, tc.want, threshold)
		})
	}
}

func TestRenderQuotaReminderEmailEscapesHTMLValuesAndUsesWhitelist(t *testing.T) {
	oldSystemName := common.SystemName
	t.Cleanup(func() { common.SystemName = oldSystemName })
	common.SystemName = "<Site>"
	withQuotaReminderOptions(t, map[string]string{
		quotaReminderThresholdKey:      "1",
		quotaReminderThresholdUnitKey:  common.QuotaDisplayUnitTokens,
		quotaReminderTemplateKey:       "custom",
		quotaReminderCustomTemplateKey: `{"subject":"Hi {{username}}","html":"<p>{{username}}</p><p>{{site_name}}</p>","text":"{{username}} {{remaining_quota}}"}`,
	})
	email, err := RenderQuotaReminderEmail("<alice>", 4, 5, "https://example.test/topup?a=1&b=2")
	require.NoError(t, err)
	require.Equal(t, "Hi <alice>", email.Subject)
	require.Contains(t, email.HTML, "&lt;alice&gt;")
	require.Contains(t, email.HTML, "&lt;Site&gt;")
	require.NotContains(t, email.HTML, "<alice>")
}

func TestValidateQuotaReminderCustomTemplateRejectsUnknownOrMalformedVariables(t *testing.T) {
	unknown := `{"subject":"x {{password}}","html":"<p>x</p>","text":"x"}`
	require.Error(t, ValidateQuotaReminderCustomTemplate(unknown))
	malformed := `{"subject":"x {{username","html":"<p>x</p>","text":"x"}`
	require.Error(t, ValidateQuotaReminderCustomTemplate(malformed))
}

func TestQuotaReminderConfigForUserUsesPersonalDisplaySnapshot(t *testing.T) {
	oldCustomSymbol := operation_setting.GetGeneralSetting().CustomCurrencySymbol
	t.Cleanup(func() { operation_setting.GetGeneralSetting().CustomCurrencySymbol = oldCustomSymbol })
	operation_setting.GetGeneralSetting().CustomCurrencySymbol = "$current"
	withQuotaReminderOptions(t, map[string]string{
		quotaReminderThresholdKey:          "1",
		quotaReminderThresholdUnitKey:      common.QuotaDisplayUnitUSD,
		quotaReminderTemplateKey:           "default",
		quotaReminderThresholdQuotaPerUnit: "500000",
		quotaReminderThresholdUSDRate:      "7.3",
		quotaReminderThresholdCustomRate:   "1",
	})
	setting := dto.UserSetting{
		QuotaWarningThreshold:             2,
		QuotaWarningThresholdUnit:         common.QuotaDisplayUnitCustom,
		QuotaWarningThresholdQuotaPerUnit: 500_000,
		QuotaWarningThresholdUSDRate:      7.3,
		QuotaWarningThresholdCustomRate:   2,
		QuotaWarningThresholdCustomSymbol: "€",
	}
	cfg, err := quotaReminderConfigForUser(setting)
	require.NoError(t, err)
	require.Equal(t, 500_000, cfg.Threshold)
	email, err := renderQuotaReminderEmailWithConfig(cfg, "alice", 250_000, "/wallet")
	require.NoError(t, err)
	require.Contains(t, email.HTML, "€1")
	require.Contains(t, email.HTML, "€2")
}
