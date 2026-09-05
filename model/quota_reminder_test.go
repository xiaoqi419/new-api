package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTransitionQuotaReminderCrossingIsDeduplicatedAndRearmed(t *testing.T) {
	truncateTables(t)
	triggered, err := TransitionQuotaReminder(101, QuotaReminderBalanceWallet, 0, 100, 40, 50)
	require.NoError(t, err)
	assert.True(t, triggered)
	triggered, err = TransitionQuotaReminder(101, QuotaReminderBalanceWallet, 0, 40, 30, 50)
	require.NoError(t, err)
	assert.False(t, triggered)
	triggered, err = TransitionQuotaReminder(101, QuotaReminderBalanceWallet, 0, 30, 80, 50)
	require.NoError(t, err)
	assert.False(t, triggered)
	triggered, err = TransitionQuotaReminder(101, QuotaReminderBalanceWallet, 0, 80, 20, 50)
	require.NoError(t, err)
	assert.True(t, triggered)
}

func TestTransitionQuotaReminderCapturesImmutableDisplaySnapshot(t *testing.T) {
	truncateTables(t)
	snapshotA := QuotaReminderSnapshot{
		DisplayUnit:        "CNY",
		QuotaPerUnit:       100,
		USDExchangeRate:    7.2,
		CustomExchangeRate: 1.5,
		CurrencySymbol:     "积分",
	}
	triggered, err := TransitionQuotaReminderWithSnapshot(109, QuotaReminderBalanceWallet, 0, 100, 40, 50, snapshotA)
	require.NoError(t, err)
	require.True(t, triggered)

	state, err := GetQuotaReminderState(109, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	captured, ok := state.QuotaReminderSnapshot()
	require.True(t, ok)
	assert.Equal(t, snapshotA.DisplayUnit, captured.DisplayUnit)
	assert.Equal(t, snapshotA.QuotaPerUnit, captured.QuotaPerUnit)
	assert.Equal(t, snapshotA.USDExchangeRate, captured.USDExchangeRate)
	assert.Equal(t, snapshotA.CustomExchangeRate, captured.CustomExchangeRate)
	assert.Equal(t, snapshotA.CurrencySymbol, captured.CurrencySymbol)

	// A changed currency/rate while the cycle is pending must not rewrite the
	// semantics that will be used by the original delivery or its retry.
	snapshotB := QuotaReminderSnapshot{
		DisplayUnit:        "USD",
		QuotaPerUnit:       1,
		USDExchangeRate:    1,
		CustomExchangeRate: 9,
		CurrencySymbol:     "¤",
	}
	triggered, err = TransitionQuotaReminderWithSnapshot(109, QuotaReminderBalanceWallet, 0, 40, 30, 80, snapshotB)
	require.NoError(t, err)
	assert.False(t, triggered)
	state, err = GetQuotaReminderState(109, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, int64(50), state.Threshold, "active cycle threshold remains immutable")
	captured, ok = state.QuotaReminderSnapshot()
	require.True(t, ok)
	assert.Equal(t, snapshotA, captured)

	// Recovery ends the old cycle and allows the next crossing to capture the
	// newly configured display semantics.
	triggered, err = TransitionQuotaReminderWithSnapshot(109, QuotaReminderBalanceWallet, 0, 30, 100, 80, snapshotB)
	require.NoError(t, err)
	assert.False(t, triggered)
	state, err = GetQuotaReminderState(109, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, int64(80), state.Threshold)
	_, ok = state.QuotaReminderSnapshot()
	assert.False(t, ok, "recovery clears the completed cycle snapshot")

	triggered, err = TransitionQuotaReminderWithSnapshot(109, QuotaReminderBalanceWallet, 0, 100, 40, 80, snapshotB)
	require.NoError(t, err)
	assert.True(t, triggered)
	state, err = GetQuotaReminderState(109, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	captured, ok = state.QuotaReminderSnapshot()
	require.True(t, ok)
	assert.Equal(t, snapshotB, captured)
}

func TestTransitionQuotaReminderSeparatesWalletAndSubscription(t *testing.T) {
	truncateTables(t)
	wallet, err := TransitionQuotaReminder(102, QuotaReminderBalanceWallet, 0, 100, 10, 50)
	require.NoError(t, err)
	subscription, err := TransitionQuotaReminder(102, QuotaReminderBalanceSubscription, 77, 100, 10, 50)
	require.NoError(t, err)
	assert.True(t, wallet)
	assert.True(t, subscription)

	state, err := GetQuotaReminderState(102, QuotaReminderBalanceSubscription, 77)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, int64(10), state.LastBalance)
}

func TestTransitionQuotaReminderInitialRecoveryArmsNextCrossing(t *testing.T) {
	truncateTables(t)
	triggered, err := TransitionQuotaReminder(103, QuotaReminderBalanceWallet, 0, 20, 80, 50)
	require.NoError(t, err)
	assert.False(t, triggered)

	state, err := GetQuotaReminderState(103, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.True(t, state.Armed)

	triggered, err = TransitionQuotaReminder(103, QuotaReminderBalanceWallet, 0, 80, 20, 50)
	require.NoError(t, err)
	assert.True(t, triggered)
}

func TestSeedQuotaReminderBaselinePreservesConcurrentLowCrossing(t *testing.T) {
	truncateTables(t)
	triggered, err := TransitionQuotaReminder(110, QuotaReminderBalanceWallet, 0, 100, 40, 50)
	require.NoError(t, err)
	require.True(t, triggered)

	// The baseline scan may have read a stale high balance while an observer
	// already recorded the real low crossing. It must not re-arm that cycle.
	require.NoError(t, SeedQuotaReminderBaseline(110, QuotaReminderBalanceWallet, 0, 100, 50))
	state, err := GetQuotaReminderState(110, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, QuotaReminderStatusLowPending, state.Status)
	assert.False(t, state.Armed)
}

func TestClaimQuotaReminderDeliveryAndSentSnapshot(t *testing.T) {
	truncateTables(t)
	triggered, err := TransitionQuotaReminder(104, QuotaReminderBalanceWallet, 0, 100, 40, 50)
	require.NoError(t, err)
	require.True(t, triggered)

	claimed, err := ClaimQuotaReminderDelivery(104, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.True(t, claimed)
	claimed, err = ClaimQuotaReminderDelivery(104, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	assert.False(t, claimed)

	require.NoError(t, MarkQuotaReminderSent(104, QuotaReminderBalanceWallet, 0, 50, "custom", `{"subject":"Low"}`))
	state, err := GetQuotaReminderState(104, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, QuotaReminderStatusSent, state.Status)
	assert.Equal(t, "custom", state.TemplateID)
	assert.Equal(t, `{"subject":"Low"}`, state.Template)
	assert.Equal(t, int64(50), state.Threshold)
	assert.Equal(t, int64(50), state.SentThreshold)
}

func TestQuotaReminderDeliveryTokenRejectsStaleClaimCompletion(t *testing.T) {
	truncateTables(t)
	triggered, err := TransitionQuotaReminder(106, QuotaReminderBalanceWallet, 0, 100, 40, 50)
	require.NoError(t, err)
	require.True(t, triggered)

	firstToken, claimed, err := ClaimQuotaReminderDeliveryWithToken(106, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.True(t, claimed)
	require.NotEmpty(t, firstToken)
	require.NoError(t, DB.Model(&QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ?", 106, QuotaReminderBalanceWallet, 0).
		Update("last_attempt_at", common.GetTimestamp()-11*60).Error)

	secondToken, claimed, err := ClaimQuotaReminderDeliveryWithToken(106, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.True(t, claimed)
	require.NotEmpty(t, secondToken)
	assert.NotEqual(t, firstToken, secondToken)

	updated, err := MarkQuotaReminderSentWithToken(106, QuotaReminderBalanceWallet, 0, firstToken, 50, "default", `{}`)
	require.NoError(t, err)
	assert.False(t, updated)

	updated, err = MarkQuotaReminderSentWithToken(106, QuotaReminderBalanceWallet, 0, secondToken, 50, "default", `{}`)
	require.NoError(t, err)
	assert.True(t, updated)
}

func TestQuotaReminderDeliveryTokenIsInvalidatedWhenDisabled(t *testing.T) {
	truncateTables(t)
	triggered, err := TransitionQuotaReminder(107, QuotaReminderBalanceWallet, 0, 100, 40, 50)
	require.NoError(t, err)
	require.True(t, triggered)

	token, claimed, err := ClaimQuotaReminderDeliveryWithToken(107, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.True(t, claimed)
	require.NoError(t, suppressPendingQuotaReminders(DB))

	updated, err := MarkQuotaReminderSentWithToken(107, QuotaReminderBalanceWallet, 0, token, 50, "default", `{}`)
	require.NoError(t, err)
	assert.False(t, updated)

	state, err := GetQuotaReminderState(107, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, QuotaReminderStatusSuppressed, state.Status)
	assert.Empty(t, state.DeliveryToken)
}

func TestQuotaReminderDeliveryTokenAllowsFailedAttemptRetry(t *testing.T) {
	truncateTables(t)
	triggered, err := TransitionQuotaReminder(108, QuotaReminderBalanceWallet, 0, 100, 40, 50)
	require.NoError(t, err)
	require.True(t, triggered)

	firstToken, claimed, err := ClaimQuotaReminderDeliveryWithToken(108, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.True(t, claimed)
	updated, err := MarkQuotaReminderFailedWithToken(108, QuotaReminderBalanceWallet, 0, firstToken, assert.AnError)
	require.NoError(t, err)
	assert.True(t, updated)

	secondToken, claimed, err := ClaimQuotaReminderDeliveryWithToken(108, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.True(t, claimed)
	assert.NotEmpty(t, secondToken)
	assert.NotEqual(t, firstToken, secondToken)
}

func TestDisabledQuotaReminderSuppressesExistingLowCycle(t *testing.T) {
	truncateTables(t)
	previousEnabled := common.QuotaRemindEnabled
	common.QuotaRemindEnabled = true
	t.Cleanup(func() { common.QuotaRemindEnabled = previousEnabled })

	triggered, err := TransitionQuotaReminder(105, QuotaReminderBalanceWallet, 0, 100, 40, 50)
	require.NoError(t, err)
	require.True(t, triggered)
	require.NoError(t, suppressPendingQuotaReminders(DB))

	common.QuotaRemindEnabled = false
	ObserveQuotaReminderBalance(105, QuotaReminderBalanceWallet, 0, 30)
	state, err := GetQuotaReminderState(105, QuotaReminderBalanceWallet, 0)
	require.NoError(t, err)
	require.NotNil(t, state)
	assert.Equal(t, QuotaReminderStatusSuppressed, state.Status)
	assert.False(t, state.Armed)

	common.QuotaRemindEnabled = true
	triggered, err = TransitionQuotaReminder(105, QuotaReminderBalanceWallet, 0, state.LastBalance, 20, 50)
	require.NoError(t, err)
	assert.False(t, triggered)
	triggered, err = TransitionQuotaReminder(105, QuotaReminderBalanceWallet, 0, 20, 80, 50)
	require.NoError(t, err)
	assert.False(t, triggered)
	triggered, err = TransitionQuotaReminder(105, QuotaReminderBalanceWallet, 0, 80, 20, 50)
	require.NoError(t, err)
	assert.True(t, triggered)
}
