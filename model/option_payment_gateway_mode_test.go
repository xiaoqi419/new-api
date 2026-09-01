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

func TestUpdateOptionLeavesOptionMapUntouchedWhenDatabaseIsClosed(t *testing.T) {
	_ = usePaymentGatewayModeOptionDB(t)
	key := operation_setting.PaymentGatewayModeOptionKey

	sqlDB, err := DB.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())

	err = UpdateOption(key, operation_setting.PaymentGatewayModeGMPayNative)
	require.Error(t, err)
	common.OptionMapRWMutex.RLock()
	configured := common.OptionMap[key]
	common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, configured)
}

func TestUpdateOptionRollsBackNewAndExistingRowsWhenSaveFails(t *testing.T) {
	tests := []struct {
		name           string
		seed           bool
		wantRowPresent bool
		wantValue      string
	}{
		{
			name:           "existing row",
			seed:           true,
			wantRowPresent: true,
			wantValue:      operation_setting.PaymentGatewayModeEpayLegacy,
		},
		{
			name:           "new row",
			seed:           false,
			wantRowPresent: false,
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			db := usePaymentGatewayModeOptionDB(t)
			key := operation_setting.PaymentGatewayModeOptionKey
			if testCase.seed {
				require.NoError(t, db.Create(&Option{Key: key, Value: testCase.wantValue}).Error)
			}
			require.NoError(t, db.Exec("CREATE TRIGGER reject_payment_gateway_mode_update BEFORE UPDATE ON options BEGIN SELECT RAISE(ABORT, 'forced save failure'); END").Error)

			err := UpdateOption(key, operation_setting.PaymentGatewayModeGMPayNative)
			require.Error(t, err)

			var option Option
			dbErr := db.Where("key = ?", key).First(&option).Error
			if testCase.wantRowPresent {
				require.NoError(t, dbErr)
				assert.Equal(t, testCase.wantValue, option.Value)
			} else {
				assert.ErrorIs(t, dbErr, gorm.ErrRecordNotFound)
			}
			common.OptionMapRWMutex.RLock()
			configured := common.OptionMap[key]
			common.OptionMapRWMutex.RUnlock()
			assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, configured)
		})
	}
}

func TestUpdatePaymentGatewayModeOptionIfRejectsStaleExpectedValue(t *testing.T) {
	db := usePaymentGatewayModeOptionDB(t)
	key := operation_setting.PaymentGatewayModeOptionKey

	require.NoError(t, UpdateOption(key, operation_setting.PaymentGatewayModeGMPayNative))
	updated, err := UpdatePaymentGatewayModeOptionIf(
		operation_setting.PaymentGatewayModeEpayLegacy,
		operation_setting.PaymentGatewayModeGMPayNative,
	)

	require.NoError(t, err)
	assert.False(t, updated)
	var option Option
	require.NoError(t, db.Where("key = ?", key).First(&option).Error)
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, option.Value)
}

func TestPaymentGatewayModeOptionWritesRejectActiveApplyReservation(t *testing.T) {
	db := usePaymentGatewayModeOptionDB(t)
	key := operation_setting.PaymentGatewayModeOptionKey

	reserved, err := ReservePaymentGatewayModeApply(
		operation_setting.PaymentGatewayModeEpayLegacy,
		operation_setting.PaymentGatewayModeGMPayNative,
		"apply-reservation-test",
	)
	require.NoError(t, err)
	assert.True(t, reserved)

	err = UpdateOption(key, operation_setting.PaymentGatewayModeEpayLegacy)
	require.ErrorIs(t, err, ErrPaymentGatewayModeApplyReservationActive)
	err = UpdateOptionsBulk(map[string]string{
		key: operation_setting.PaymentGatewayModeEpayLegacy,
	})
	require.ErrorIs(t, err, ErrPaymentGatewayModeApplyReservationActive)

	var option Option
	require.NoError(t, db.Where("key = ?", key).First(&option).Error)
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, option.Value)
	require.NoError(t, ReleasePaymentGatewayModeApplyReservation("apply-reservation-test"))
	require.NoError(t, UpdateOption(key, operation_setting.PaymentGatewayModeGMPayNative))
}
