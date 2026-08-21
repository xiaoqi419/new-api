package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupCreateInviterRebateTest(t *testing.T, rebateRatio float64) (*User, *User) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&RebateRecord{}))
	truncateTables(t)
	t.Cleanup(func() {
		_ = DB.Where("1 = 1").Delete(&RebateRecord{}).Error
	})

	previousRebateEnabled := common.RebateEnabled
	previousRebateRatio := common.RebateRatio
	common.RebateEnabled = true
	common.RebateRatio = rebateRatio
	t.Cleanup(func() {
		common.RebateEnabled = previousRebateEnabled
		common.RebateRatio = previousRebateRatio
	})

	inviter := &User{
		Username: "rebate-safety-inviter",
		Password: "password",
		Status:   common.UserStatusEnabled,
		AffCode:  "rebate-safety-inviter",
	}
	require.NoError(t, DB.Create(inviter).Error)

	invitee := &User{
		Username:  "rebate-safety-invitee",
		Password:  "password",
		Status:    common.UserStatusEnabled,
		InviterId: inviter.Id,
		AffCode:   "rebate-safety-invitee",
	}
	require.NoError(t, DB.Create(invitee).Error)
	return inviter, invitee
}

func TestCreateInviterRebateCreatesPendingRecordWithTruncatedQuota(t *testing.T) {
	inviter, invitee := setupCreateInviterRebateTest(t, 0.125)
	tradeNo := "rebate-safety-truncate"

	CreateInviterRebate(invitee.Id, 1001, tradeNo, 101)

	var record RebateRecord
	require.NoError(t, DB.Where("trade_no = ?", tradeNo).First(&record).Error)
	assert.Equal(t, inviter.Id, record.InviterId)
	assert.Equal(t, invitee.Id, record.InviteeId)
	assert.Equal(t, 1001, record.TopUpId)
	assert.Equal(t, 101, record.TopUpQuota)
	assert.InDelta(t, 0.125, record.RebateRatio, 0)
	assert.Equal(t, 12, record.RebateQuota, "101 * 0.125 = 12.625, preserving historical truncation toward zero")
	assert.Equal(t, RebateStatusPending, record.Status)
}

func TestCreateInviterRebateRejectsQuotaSaturation(t *testing.T) {
	_, invitee := setupCreateInviterRebateTest(t, 1)
	tradeNo := "rebate-safety-overflow"

	CreateInviterRebate(invitee.Id, 1002, tradeNo, common.MaxQuota+1)

	var count int64
	require.NoError(t, DB.Model(&RebateRecord{}).Where("trade_no = ?", tradeNo).Count(&count).Error)
	assert.Zero(t, count, "a saturated rebate quota must not create a record")
}

func TestCreateInviterRebateDuplicateTradeNoIsIdempotent(t *testing.T) {
	_, invitee := setupCreateInviterRebateTest(t, 0.25)
	tradeNo := "rebate-safety-duplicate"

	CreateInviterRebate(invitee.Id, 1003, tradeNo, 100)
	CreateInviterRebate(invitee.Id, 1004, tradeNo, 200)

	var records []RebateRecord
	require.NoError(t, DB.Where("trade_no = ?", tradeNo).Find(&records).Error)
	require.Len(t, records, 1)
	assert.Equal(t, 1003, records[0].TopUpId)
	assert.Equal(t, 100, records[0].TopUpQuota)
	assert.Equal(t, 25, records[0].RebateQuota)
	assert.Equal(t, RebateStatusPending, records[0].Status)
}
