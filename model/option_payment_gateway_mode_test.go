package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func usePaymentGatewayModeOptionDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	DB = db
	common.OptionMapRWMutex.Lock()
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{
		operation_setting.PaymentGatewayModeOptionKey: operation_setting.PaymentGatewayModeEpayLegacy,
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		DB = previousDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousMap
		common.OptionMapRWMutex.Unlock()
	})
	return db
}

func TestUpdatePaymentGatewayModePersistsConfiguredValueWithoutHotSwitch(t *testing.T) {
	db := usePaymentGatewayModeOptionDB(t)
	restore := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeEpayLegacy)
	t.Cleanup(restore)

	require.NoError(t, UpdateOption(operation_setting.PaymentGatewayModeOptionKey, operation_setting.PaymentGatewayModeGMPayNative))

	var option Option
	require.NoError(t, db.Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).First(&option).Error)
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, option.Value)
	common.OptionMapRWMutex.RLock()
	configured := common.OptionMap[operation_setting.PaymentGatewayModeOptionKey]
	common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, configured)
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, operation_setting.GetEffectivePaymentGatewayMode())
}

func TestUpdatePaymentGatewayModeRejectsInvalidValueBeforePersistence(t *testing.T) {
	db := usePaymentGatewayModeOptionDB(t)

	require.Error(t, UpdateOption(operation_setting.PaymentGatewayModeOptionKey, "domain_auto"))

	var option Option
	assert.ErrorIs(t, db.Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).First(&option).Error, gorm.ErrRecordNotFound)
	common.OptionMapRWMutex.RLock()
	configured := common.OptionMap[operation_setting.PaymentGatewayModeOptionKey]
	common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, configured)
}

func TestUpdatePaymentGatewayModeNormalizesWhitespaceBeforePersistence(t *testing.T) {
	db := usePaymentGatewayModeOptionDB(t)

	require.NoError(t, UpdateOption(operation_setting.PaymentGatewayModeOptionKey, "  "+operation_setting.PaymentGatewayModeGMPayNative+"  "))

	var option Option
	require.NoError(t, db.Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).First(&option).Error)
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, option.Value)
	common.OptionMapRWMutex.RLock()
	configured := common.OptionMap[operation_setting.PaymentGatewayModeOptionKey]
	common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, configured)
}

func TestUpdatePaymentGatewayModeBulkNormalizesWhitespaceBeforePersistence(t *testing.T) {
	db := usePaymentGatewayModeOptionDB(t)

	require.NoError(t, UpdateOptionsBulk(map[string]string{
		operation_setting.PaymentGatewayModeOptionKey: "\t" + operation_setting.PaymentGatewayModeGMPayNative + "\n",
	}))

	var option Option
	require.NoError(t, db.Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).First(&option).Error)
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, option.Value)
	common.OptionMapRWMutex.RLock()
	configured := common.OptionMap[operation_setting.PaymentGatewayModeOptionKey]
	common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, configured)
}

func TestInitOptionMapFailsClosedOnInvalidPersistedPaymentGatewayMode(t *testing.T) {
	db := usePaymentGatewayModeOptionDB(t)
	require.NoError(t, db.Create(&Option{
		Key:   operation_setting.PaymentGatewayModeOptionKey,
		Value: "unsupported_mode",
	}).Error)

	err := InitOptionMap()
	require.Error(t, err)
	assert.Contains(t, err.Error(), operation_setting.PaymentGatewayModeOptionKey)
	assert.NotContains(t, err.Error(), "pay.example")
}

func TestUpdateOptionRejectsEffectivePaymentGatewayModeAsReadOnly(t *testing.T) {
	db := usePaymentGatewayModeOptionDB(t)

	require.Error(t, UpdateOption(operation_setting.EffectivePaymentGatewayModeOptionKey, operation_setting.PaymentGatewayModeGMPayNative))

	var option Option
	assert.ErrorIs(t, db.Where("key = ?", operation_setting.EffectivePaymentGatewayModeOptionKey).First(&option).Error, gorm.ErrRecordNotFound)
}
