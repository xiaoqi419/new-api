package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetRandomSatisfiedChannelFilteredFailsClosedOutsidePool(t *testing.T) {
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true

	priorityHigh := int64(30)
	priorityPrimary := int64(20)
	priorityBackup := int64(10)
	channelSyncLock.Lock()
	originalGroupCache := group2model2channels
	originalChannels := channelsIDM
	originalAdvancedConfigs := channel2advancedCustomConfig
	group2model2channels = map[string]map[string][]int{
		"production": {"gpt-pool-test": {101, 102, 103}},
	}
	channelsIDM = map[int]*Channel{
		101: {Id: 101, Group: "production", Type: 1, Status: common.ChannelStatusEnabled, Priority: &priorityPrimary},
		102: {Id: 102, Group: "production", Type: 1, Status: common.ChannelStatusEnabled, Priority: &priorityBackup},
		103: {Id: 103, Group: "production", Type: 1, Status: common.ChannelStatusEnabled, Priority: &priorityHigh},
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

	filter := ChannelSelectionFilter{
		AllowedChannelIDs: map[int]struct{}{101: {}, 102: {}},
		ExcludedChannelIDs: map[int]struct{}{
			101: {},
		},
		ChannelType:        1,
		RequireChannelType: true,
	}
	selected, err := GetRandomSatisfiedChannelFiltered("production", "gpt-pool-test", 0, "", filter)

	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, 102, selected.Id)
}

func TestGetRandomSatisfiedChannelFilteredIgnoresMemberWhoseTypeNoLongerMatchesPool(t *testing.T) {
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true

	priorityInvalid := int64(20)
	priorityValid := int64(10)
	channelSyncLock.Lock()
	originalGroupCache := group2model2channels
	originalChannels := channelsIDM
	originalAdvancedConfigs := channel2advancedCustomConfig
	group2model2channels = map[string]map[string][]int{"production": {"gpt-pool-test": {101, 102}}}
	channelsIDM = map[int]*Channel{
		101: {Id: 101, Group: "production", Type: 2, Status: common.ChannelStatusEnabled, Priority: &priorityInvalid},
		102: {Id: 102, Group: "production", Type: 1, Status: common.ChannelStatusEnabled, Priority: &priorityValid},
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

	selected, err := GetRandomSatisfiedChannelFiltered("production", "gpt-pool-test", 0, "", ChannelSelectionFilter{
		AllowedChannelIDs:    map[int]struct{}{101: {}, 102: {}},
		ExpectedChannelTypes: map[int]int{101: 1, 102: 1},
	})

	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, 102, selected.Id)
}

func TestGetRandomSatisfiedChannelFilteredAppliesPoolFilterWithoutMemoryCache(t *testing.T) {
	db := useChannelFailoverOptionDB(t)
	require.NoError(t, db.AutoMigrate(&Ability{}))
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = false
	t.Cleanup(func() { common.MemoryCacheEnabled = originalMemoryCacheEnabled })

	priorityPrimary := int64(20)
	priorityBackup := int64(10)
	priorityUnlisted := int64(30)
	first := &Channel{Key: "pool-db-first", Name: "pool db first", Group: "production", Models: "gpt-pool-test", Type: 1, Status: common.ChannelStatusEnabled, Priority: &priorityPrimary}
	second := &Channel{Key: "pool-db-second", Name: "pool db second", Group: "production", Models: "gpt-pool-test", Type: 1, Status: common.ChannelStatusEnabled, Priority: &priorityBackup}
	unlisted := &Channel{Key: "pool-db-unlisted", Name: "pool db unlisted", Group: "production", Models: "gpt-pool-test", Type: 1, Status: common.ChannelStatusEnabled, Priority: &priorityUnlisted}
	for _, channel := range []*Channel{first, second, unlisted} {
		require.NoError(t, DB.Create(channel).Error)
		require.NoError(t, DB.Create(&Ability{Group: "production", Model: "gpt-pool-test", ChannelId: channel.Id, Enabled: true}).Error)
	}

	filter := ChannelSelectionFilter{
		AllowedChannelIDs: map[int]struct{}{first.Id: {}, second.Id: {}},
		ExcludedChannelIDs: map[int]struct{}{
			first.Id: {},
		},
		ChannelType:        1,
		RequireChannelType: true,
	}
	selected, err := GetRandomSatisfiedChannelFiltered("production", "gpt-pool-test", 0, "/v1/chat/completions", filter)

	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, second.Id, selected.Id)
}
