package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateChannelStatusReinsertsEnabledChannelIntoRuntimeCache(t *testing.T) {
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() {
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		InitChannelCache()
	})
	truncateTables(t)

	priority := int64(10)
	first := Channel{
		Name:     "runtime-cache-first",
		Key:      "first-key",
		Status:   common.ChannelStatusEnabled,
		Group:    "runtime-ha",
		Models:   "runtime-model",
		Priority: &priority,
	}
	second := Channel{
		Name:     "runtime-cache-second",
		Key:      "second-key",
		Status:   common.ChannelStatusEnabled,
		Group:    "runtime-ha",
		Models:   "runtime-model",
		Priority: &priority,
	}
	require.NoError(t, DB.Create(&first).Error)
	require.NoError(t, DB.Create(&second).Error)
	require.NoError(t, DB.Create(&Ability{Group: "runtime-ha", Model: "runtime-model", ChannelId: first.Id, Enabled: true}).Error)
	require.NoError(t, DB.Create(&Ability{Group: "runtime-ha", Model: "runtime-model", ChannelId: second.Id, Enabled: true}).Error)
	InitChannelCache()

	assert.Equal(t, []int{first.Id, second.Id}, CachedChannelIDsForGroupModel("runtime-ha", "runtime-model", ""))
	require.True(t, UpdateChannelStatus(first.Id, "", common.ChannelStatusAutoDisabled, "probe failed"))
	assert.Equal(t, []int{second.Id}, CachedChannelIDsForGroupModel("runtime-ha", "runtime-model", ""))

	require.True(t, UpdateChannelStatus(first.Id, "", common.ChannelStatusEnabled, "probe recovered"))
	ids := CachedChannelIDsForGroupModel("runtime-ha", "runtime-model", "")
	assert.Equal(t, []int{first.Id, second.Id}, ids)
	assert.True(t, IsChannelEnabledForGroupModel("runtime-ha", "runtime-model", first.Id))

	ids[0] = -1
	assert.Equal(t, []int{first.Id, second.Id}, CachedChannelIDsForGroupModel("runtime-ha", "runtime-model", ""), "callers must not mutate the runtime cache slice")
	selected, err := GetRandomSatisfiedChannel("runtime-ha", "runtime-model", 0, "")
	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Contains(t, []int{first.Id, second.Id}, selected.Id)
}
