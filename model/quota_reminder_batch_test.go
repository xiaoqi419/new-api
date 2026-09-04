package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWalletQuotaMutationObservesBalanceAfterDirectAndBatchFlush(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)

	oldReminderEnabled := common.QuotaRemindEnabled
	common.QuotaRemindEnabled = true
	t.Cleanup(func() { common.QuotaRemindEnabled = oldReminderEnabled })

	user := User{
		Id:       901,
		Username: "quota-reminder-batch-user",
		Password: "unused-password-hash",
		Status:   common.UserStatusEnabled,
		Quota:    100,
	}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Create(&QuotaReminderState{
		UserID:      user.Id,
		BalanceKind: QuotaReminderBalanceWallet,
		ResourceID:  0,
		Armed:       true,
		Status:      QuotaReminderStatusArmed,
		LastBalance: 100,
		Threshold:   50,
	}).Error)

	// Direct writes observe the committed balance immediately.
	common.BatchUpdateEnabled = false
	require.NoError(t, DecreaseUserQuota(user.Id, 60, false))
	state, err := GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, 40, getUserQuotaFromDB(t, user.Id))
	assert.Equal(t, int64(40), state.LastBalance)
	assert.Equal(t, QuotaReminderStatusLowPending, state.Status)

	// Recovery re-arms the same state before exercising the queued path.
	require.NoError(t, IncreaseUserQuota(user.Id, 60, false))
	state, err = GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.Equal(t, QuotaReminderStatusArmed, state.Status)

	common.BatchUpdateEnabled = true
	require.NoError(t, DecreaseUserQuota(user.Id, 60, false))
	assert.Equal(t, 100, getUserQuotaFromDB(t, user.Id), "queued mutation must not update DB before flush")
	state, err = GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.Equal(t, QuotaReminderStatusArmed, state.Status)

	batchUpdate()
	assert.Equal(t, 40, getUserQuotaFromDB(t, user.Id))
	state, err = GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.Equal(t, int64(40), state.LastBalance)
	assert.Equal(t, QuotaReminderStatusLowPending, state.Status)

	// A queued recovery must also observe the committed balance and re-arm the
	// state for the next crossing.
	require.NoError(t, IncreaseUserQuota(user.Id, 60, false))
	assert.Equal(t, 40, getUserQuotaFromDB(t, user.Id), "recovery remains queued before flush")
	batchUpdate()
	assert.Equal(t, 100, getUserQuotaFromDB(t, user.Id))
	state, err = GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.Equal(t, QuotaReminderStatusArmed, state.Status)

	// A second flush with no new delta must not create another logical cycle.
	batchUpdate()
	state, err = GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.Equal(t, QuotaReminderStatusArmed, state.Status)
}

func TestWalletQuotaMutationCreatesInitialLowReminderOnAdminStyleCrossing(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)

	oldEnabled, oldThreshold := common.QuotaRemindEnabled, common.QuotaRemindThreshold
	common.QuotaRemindEnabled = true
	common.QuotaRemindThreshold = 50
	t.Cleanup(func() {
		common.QuotaRemindEnabled = oldEnabled
		common.QuotaRemindThreshold = oldThreshold
	})

	user := User{Id: 902, Username: "quota-reminder-initial-crossing", Password: "unused", Status: common.UserStatusEnabled, Quota: 100}
	require.NoError(t, DB.Create(&user).Error)
	common.BatchUpdateEnabled = false

	// No reminder row exists yet. The mutation must retain the pre-update
	// balance so the first high-to-low adjustment opens a low_pending cycle.
	require.NoError(t, DecreaseUserQuota(user.Id, 60, true))
	state, err := GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, int64(40), state.LastBalance)
	assert.Equal(t, QuotaReminderStatusLowPending, state.Status)
	assert.False(t, state.Armed)

	// Repeated low-balance mutations are deduplicated until recovery.
	require.NoError(t, DecreaseUserQuota(user.Id, 1, true))
	state, err = GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.Equal(t, QuotaReminderStatusLowPending, state.Status)

	require.NoError(t, IncreaseUserQuota(user.Id, 61, true))
	state, err = GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.Equal(t, QuotaReminderStatusArmed, state.Status)

	require.NoError(t, DecreaseUserQuota(user.Id, 60, true))
	state, err = GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.Equal(t, QuotaReminderStatusLowPending, state.Status)
}

func TestInitialAdminQuotaCrossingUsesGlobalDisplayedThresholdSnapshot(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)

	oldEnabled, oldLegacyThreshold := common.QuotaRemindEnabled, common.QuotaRemindThreshold
	common.QuotaRemindEnabled = true
	common.QuotaRemindThreshold = 50 // Deliberately differs from the normalized option value.
	common.OptionMapRWMutex.Lock()
	oldOptions := common.OptionMap
	common.OptionMap = map[string]string{
		"quota_reminder.threshold":                        "2",
		"quota_reminder.threshold_unit":                   common.QuotaDisplayUnitCustom,
		"quota_reminder.threshold_quota_per_unit":         "500000",
		"quota_reminder.threshold_usd_exchange_rate":      "7.3",
		"quota_reminder.threshold_custom_exchange_rate":   "2",
		"quota_reminder.threshold_custom_currency_symbol": "积分",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.QuotaRemindEnabled = oldEnabled
		common.QuotaRemindThreshold = oldLegacyThreshold
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptions
		common.OptionMapRWMutex.Unlock()
	})

	user := User{Id: 903, Username: "quota-reminder-global-display", Password: "unused", Status: common.UserStatusEnabled, Quota: 600_000}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DecreaseUserQuota(user.Id, 200_000, true))

	state, err := GetQuotaReminderState(user.Id, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, int64(500_000), state.Threshold)
	assert.Equal(t, QuotaReminderStatusLowPending, state.Status)
	snapshot, ok := state.QuotaReminderSnapshot()
	require.True(t, ok)
	assert.Equal(t, common.QuotaDisplayUnitCustom, snapshot.DisplayUnit)
	assert.Equal(t, float64(500_000), snapshot.QuotaPerUnit)
	assert.Equal(t, 7.3, snapshot.USDExchangeRate)
	assert.Equal(t, float64(2), snapshot.CustomExchangeRate)
	assert.Equal(t, "积分", snapshot.CurrencySymbol)
}
