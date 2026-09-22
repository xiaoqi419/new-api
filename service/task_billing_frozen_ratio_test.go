package service

import (
	"context"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestTaskTokenSettlementUsesFrozenRatiosIncludingZero(t *testing.T) {
	previousModel, previousGroup, previousSpecial := ratio_setting.ModelRatio2JSONString(), ratio_setting.GroupRatio2JSONString(), ratio_setting.GroupGroupRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"frozen-task":9}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":7}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{}`))
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(previousModel))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousGroup))
		require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(previousSpecial))
	})
	for _, tc := range []struct {
		name     string
		snapshot *model.TaskBillingContext
		expected int
	}{
		{"frozen_model_group_and_other", &model.TaskBillingContext{ModelRatio: 2, GroupRatio: 3, OtherRatios: map[string]float64{"video_ratio": 0.5}, OriginModelName: "frozen-task"}, 30},
		{"free_model", &model.TaskBillingContext{ModelRatio: 0, GroupRatio: 3, OriginModelName: "frozen-task"}, 0},
		{"free_group", &model.TaskBillingContext{ModelRatio: 2, GroupRatio: 0, OriginModelName: "frozen-task"}, 0},
		{"historical_without_snapshot", nil, 630},
	} {
		t.Run(tc.name, func(t *testing.T) {
			truncate(t)
			const userID, channelID = 9871, 9871
			seedUser(t, userID, 950)
			seedChannel(t, channelID)
			seedChargedAccounting(t, userID, channelID, 0, 50, 1)
			task := makeTask(userID, channelID, 50, 0, BillingSourceWallet, 0)
			task.Properties.OriginModelName = "frozen-task"
			task.PrivateData.BillingContext = tc.snapshot
			task.Status = model.TaskStatusSuccess
			require.NoError(t, model.DB.Create(task).Error)
			require.True(t, RecalculateTaskQuotaByTokens(context.Background(), task, 10))
			assert.Equal(t, tc.expected, task.Quota)
			assert.Equal(t, 1000-tc.expected, getUserQuota(t, userID))
			assert.Equal(t, tc.expected, getTaskQuota(t, task.ID))
			var user model.User
			require.NoError(t, model.DB.First(&user, userID).Error)
			assert.Equal(t, tc.expected, user.UsedQuota)
			assert.Equal(t, common.UserStatusEnabled, user.Status)
		})
	}
}
