package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetChannelFilteredExcludesUnsupportedAdvancedCustomChannel(t *testing.T) {
	db := useChannelFailoverOptionDB(t)
	require.NoError(t, db.AutoMigrate(&Ability{}))

	const (
		group       = "path-filter"
		modelName   = "gpt-path-filter"
		requestPath = "/v1/chat/completions"
	)
	unsupportedPriority := int64(30)
	ordinaryPriority := int64(20)
	supportedPriority := int64(10)
	unsupported := newAbilityTestAdvancedCustomChannel(t, "unsupported", group, modelName, &unsupportedPriority, "/v1/responses")
	ordinary := &Channel{
		Key:      "ability-test-ordinary",
		Name:     "ability test ordinary",
		Group:    group,
		Models:   modelName,
		Type:     1,
		Status:   common.ChannelStatusEnabled,
		Priority: &ordinaryPriority,
	}
	supported := newAbilityTestAdvancedCustomChannel(t, "supported", group, modelName, &supportedPriority, requestPath)
	for _, channel := range []*Channel{unsupported, ordinary, supported} {
		require.NoError(t, db.Create(channel).Error)
		require.NoError(t, db.Create(&Ability{Group: group, Model: modelName, ChannelId: channel.Id, Enabled: true}).Error)
	}

	selected, err := GetChannelFiltered(group, modelName, 0, requestPath, ChannelSelectionFilter{})
	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, ordinary.Id, selected.Id, "ordinary channels remain eligible when an unsupported Advanced Custom channel is excluded")

	require.NoError(t, db.Model(&Ability{}).
		Where("channel_id = ?", ordinary.Id).
		Update("enabled", false).Error)
	selected, err = GetChannelFiltered(group, modelName, 0, requestPath, ChannelSelectionFilter{})
	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, supported.Id, selected.Id, "a path-compatible Advanced Custom channel remains eligible")
}

func TestGetRandomSatisfiedChannelFilteredPropagatesAdvancedCustomMetadataLookupFailure(t *testing.T) {
	db := useChannelFailoverOptionDB(t)
	require.NoError(t, db.AutoMigrate(&Ability{}))

	const (
		group       = "path-filter-failure"
		modelName   = "gpt-path-filter-failure"
		requestPath = "/v1/chat/completions"
	)
	unsupportedPriority := int64(30)
	ordinaryPriority := int64(20)
	unsupported := newAbilityTestAdvancedCustomChannel(t, "metadata-failure", group, modelName, &unsupportedPriority, "/v1/responses")
	ordinary := &Channel{
		Key:      "ability-test-metadata-failure-ordinary",
		Name:     "ability test metadata failure ordinary",
		Group:    group,
		Models:   modelName,
		Type:     1,
		Status:   common.ChannelStatusEnabled,
		Priority: &ordinaryPriority,
	}
	for _, channel := range []*Channel{unsupported, ordinary} {
		require.NoError(t, db.Create(channel).Error)
		require.NoError(t, db.Create(&Ability{Group: group, Model: modelName, ChannelId: channel.Id, Enabled: true}).Error)
	}

	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = false
	t.Cleanup(func() { common.MemoryCacheEnabled = originalMemoryCacheEnabled })

	metadataLookupError := errors.New("channel metadata lookup failed")
	channelQueryCount := 0
	callbackName := "ability_test:fail_first_channel_metadata_lookup"
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table != "channels" {
			return
		}
		channelQueryCount++
		if channelQueryCount == 1 {
			tx.AddError(metadataLookupError)
		}
	}))
	t.Cleanup(func() {
		require.NoError(t, db.Callback().Query().Remove(callbackName))
	})

	selected, err := GetRandomSatisfiedChannelFiltered(group, modelName, 0, requestPath, ChannelSelectionFilter{})

	require.ErrorIs(t, err, metadataLookupError)
	assert.Nil(t, selected, "the database fallback must not select an unverified Advanced Custom channel")
	assert.Equal(t, 1, channelQueryCount, "metadata lookup failure must stop selection before a later channel query can widen candidates")
}

func newAbilityTestAdvancedCustomChannel(t *testing.T, suffix, group, modelName string, priority *int64, incomingPath string) *Channel {
	t.Helper()
	channel := &Channel{
		Key:      "ability-test-advanced-" + suffix,
		Name:     "ability test advanced " + suffix,
		Group:    group,
		Models:   modelName,
		Type:     constant.ChannelTypeAdvancedCustom,
		Status:   common.ChannelStatusEnabled,
		Priority: priority,
	}
	channel.SetOtherSettings(dto.ChannelOtherSettings{AdvancedCustom: &dto.AdvancedCustomConfig{
		Routes: []dto.AdvancedCustomRoute{{
			IncomingPath: incomingPath,
			UpstreamPath: incomingPath,
			Models:       []string{modelName},
		}},
	}})
	return channel
}
