package service

import (
	"context"
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSettleAutoDurationUsesActualSecondsAndFrozenRatios(t *testing.T) {
	previousUnit := common.QuotaPerUnit
	previousPatches := constant.TaskPricePatches
	common.QuotaPerUnit = 1000
	t.Cleanup(func() {
		common.QuotaPerUnit = previousUnit
		constant.TaskPricePatches = previousPatches
	})

	for _, tc := range []struct {
		name      string
		seconds   float64
		wantQuota int
	}{
		{"refund unused reservation", 5, 750},
		{"fractional usage", 5.25, 787},
		{"zero usage refunds all", 0, 0},
		{"exact reservation", 30, 4500},
		{"additional bounded usage", 40, 6000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			truncate(t)
			const userID, tokenID, channelID = 61, 61, 61
			const initialQuota, tokenRemain, reservedQuota = 20_000, 15_000, 4500
			seedUser(t, userID, initialQuota)
			seedToken(t, tokenID, userID, "auto-duration-token", tokenRemain)
			seedChannel(t, channelID)
			seedChargedAccounting(t, userID, channelID, tokenID, reservedQuota, 1)
			task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
			task.Status = model.TaskStatusSuccess
			task.PrivateData.BillingContext = &model.TaskBillingContext{
				ModelPrice: 0.1, GroupRatio: 2, PerCallBilling: true,
				OriginModelName: "wan3.0-video",
				OtherRatios:     map[string]float64{"auto_duration": 1, "seconds": 30, "resolution-1080P": 1.5, "video_discount": 0.5},
			}
			require.NoError(t, model.DB.Create(task).Error)
			// A restart/config change cannot turn the frozen seconds reservation
			// into flat pricing while this already-submitted task is running.
			constant.TaskPricePatches = []string{"wan3.0-video"}

			settled := settleTaskBillingOnComplete(context.Background(), &mockAdaptor{adjustReturn: 123}, task, &relaycommon.TaskInfo{
				Status: model.TaskStatusSuccess, TotalTokens: 9999,
				UsageFacts: map[string]any{"seconds": tc.seconds, "resolution": "480P"},
			})

			require.True(t, settled)
			assert.Equal(t, tc.wantQuota, task.Quota)
			assert.Equal(t, initialQuota+reservedQuota-tc.wantQuota, getUserQuota(t, userID))
			assert.Equal(t, tokenRemain+reservedQuota-tc.wantQuota, getTokenRemainQuota(t, tokenID))
			assert.Equal(t, tc.wantQuota, getTokenUsedQuota(t, tokenID))
			used, requests := getUserUsageAccounting(t, userID)
			assert.Equal(t, tc.wantQuota, used)
			assert.Equal(t, 1, requests)
			assert.EqualValues(t, tc.wantQuota, getChannelUsedQuota(t, channelID))
			var stored model.Task
			require.NoError(t, model.DB.First(&stored, task.ID).Error)
			assert.Equal(t, tc.wantQuota, stored.Quota)
			ratios := stored.PrivateData.BillingContext.OtherRatios
			assert.Equal(t, 1.5, ratios["resolution-1080P"])
			assert.Equal(t, 0.5, ratios["video_discount"])
			if tc.seconds > 0 {
				assert.Equal(t, tc.seconds, ratios["seconds"])
			} else {
				assert.NotContains(t, ratios, "seconds", "zero usage must not become an invalid multiplier")
			}
			if tc.wantQuota == reservedQuota {
				assert.Zero(t, countLogs(t))
				return
			}
			log := getLastLog(t)
			require.NotNil(t, log)
			metadata, err := common.StrToMap(log.Other)
			require.NoError(t, err)
			assert.EqualValues(t, tc.wantQuota, metadata["actual_quota"])
			assert.Contains(t, log.Content, "Settled by actual duration:")
			var content struct {
				Parts []struct {
					Params map[string]any `json:"params"`
				} `json:"content_parts"`
			}
			require.NoError(t, common.UnmarshalJsonStr(log.Other, &content))
			require.Len(t, content.Parts, 1)
			assert.Equal(t, tc.seconds, content.Parts[0].Params["seconds"])
			if tc.seconds > 0 {
				assert.Equal(t, tc.seconds, metadata["seconds"])
			} else {
				assert.NotContains(t, metadata, "seconds")
			}
		})
	}
}

func TestSettleAutoDurationMissingOrInvalidFactsRetainReservation(t *testing.T) {
	previousUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 1000
	t.Cleanup(func() { common.QuotaPerUnit = previousUnit })

	for _, tc := range []struct {
		name     string
		facts    map[string]any
		reserved float64
		price    float64
		group    float64
	}{
		{"missing", nil, 30, 0.1, 2},
		{"null", map[string]any{"seconds": nil}, 30, 0.1, 2},
		{"numeric string", map[string]any{"seconds": "5"}, 30, 0.1, 2},
		{"negative", map[string]any{"seconds": -1.0}, 30, 0.1, 2},
		{"nan", map[string]any{"seconds": math.NaN()}, 30, 0.1, 2},
		{"infinite", map[string]any{"seconds": math.Inf(1)}, 30, 0.1, 2},
		{"over host bound", map[string]any{"seconds": float64(relaycommon.MaxTaskDurationSeconds + 1)}, 30, 0.1, 2},
		{"reservation missing", map[string]any{"seconds": 5.0}, 0, 0.1, 2},
		{"reservation over host bound", map[string]any{"seconds": 5.0}, relaycommon.MaxTaskDurationSeconds + 1, 0.1, 2},
		{"negative price", map[string]any{"seconds": 5.0}, 30, -0.1, 2},
		{"nonfinite price", map[string]any{"seconds": 5.0}, 30, math.Inf(1), 2},
		{"negative group", map[string]any{"seconds": 5.0}, 30, 0.1, -2},
		{"nonfinite group", map[string]any{"seconds": 5.0}, 30, 0.1, math.NaN()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			truncate(t)
			const userID, tokenID, channelID = 62, 62, 62
			const initialQuota, tokenRemain, reservedQuota = 20_000, 15_000, 4500
			seedUser(t, userID, initialQuota)
			seedToken(t, tokenID, userID, "invalid-auto-duration-token", tokenRemain)
			seedChannel(t, channelID)
			seedChargedAccounting(t, userID, channelID, tokenID, reservedQuota, 1)
			task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
			task.Status = model.TaskStatusSuccess
			bc := task.PrivateData.BillingContext
			bc.PerCallBilling, bc.ModelPrice, bc.GroupRatio = true, tc.price, tc.group
			bc.OtherRatios = map[string]float64{"auto_duration": 1, "seconds": tc.reserved, "resolution-1080P": 1.5}
			previousRatios := bc.OtherRatios

			settled := settleTaskBillingOnComplete(context.Background(), &mockAdaptor{adjustReturn: 123}, task, &relaycommon.TaskInfo{
				Status: model.TaskStatusSuccess, TotalTokens: 9999, UsageFacts: tc.facts,
			})

			assert.True(t, settled)
			assert.Equal(t, reservedQuota, task.Quota)
			assert.Equal(t, previousRatios, bc.OtherRatios)
			assert.Equal(t, initialQuota, getUserQuota(t, userID))
			assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
			assert.Equal(t, reservedQuota, getTokenUsedQuota(t, tokenID))
			used, requests := getUserUsageAccounting(t, userID)
			assert.Equal(t, reservedQuota, used)
			assert.Equal(t, 1, requests)
			assert.EqualValues(t, reservedQuota, getChannelUsedQuota(t, channelID))
			assert.Zero(t, countLogs(t))
		})
	}
}

func TestSettleFixedPerCallDurationKeepsReservation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		ratios map[string]float64
	}{
		{"fixed duration", map[string]float64{"seconds": 30}},
		{"different marker", map[string]float64{"seconds": 30, "auto_duration": 2}},
		{"disabled marker", map[string]float64{"seconds": 30, "auto_duration": 0}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			truncate(t)
			const userID, tokenID, channelID = 63, 63, 63
			const initialQuota, tokenRemain, reservedQuota = 20_000, 15_000, 4500
			seedUser(t, userID, initialQuota)
			seedToken(t, tokenID, userID, "fixed-duration-token", tokenRemain)
			seedChannel(t, channelID)
			seedChargedAccounting(t, userID, channelID, tokenID, reservedQuota, 1)
			task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
			task.Status = model.TaskStatusSuccess
			task.PrivateData.BillingContext.PerCallBilling = true
			task.PrivateData.BillingContext.OtherRatios = tc.ratios

			assert.False(t, settleTaskBillingOnComplete(context.Background(), &mockAdaptor{adjustReturn: 123}, task, &relaycommon.TaskInfo{
				Status: model.TaskStatusSuccess, TotalTokens: 9999, UsageFacts: map[string]any{"seconds": 5.0},
			}))
			assert.Equal(t, reservedQuota, task.Quota)
			assert.Equal(t, initialQuota, getUserQuota(t, userID))
			assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
			assert.Equal(t, reservedQuota, getTokenUsedQuota(t, tokenID))
			used, requests := getUserUsageAccounting(t, userID)
			assert.Equal(t, reservedQuota, used)
			assert.Equal(t, 1, requests)
			assert.EqualValues(t, reservedQuota, getChannelUsedQuota(t, channelID))
			assert.Zero(t, countLogs(t))
		})
	}
}

func TestSettleAutoDurationFailedTaskRefundsFullReservation(t *testing.T) {
	truncate(t)
	const userID, tokenID, channelID = 64, 64, 64
	const initialQuota, tokenRemain, reservedQuota = 20_000, 15_000, 4500
	seedUser(t, userID, initialQuota)
	seedToken(t, tokenID, userID, "failed-auto-duration-token", tokenRemain)
	seedChannel(t, channelID)
	seedChargedAccounting(t, userID, channelID, tokenID, reservedQuota, 1)
	task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatusFailure
	task.FailReason = "upstream failed"
	task.PrivateData.BillingContext.PerCallBilling = true
	task.PrivateData.BillingContext.OtherRatios = map[string]float64{"auto_duration": 1, "seconds": 30}
	require.NoError(t, model.DB.Create(task).Error)

	finalizeTerminalTask(context.Background(), &mockAdaptor{adjustReturn: 123}, task, &relaycommon.TaskInfo{
		Status: model.TaskStatusFailure, UsageFacts: map[string]any{"seconds": 5.0},
	})

	assert.Zero(t, task.Quota)
	assert.Equal(t, initialQuota+reservedQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain+reservedQuota, getTokenRemainQuota(t, tokenID))
	assert.Zero(t, getTokenUsedQuota(t, tokenID))
	used, requests := getUserUsageAccounting(t, userID)
	assert.Zero(t, used)
	assert.Equal(t, 1, requests)
	assert.Zero(t, getChannelUsedQuota(t, channelID))
	assert.Equal(t, 30.0, task.PrivateData.BillingContext.OtherRatios["seconds"])
	assert.Equal(t, int64(1), countLogs(t))
	assert.Equal(t, model.LogTypeRefund, getLastLog(t).Type)
}

func TestSettleAutoDurationFailedFundingKeepsReservationSnapshot(t *testing.T) {
	truncate(t)
	previousUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 1000
	t.Cleanup(func() { common.QuotaPerUnit = previousUnit })
	const userID, reservedQuota = 65, 4500
	seedUser(t, userID, 20_000)
	task := makeTask(userID, 0, reservedQuota, 0, BillingSourceSubscription, 999)
	task.Status = model.TaskStatusSuccess
	task.PrivateData.BillingContext = &model.TaskBillingContext{
		ModelPrice: 0.1, GroupRatio: 2, PerCallBilling: true,
		OtherRatios: map[string]float64{"auto_duration": 1, "seconds": 30, "resolution-1080P": 1.5, "video_discount": 0.5},
	}
	require.NoError(t, model.DB.Create(task).Error)

	assert.True(t, settleTaskBillingOnComplete(context.Background(), &mockAdaptor{}, task, &relaycommon.TaskInfo{
		Status: model.TaskStatusSuccess, UsageFacts: map[string]any{"seconds": 5.0},
	}))

	assert.Equal(t, reservedQuota, task.Quota)
	assert.Equal(t, 30.0, task.PrivateData.BillingContext.OtherRatios["seconds"])
	var stored model.Task
	require.NoError(t, model.DB.First(&stored, task.ID).Error)
	assert.Equal(t, reservedQuota, stored.Quota)
	assert.Equal(t, 30.0, stored.PrivateData.BillingContext.OtherRatios["seconds"])
	assert.Equal(t, 20_000, getUserQuota(t, userID))
	assert.Zero(t, countLogs(t))
}

func TestSettleAutoDurationSaturationIsAudited(t *testing.T) {
	truncate(t)
	previousUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 1000
	t.Cleanup(func() { common.QuotaPerUnit = previousUnit })
	const userID, tokenID, channelID = 66, 66, 66
	const initialQuota, reservedQuota = common.MaxQuota + 10_000, 4500
	seedUser(t, userID, initialQuota)
	seedToken(t, tokenID, userID, "saturated-auto-duration-token", initialQuota)
	seedChannel(t, channelID)
	seedChargedAccounting(t, userID, channelID, tokenID, reservedQuota, 1)
	task := makeTask(userID, channelID, reservedQuota, tokenID, BillingSourceWallet, 0)
	task.Status = model.TaskStatusSuccess
	task.PrivateData.BillingContext = &model.TaskBillingContext{
		ModelPrice: 1_000_000, GroupRatio: 1, PerCallBilling: true,
		OtherRatios: map[string]float64{"auto_duration": 1, "seconds": 30},
	}
	require.NoError(t, model.DB.Create(task).Error)

	assert.True(t, settleTaskBillingOnComplete(context.Background(), &mockAdaptor{}, task, &relaycommon.TaskInfo{
		Status: model.TaskStatusSuccess, UsageFacts: map[string]any{"seconds": 5.0},
	}))

	assert.Equal(t, common.MaxQuota, task.Quota)
	assert.Equal(t, initialQuota+reservedQuota-common.MaxQuota, getUserQuota(t, userID))
	assert.Equal(t, initialQuota+reservedQuota-common.MaxQuota, getTokenRemainQuota(t, tokenID))
	assert.Equal(t, common.MaxQuota, getTokenUsedQuota(t, tokenID))
	used, _ := getUserUsageAccounting(t, userID)
	assert.Equal(t, common.MaxQuota, used)
	assert.EqualValues(t, common.MaxQuota, getChannelUsedQuota(t, channelID))
	log := getLastLog(t)
	require.NotNil(t, log)
	assert.Equal(t, model.LogTypeConsume, log.Type)
	metadata, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	admin, ok := metadata["admin_info"].(map[string]any)
	require.True(t, ok)
	clamp, ok := admin["quota_saturation"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "QuotaFromDecimal", clamp["op"])
	assert.Equal(t, "overflow", clamp["kind"])
	assert.EqualValues(t, common.MaxQuota, clamp["clamped"])
}
