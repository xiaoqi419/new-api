package operation_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelRoutingPoolSettingPersistsPoolsAsOneOption(t *testing.T) {
	configured := ChannelRoutingPoolSetting{
		Pools: []ChannelRoutingPool{{
			ID:          "openai-production",
			Name:        "OpenAI production",
			Enabled:     true,
			Group:       "production",
			ChannelType: 1,
			ChannelIDs:  []int{101, 102},
		}},
	}
	manager := config.NewConfigManager()
	manager.Register(ChannelRoutingPoolSettingConfigName, &configured)

	persisted := make(map[string]string)
	require.NoError(t, manager.SaveToDB(func(key, value string) error {
		persisted[key] = value
		return nil
	}))
	require.Equal(t, 1, len(persisted))
	storedPools, ok := persisted[ChannelRoutingPoolSettingConfigName+".pools"]
	require.True(t, ok)

	var decoded []ChannelRoutingPool
	require.NoError(t, common.Unmarshal([]byte(storedPools), &decoded))
	assert.Equal(t, configured.Pools, decoded)

	loaded := DefaultChannelRoutingPoolSetting()
	loadedManager := config.NewConfigManager()
	loadedManager.Register(ChannelRoutingPoolSettingConfigName, &loaded)
	require.NoError(t, loadedManager.LoadFromDB(persisted))
	assert.Equal(t, configured.Pools, loaded.Pools)
}

func TestValidateChannelRoutingPoolSettingRejectsDuplicateEnabledGroupAndType(t *testing.T) {
	setting := ChannelRoutingPoolSetting{Pools: []ChannelRoutingPool{
		{
			ID:          "openai-a",
			Name:        "OpenAI A",
			Enabled:     true,
			Group:       "production",
			ChannelType: 1,
			ChannelIDs:  []int{101, 102},
		},
		{
			ID:          "openai-b",
			Name:        "OpenAI B",
			Enabled:     true,
			Group:       "production",
			ChannelType: 1,
			ChannelIDs:  []int{103, 104},
		},
	}}

	err := ValidateChannelRoutingPoolSetting(setting)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "enabled pool")
}

func TestValidateChannelRoutingPoolSettingRejectsDuplicateChannelIDs(t *testing.T) {
	setting := ChannelRoutingPoolSetting{Pools: []ChannelRoutingPool{{
		ID:          "openai-a",
		Name:        "OpenAI A",
		Enabled:     true,
		Group:       "production",
		ChannelType: 1,
		ChannelIDs:  []int{101, 101},
	}}}

	err := ValidateChannelRoutingPoolSetting(setting)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unique")
}
