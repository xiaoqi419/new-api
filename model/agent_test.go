package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetAgentSellGroupRatio(t *testing.T) {
	setupAgentSettleTest(t)
	agent := Agent{Id: 1, OwnerUserId: 9, Name: "a1", Status: AgentStatusActive, CostRatio: 1, SellGroupRatios: `{"default":1.5,"vip":2}`}
	require.NoError(t, DB.Create(&agent).Error)
	t.Cleanup(func() { InvalidateAgentRatioCache(agent.Id) })

	r, ok := GetAgentSellGroupRatio(agent.Id, "default")
	assert.True(t, ok)
	assert.Equal(t, 1.5, r)

	_, ok = GetAgentSellGroupRatio(agent.Id, "unknown")
	assert.False(t, ok)

	_, ok = GetAgentSellGroupRatio(0, "default")
	assert.False(t, ok)

	// 更新后失效缓存并反映新值
	require.NoError(t, UpdateAgentSellGroupRatios(agent.Id, `{"default":1.2}`))
	r, ok = GetAgentSellGroupRatio(agent.Id, "default")
	assert.True(t, ok)
	assert.Equal(t, 1.2, r)
}
