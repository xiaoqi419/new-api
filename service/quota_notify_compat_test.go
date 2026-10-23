package service

import (
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckAndSendQuotaNotifyPreservesLegacyWalletChannel(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
	createQuotaBillingPipelineUser(t, 910, 100)
	called := make(chan dto.Notify, 1)
	previousNotifyQuotaUser := notifyQuotaUser
	notifyQuotaUser = func(_ int, _ string, setting dto.UserSetting, notification dto.Notify) error {
		assert.Equal(t, dto.NotifyTypeWebhook, setting.NotifyType)
		called <- notification
		return nil
	}
	t.Cleanup(func() { notifyQuotaUser = previousNotifyQuotaUser })

	relayInfo := &relaycommon.RelayInfo{
		UserId:      910,
		UserQuota:   100,
		UserEmail:   "user@example.com",
		UserSetting: dto.UserSetting{NotifyType: dto.NotifyTypeWebhook, Language: "zh-CN"},
	}
	checkAndSendQuotaNotify(relayInfo, 60, 0)

	select {
	case notification := <-called:
		require.Equal(t, dto.NotifyTypeQuotaExceed, notification.Type)
		require.Equal(t, "您的额度即将用尽", notification.Title)
		require.Len(t, notification.Values, 4)
	case <-time.After(time.Second):
		t.Fatal("legacy wallet notification was not dispatched")
	}

	state, err := model.GetQuotaReminderState(910, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.Nil(t, state, "legacy channels must not enter the email reminder state machine")
}

func TestQuotaReminderOptOutPreservesBalanceAndSkipsDelivery(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
	disabled := false
	for _, notifyType := range []string{dto.NotifyTypeEmail, dto.NotifyTypeWebhook} {
		settings := dto.UserSetting{NotifyType: notifyType, QuotaWarningEnabled: &disabled}
		checkAndSendQuotaReminderForBalances(913, model.QuotaReminderBalanceWallet, 0, 100, 0, settings)
		state, err := model.GetQuotaReminderState(913, model.QuotaReminderBalanceWallet, 0)
		require.NoError(t, err)
		assert.Nil(t, state, "a user who opted out must not acquire a delivery claim")
	}
}

func TestCheckAndSendSubscriptionQuotaNotifyPreservesLegacyChannel(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
	createQuotaBillingPipelineUser(t, 911, 100)
	called := make(chan dto.Notify, 1)
	previousNotifyQuotaUser := notifyQuotaUser
	notifyQuotaUser = func(_ int, _ string, setting dto.UserSetting, notification dto.Notify) error {
		assert.Equal(t, dto.NotifyTypeGotify, setting.NotifyType)
		called <- notification
		return nil
	}
	t.Cleanup(func() { notifyQuotaUser = previousNotifyQuotaUser })

	relayInfo := &relaycommon.RelayInfo{
		UserId:                                911,
		UserEmail:                             "user@example.com",
		UserSetting:                           dto.UserSetting{NotifyType: dto.NotifyTypeGotify, Language: "zh-CN"},
		SubscriptionId:                        9111,
		SubscriptionAmountTotal:               100,
		SubscriptionAmountUsedAfterPreConsume: 60,
	}
	checkAndSendSubscriptionQuotaNotify(relayInfo)

	select {
	case notification := <-called:
		require.Equal(t, dto.NotifyTypeQuotaExceed, notification.Type)
		require.Equal(t, "您的订阅额度即将用尽", notification.Title)
		require.Len(t, notification.Values, 2)
	case <-time.After(time.Second):
		t.Fatal("legacy subscription notification was not dispatched")
	}

	state, err := model.GetQuotaReminderState(911, model.QuotaReminderBalanceSubscription, 9111)
	require.NoError(t, err)
	assert.Nil(t, state, "legacy channels must not enter the email reminder state machine")
}

func TestCheckAndSendQuotaReminderForBalancesPreservesLegacyChannel(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
	createQuotaBillingPipelineUser(t, 912, 100)
	called := make(chan dto.Notify, 1)
	previousNotifyQuotaUser := notifyQuotaUser
	notifyQuotaUser = func(_ int, _ string, setting dto.UserSetting, notification dto.Notify) error {
		assert.Equal(t, dto.NotifyTypeBark, setting.NotifyType)
		called <- notification
		return nil
	}
	t.Cleanup(func() { notifyQuotaUser = previousNotifyQuotaUser })

	checkAndSendQuotaReminderForBalances(
		912,
		model.QuotaReminderBalanceWallet,
		0,
		100,
		40,
		dto.UserSetting{NotifyType: dto.NotifyTypeBark, Language: "zh-CN"},
	)

	select {
	case notification := <-called:
		require.Equal(t, dto.NotifyTypeQuotaExceed, notification.Type)
		require.Equal(t, "您的额度即将用尽", notification.Title)
		require.Len(t, notification.Values, 2)
	case <-time.After(time.Second):
		t.Fatal("legacy balance notification was not dispatched")
	}

	state, err := model.GetQuotaReminderState(912, model.QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.Nil(t, state, "legacy channels must not enter the email reminder state machine")
}

func TestQueuedLegacyQuotaNotifyHonorsCurrentUserOptOut(t *testing.T) {
	for _, channel := range []string{dto.NotifyTypeWebhook, dto.NotifyTypeBark, dto.NotifyTypeGotify} {
		for _, missing := range []bool{false, true} {
			t.Run(channel+"/missing="+strconv.FormatBool(missing), func(t *testing.T) {
				setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
				createQuotaBillingPipelineUser(t, 919, 100)
				previousSubmit := submitQuotaNotification
				previousNotify := notifyQuotaUser
				t.Cleanup(func() { submitQuotaNotification = previousSubmit; notifyQuotaUser = previousNotify })
				var queued func()
				submitQuotaNotification = func(work func()) { queued = work }
				sent := false
				notifyQuotaUser = func(_ int, _ string, _ dto.UserSetting, _ dto.Notify) error { sent = true; return nil }
				sendLegacyQuotaNotify(919, "user@example.com", dto.UserSetting{NotifyType: channel, Language: "zh-CN"}, 10, false)
				require.NotNil(t, queued)
				if missing {
					require.NoError(t, model.DB.Delete(&model.User{}, 919).Error)
				} else {
					disabled := false
					user := model.User{Id: 919}
					user.SetSetting(dto.UserSetting{QuotaWarningEnabled: &disabled})
					require.NoError(t, model.DB.Model(&user).Update("setting", user.Setting).Error)
				}
				queued()
				assert.False(t, sent, "the queued notification must not use an obsolete enabled setting")
			})
		}
	}
}

func TestQueuedLegacyQuotaNotifyPreservesCapturedThresholdAfterReload(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
	createQuotaBillingPipelineUser(t, 920, 100)
	previousSubmit := submitQuotaNotification
	previousNotify := notifyQuotaUser
	t.Cleanup(func() { submitQuotaNotification = previousSubmit; notifyQuotaUser = previousNotify })
	var queued func()
	submitQuotaNotification = func(work func()) { queued = work }
	sent := false
	original := dto.UserSetting{NotifyType: dto.NotifyTypeWebhook, Language: "zh-CN", QuotaWarningThreshold: 50, QuotaWarningThresholdUnit: common.QuotaDisplayUnitTokens}
	notifyQuotaUser = func(_ int, _ string, setting dto.UserSetting, _ dto.Notify) error {
		sent = true
		assert.Equal(t, original, setting)
		return nil
	}
	sendLegacyQuotaNotify(920, "user@example.com", original, 10, false)
	require.NotNil(t, queued)
	enabled := true
	user := model.User{Id: 920}
	user.SetSetting(dto.UserSetting{QuotaWarningEnabled: &enabled, QuotaWarningThreshold: 1, QuotaWarningThresholdUnit: common.QuotaDisplayUnitTokens})
	require.NoError(t, model.DB.Model(&user).Update("setting", user.Setting).Error)
	queued()
	assert.True(t, sent, "reloading opt-in must not recalculate the queued notification threshold")
}
