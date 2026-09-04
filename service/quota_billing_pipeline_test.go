package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupQuotaBillingPipelineTest(t *testing.T, options map[string]string) {
	t.Helper()
	require.NoError(t, model.DB.AutoMigrate(&model.QuotaReminderState{}))
	require.NoError(t, model.DB.Exec("DELETE FROM quota_reminder_states").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM user_subscriptions").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM users").Error)

	oldReminderEnabled := common.QuotaRemindEnabled
	oldBatchEnabled := common.BatchUpdateEnabled
	common.QuotaRemindEnabled = true
	common.BatchUpdateEnabled = false
	withQuotaReminderOptions(t, options)
	t.Cleanup(func() {
		common.QuotaRemindEnabled = oldReminderEnabled
		common.BatchUpdateEnabled = oldBatchEnabled
		_ = model.DB.Exec("DELETE FROM quota_reminder_states")
		_ = model.DB.Exec("DELETE FROM user_subscriptions")
		_ = model.DB.Exec("DELETE FROM users")
	})
}

func createQuotaBillingPipelineUser(t *testing.T, id, quota int) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Id:       id,
		Username: "quota-pipeline-user",
		Status:   common.UserStatusEnabled,
		Quota:    quota,
	}).Error)
}

func quotaPipelineOptions() map[string]string {
	return map[string]string{
		quotaReminderEnabledKey:       "true",
		quotaReminderThresholdKey:     "50",
		quotaReminderThresholdUnitKey: common.QuotaDisplayUnitTokens,
	}
}

func TestSettleBillingNoSessionEqualPreconsumeStillChecksWalletReminder(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
	const userID = 902
	createQuotaBillingPipelineUser(t, userID, 40)

	relayInfo := &relaycommon.RelayInfo{
		UserId:                userID,
		UserQuota:             100,
		FinalPreConsumedQuota: 80,
		BillingSource:         BillingSourceWallet,
		IsPlayground:          true,
		UserSetting:           dto.UserSetting{},
	}
	require.NoError(t, SettleBilling(nil, relayInfo, 80))

	state, err := model.GetQuotaReminderState(userID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, int64(40), state.LastBalance)
	assert.NotEqual(t, model.QuotaReminderStatusArmed, state.Status)
}

func TestSettleBillingNoSessionSubscriptionUsesSubscriptionReminder(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
	const userID = 903
	createQuotaBillingPipelineUser(t, userID, 1_000)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		Id:          9031,
		UserId:      userID,
		AmountTotal: 100,
		AmountUsed:  41,
		Status:      "active",
	}).Error)

	relayInfo := &relaycommon.RelayInfo{
		UserId:                  userID,
		FinalPreConsumedQuota:   80,
		BillingSource:           BillingSourceSubscription,
		SubscriptionId:          9031,
		SubscriptionAmountTotal: 100,
		IsPlayground:            true,
		UserSetting:             dto.UserSetting{},
	}
	require.NoError(t, SettleBilling(nil, relayInfo, 90))

	state, err := model.GetQuotaReminderState(userID, model.QuotaReminderBalanceSubscription, 9031)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, int64(49), state.LastBalance)
	assert.NotEqual(t, model.QuotaReminderStatusArmed, state.Status)

	walletState, err := model.GetQuotaReminderState(userID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.Nil(t, walletState, "subscription settlement must not create a wallet reminder")
}

func TestSendQuotaReminderWithAttemptDoesNotUseStaleClaim(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
	const userID = 904
	require.NoError(t, model.DB.Create(&model.QuotaReminderState{
		UserID:        userID,
		BalanceKind:   model.QuotaReminderBalanceWallet,
		ResourceID:    0,
		Armed:         false,
		Status:        model.QuotaReminderStatusSending,
		LastBalance:   40,
		Threshold:     50,
		DeliveryToken: "current-token",
	}).Error)

	sent, err := SendQuotaReminderWithAttempt(userID, model.QuotaReminderBalanceWallet, 0, 40, 50, "stale-token")
	require.NoError(t, err)
	assert.False(t, sent)

	state, err := model.GetQuotaReminderState(userID, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, model.QuotaReminderStatusSending, state.Status)
	assert.Equal(t, "current-token", state.DeliveryToken)
}
