package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useChannelFailoverOptionDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	previousDatabaseType := common.MainDatabaseType()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}, &Channel{}))
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousDatabaseType)
	})
	return db
}

func useChannelFailoverPoolSetting(t *testing.T, setting operation_setting.ChannelRoutingPoolSetting) {
	t.Helper()
	configured, ok := config.GlobalConfig.Get(operation_setting.ChannelRoutingPoolSettingConfigName).(*operation_setting.ChannelRoutingPoolSetting)
	require.True(t, ok)
	original := *configured
	original.Pools = append([]operation_setting.ChannelRoutingPool(nil), configured.Pools...)
	for i := range original.Pools {
		original.Pools[i].ChannelIDs = append([]int(nil), configured.Pools[i].ChannelIDs...)
	}
	*configured = setting
	t.Cleanup(func() { *configured = original })
}

func useChannelFailoverOptionMap(t *testing.T) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	original := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = original
		common.OptionMapRWMutex.Unlock()
	})
}

func addChannelFailoverPoolChannel(t *testing.T, db *gorm.DB, group string, channelType, status int) *Channel {
	t.Helper()
	channel := &Channel{
		Key:    "pool-test-key",
		Name:   "pool test channel",
		Group:  group,
		Type:   channelType,
		Status: status,
	}
	require.NoError(t, db.Create(channel).Error)
	return channel
}

func TestUpdateChannelFailoverPoolOptionRejectsInvalidMembersBeforePersistence(t *testing.T) {
	db := useChannelFailoverOptionDB(t)
	useChannelFailoverOptionMap(t)
	useChannelFailoverPoolSetting(t, operation_setting.DefaultChannelRoutingPoolSetting())
	channel := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusEnabled)

	value := fmt.Sprintf(`[{"id":"openai-production","name":"OpenAI production","enabled":true,"group":"production","channel_type":1,"channel_ids":[%d,99999]}]`, channel.Id)
	err := UpdateOption(operation_setting.ChannelRoutingPoolSettingConfigName+".pools", value)

	require.Error(t, err)
	var option Option
	assert.ErrorIs(t, db.Where(&Option{Key: operation_setting.ChannelRoutingPoolSettingConfigName + ".pools"}).First(&option).Error, gorm.ErrRecordNotFound)
	common.OptionMapRWMutex.RLock()
	_, published := common.OptionMap[operation_setting.ChannelRoutingPoolSettingConfigName+".pools"]
	common.OptionMapRWMutex.RUnlock()
	assert.False(t, published)
}

func TestUpdateChannelFailoverPoolOptionPersistsValidatedPoolsAndHotApplies(t *testing.T) {
	db := useChannelFailoverOptionDB(t)
	useChannelFailoverOptionMap(t)
	useChannelFailoverPoolSetting(t, operation_setting.DefaultChannelRoutingPoolSetting())
	first := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusEnabled)
	second := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusEnabled)
	value := `[{"id":"openai-production","name":"OpenAI production","enabled":true,"group":"production","channel_type":1,"channel_ids":[` +
		fmt.Sprintf("%d,%d", first.Id, second.Id) + `]}]`

	require.NoError(t, UpdateOption(operation_setting.ChannelRoutingPoolSettingConfigName+".pools", value))

	var option Option
	require.NoError(t, db.Where(&Option{Key: operation_setting.ChannelRoutingPoolSettingConfigName + ".pools"}).First(&option).Error)
	assert.Equal(t, value, option.Value)
	pools := operation_setting.GetChannelRoutingPoolSetting().Pools
	require.Len(t, pools, 1)
	assert.Equal(t, []int{first.Id, second.Id}, pools[0].ChannelIDs)
}

func TestUpdateChannelFailoverPoolOptionAllowsAutoDisabledMembers(t *testing.T) {
	db := useChannelFailoverOptionDB(t)
	useChannelFailoverOptionMap(t)
	useChannelFailoverPoolSetting(t, operation_setting.DefaultChannelRoutingPoolSetting())
	first := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusAutoDisabled)
	second := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusEnabled)
	value := fmt.Sprintf(`[{"id":"openai-production","name":"OpenAI production","enabled":true,"group":"production","channel_type":1,"channel_ids":[%d,%d]}]`, first.Id, second.Id)

	require.NoError(t, UpdateOption(operation_setting.ChannelRoutingPoolSettingConfigName+".pools", value))

	var option Option
	require.NoError(t, db.Where(&Option{Key: operation_setting.ChannelRoutingPoolSettingConfigName + ".pools"}).First(&option).Error)
	assert.Equal(t, value, option.Value)
	assert.Equal(t, []int{first.Id, second.Id}, operation_setting.GetChannelRoutingPoolSetting().Pools[0].ChannelIDs)
}

func TestUpdateOptionsBulkRejectsDuplicateEnabledPoolTypeBeforePersistence(t *testing.T) {
	db := useChannelFailoverOptionDB(t)
	useChannelFailoverOptionMap(t)
	useChannelFailoverPoolSetting(t, operation_setting.DefaultChannelRoutingPoolSetting())
	first := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusEnabled)
	second := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusEnabled)
	third := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusEnabled)
	fourth := addChannelFailoverPoolChannel(t, db, "production", 1, common.ChannelStatusEnabled)
	value := fmt.Sprintf(`[{"id":"one","name":"One","enabled":true,"group":"production","channel_type":1,"channel_ids":[%d,%d]},{"id":"two","name":"Two","enabled":true,"group":"production","channel_type":1,"channel_ids":[%d,%d]}]`, first.Id, second.Id, third.Id, fourth.Id)

	err := UpdateOptionsBulk(map[string]string{operation_setting.ChannelRoutingPoolSettingConfigName + ".pools": value})

	require.Error(t, err)
	var option Option
	assert.ErrorIs(t, db.Where(&Option{Key: operation_setting.ChannelRoutingPoolSettingConfigName + ".pools"}).First(&option).Error, gorm.ErrRecordNotFound)
}
