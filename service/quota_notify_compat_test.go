package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckAndSendQuotaNotifyPreservesLegacyWalletChannel(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
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
		UserSetting: dto.UserSetting{NotifyType: dto.NotifyTypeWebhook},
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

func TestCheckAndSendSubscriptionQuotaNotifyPreservesLegacyChannel(t *testing.T) {
	setupQuotaBillingPipelineTest(t, quotaPipelineOptions())
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
		UserSetting:                           dto.UserSetting{NotifyType: dto.NotifyTypeGotify},
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
		dto.UserSetting{NotifyType: dto.NotifyTypeBark},
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
