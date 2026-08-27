package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetRandomSatisfiedChannelExcludingSkipsFailedHigherPriorityChannel(t *testing.T) {
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true

	higherPriority := int64(20)
	lowerPriority := int64(10)
	channelSyncLock.Lock()
	originalGroupCache := group2model2channels
	originalChannels := channelsIDM
	originalAdvancedConfigs := channel2advancedCustomConfig
	group2model2channels = map[string]map[string][]int{
		"automatic": {"gpt-test": {101, 102}},
	}
	channelsIDM = map[int]*Channel{
		101: {Id: 101, Group: "automatic", Status: common.ChannelStatusEnabled, Priority: &higherPriority},
		102: {Id: 102, Group: "automatic", Status: common.ChannelStatusEnabled, Priority: &lowerPriority},
	}
	channel2advancedCustomConfig = map[int]*dto.AdvancedCustomConfig{}
	channelSyncLock.Unlock()
	t.Cleanup(func() {
		channelSyncLock.Lock()
		group2model2channels = originalGroupCache
		channelsIDM = originalChannels
		channel2advancedCustomConfig = originalAdvancedConfigs
		channelSyncLock.Unlock()
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
	})

	selected, err := GetRandomSatisfiedChannelExcluding("automatic", "gpt-test", 0, "", map[int]struct{}{101: {}})

	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, 102, selected.Id)
}
