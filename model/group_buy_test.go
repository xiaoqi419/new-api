package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupGroupBuyTest(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&GroupBuyPackage{}, &GroupBuy{}, &GroupBuyParticipant{}))
	clean := func() {
		DB.Exec("DELETE FROM group_buy_participants")
		DB.Exec("DELETE FROM group_buys")
		DB.Exec("DELETE FROM group_buy_packages")
		DB.Exec("DELETE FROM top_ups")
		DB.Exec("DELETE FROM users")
	}
	clean()
	t.Cleanup(clean)
	common.QuotaPerUnit = 500000
}

func seedGroupBuyMember(t *testing.T, groupBuyId, userId int, tradeNo string) {
	now := common.GetTimestamp()
	require.NoError(t, DB.Create(&GroupBuyParticipant{
		GroupBuyId:        groupBuyId,
		UserId:            userId,
		TradeNo:           tradeNo,
		PayStatus:         GroupBuyParticipantPending,
		PayMoney:          5,
		ReserveExpireTime: now + 900,
		JoinTime:          now,
	}).Error)
	require.NoError(t, DB.Create(&TopUp{
		UserId:          userId,
		Amount:          10,
		Money:           5,
		TradeNo:         tradeNo,
		PaymentMethod:   PaymentMethodWechatPay,
		PaymentProvider: PaymentProviderWechatPay,
		GroupBuyId:      groupBuyId,
		CreateTime:      now,
		Status:          common.TopUpStatusPending,
	}).Error)
}

// TestGroupBuySettlement 校验拼团结算的关键不变量：
// 未满员不入账、满员一次性均分入账、重复回调幂等不重复入账。
func TestGroupBuySettlement(t *testing.T) {
	setupGroupBuyTest(t)

	u1 := &User{Username: "gbu1", Quota: 100, AffCode: "gbaff1"}
	u2 := &User{Username: "gbu2", Quota: 200, AffCode: "gbaff2"}
	require.NoError(t, DB.Create(u1).Error)
	require.NoError(t, DB.Create(u2).Error)

	now := common.GetTimestamp()
	gb := &GroupBuy{
		GroupNo:        "GBT1",
		Status:         GroupBuyStatusPending,
		RequiredCount:  2,
		PerShareAmount: 10,
		PerSharePrice:  5,
		ExpireTime:     now + 3600,
		CreateTime:     now,
	}
	require.NoError(t, DB.Create(gb).Error)
	seedGroupBuyMember(t, gb.Id, u1.Id, "GBT1A")
	seedGroupBuyMember(t, gb.Id, u2.Id, "GBT1B")

	// 第一个成员支付：不应入账，拼团仍进行中
	handled, err := TrySettleGroupBuyOrder("GBT1A", PaymentProviderWechatPay, "ip")
	require.True(t, handled)
	require.NoError(t, err)

	var user1, user2 User
	require.NoError(t, DB.First(&user1, u1.Id).Error)
	require.NoError(t, DB.First(&user2, u2.Id).Error)
	assert.Equal(t, 100, user1.Quota)
	assert.Equal(t, 200, user2.Quota)

	var g GroupBuy
	require.NoError(t, DB.First(&g, gb.Id).Error)
	assert.Equal(t, GroupBuyStatusPending, g.Status)
	assert.Equal(t, 1, g.PaidCount)

	// 第二个成员支付：满员成团，全员均分入账
	handled, err = TrySettleGroupBuyOrder("GBT1B", PaymentProviderWechatPay, "ip")
	require.True(t, handled)
	require.NoError(t, err)

	require.NoError(t, DB.First(&user1, u1.Id).Error)
	require.NoError(t, DB.First(&user2, u2.Id).Error)
	require.NoError(t, DB.First(&g, gb.Id).Error)
	expectedAdd := 10 * 500000
	assert.Equal(t, GroupBuyStatusSuccess, g.Status)
	assert.Equal(t, 2, g.PaidCount)
	assert.Equal(t, 100+expectedAdd, user1.Quota)
	assert.Equal(t, 200+expectedAdd, user2.Quota)

	// 幂等：重复结算不重复入账
	_, err = TrySettleGroupBuyOrder("GBT1A", PaymentProviderWechatPay, "ip")
	require.NoError(t, err)
	require.NoError(t, DB.First(&user1, u1.Id).Error)
	assert.Equal(t, 100+expectedAdd, user1.Quota)
}

// TestGroupBuyProviderMismatch 校验支付网关不匹配时拒绝结算。
func TestGroupBuyProviderMismatch(t *testing.T) {
	setupGroupBuyTest(t)
	u1 := &User{Username: "gbu1", Quota: 0}
	require.NoError(t, DB.Create(u1).Error)
	now := common.GetTimestamp()
	gb := &GroupBuy{GroupNo: "GBT2", Status: GroupBuyStatusPending, RequiredCount: 2, PerShareAmount: 10, PerSharePrice: 5, ExpireTime: now + 3600, CreateTime: now}
	require.NoError(t, DB.Create(gb).Error)
	seedGroupBuyMember(t, gb.Id, u1.Id, "GBT2A")

	handled, err := TrySettleGroupBuyOrder("GBT2A", PaymentProviderAlipay, "ip")
	assert.True(t, handled)
	assert.ErrorIs(t, err, ErrPaymentMethodMismatch)
}

// TestGroupBuyOversell 校验名额已满时拒绝继续参团。
func TestGroupBuyOversell(t *testing.T) {
	setupGroupBuyTest(t)
	pkg := &GroupBuyPackage{Name: "p", RequiredCount: 2, TotalAmount: 20, TotalPrice: 10, DurationUnit: SubscriptionDurationHour, DurationValue: 1, Enabled: true}
	require.NoError(t, pkg.Insert())

	gb, err := CreateGroupBuyOrder(1, "a", pkg, "TNA", PaymentProviderWechatPay, PaymentMethodWechatPay)
	require.NoError(t, err)
	// 总额度/总价按成团人数均分写入快照
	assert.Equal(t, int64(10), gb.PerShareAmount)
	assert.InDelta(t, 5.0, gb.PerSharePrice, 0.001)
	assert.Equal(t, int64(20), gb.TotalAmount)

	_, err = JoinGroupBuyOrder(2, "b", gb.GroupNo, "TNB", PaymentProviderWechatPay, PaymentMethodWechatPay)
	require.NoError(t, err)

	// 第三人参团应被拒绝（名额已满，含未支付预占）
	_, err = JoinGroupBuyOrder(3, "c", gb.GroupNo, "TNC", PaymentProviderWechatPay, PaymentMethodWechatPay)
	require.Error(t, err)

	// 同一用户重复参团应被拒绝
	_, err = JoinGroupBuyOrder(2, "b", gb.GroupNo, "TNB2", PaymentProviderWechatPay, PaymentMethodWechatPay)
	require.Error(t, err)
}

// seedPaidTieredGroupBuy 直接落库一个阶梯拼团及 paidCount 个已支付成员（含用户）。
func seedPaidTieredGroupBuy(t *testing.T, groupNo string, tiers []GroupBuyTier, paidCount int, expireOffset int64) (*GroupBuy, []int) {
	now := common.GetTimestamp()
	gb := &GroupBuy{
		GroupNo:        groupNo,
		Status:         GroupBuyStatusPending,
		RequiredCount:  tiers[0].Count,
		TargetCount:    tiers[len(tiers)-1].Count,
		PerShareAmount: tiers[0].PerShareAmount,
		PerSharePrice:  5,
		TiersJson:      marshalGroupBuyTiers(tiers),
		Tiers:          tiers,
		ExpireTime:     now + expireOffset,
		CreateTime:     now - 100,
	}
	require.NoError(t, DB.Create(gb).Error)
	userIds := make([]int, 0, paidCount)
	for i := 0; i < paidCount; i++ {
		u := &User{Username: fmt.Sprintf("%s_u%d", groupNo, i), Quota: 0, AffCode: fmt.Sprintf("%s_aff%d", groupNo, i)}
		require.NoError(t, DB.Create(u).Error)
		userIds = append(userIds, u.Id)
		require.NoError(t, DB.Create(&GroupBuyParticipant{
			GroupBuyId: gb.Id,
			UserId:     u.Id,
			Username:   u.Username,
			TradeNo:    fmt.Sprintf("%s_T%d", groupNo, i),
			PayStatus:  GroupBuyParticipantPaid,
			PayMoney:   5,
			PayTime:    now,
			JoinTime:   now,
		}).Error)
	}
	return gb, userIds
}

// TestGroupBuyTieredExpirySettleHighestTier 校验到期时按"已解锁的最高档"结算：
// 档位 [{2,10},{4,30}]、3 人已支付，应按 2 人档（每人 10）结算，而非最高档 30。
func TestGroupBuyTieredExpirySettleHighestTier(t *testing.T) {
	setupGroupBuyTest(t)
	tiers := []GroupBuyTier{{Count: 2, PerShareAmount: 10}, {Count: 4, PerShareAmount: 30}}
	gb, userIds := seedPaidTieredGroupBuy(t, "GBTIER1", tiers, 3, -10)

	settled, err := SettleExpiredGroupBuyIfEligible(gb.Id)
	require.NoError(t, err)
	assert.True(t, settled)

	var g GroupBuy
	require.NoError(t, DB.First(&g, gb.Id).Error)
	assert.Equal(t, GroupBuyStatusSuccess, g.Status)
	assert.Equal(t, int64(10), g.PerShareAmount)

	expectedAdd := 10 * 500000
	for _, id := range userIds {
		var u User
		require.NoError(t, DB.First(&u, id).Error)
		assert.Equal(t, expectedAdd, u.Quota)
	}

	// 幂等：已结算的拼团再次到期处理不应重复入账
	settled, err = SettleExpiredGroupBuyIfEligible(gb.Id)
	require.NoError(t, err)
	assert.False(t, settled)
	var u0 User
	require.NoError(t, DB.First(&u0, userIds[0]).Error)
	assert.Equal(t, expectedAdd, u0.Quota)
}

// TestGroupBuyExpiryBelowMinTierFails 校验到期时未达最低成团档则不结算，交由失败退款流程处理。
func TestGroupBuyExpiryBelowMinTierFails(t *testing.T) {
	setupGroupBuyTest(t)
	tiers := []GroupBuyTier{{Count: 3, PerShareAmount: 10}, {Count: 5, PerShareAmount: 20}}
	gb, userIds := seedPaidTieredGroupBuy(t, "GBTIER2", tiers, 2, -10)

	settled, err := SettleExpiredGroupBuyIfEligible(gb.Id)
	require.NoError(t, err)
	assert.False(t, settled)

	var g GroupBuy
	require.NoError(t, DB.First(&g, gb.Id).Error)
	assert.Equal(t, GroupBuyStatusPending, g.Status)
	for _, id := range userIds {
		var u User
		require.NoError(t, DB.First(&u, id).Error)
		assert.Equal(t, 0, u.Quota)
	}

	paid, err := MarkGroupBuyFailed(gb.Id)
	require.NoError(t, err)
	assert.Len(t, paid, 2)
}

// TestGroupBuyEarlySettleAtMaxTier 校验支付回调路径：达到最大档时立即成团，按最高档入账。
func TestGroupBuyEarlySettleAtMaxTier(t *testing.T) {
	setupGroupBuyTest(t)
	tiers := []GroupBuyTier{{Count: 2, PerShareAmount: 10}, {Count: 3, PerShareAmount: 30}}
	now := common.GetTimestamp()
	gb := &GroupBuy{
		GroupNo:        "GBTIER3",
		Status:         GroupBuyStatusPending,
		RequiredCount:  2,
		TargetCount:    3,
		PerShareAmount: 10,
		PerSharePrice:  5,
		TiersJson:      marshalGroupBuyTiers(tiers),
		Tiers:          tiers,
		ExpireTime:     now + 3600,
		CreateTime:     now,
	}
	require.NoError(t, DB.Create(gb).Error)

	userIds := make([]int, 0, 3)
	for i := 0; i < 3; i++ {
		u := &User{Username: fmt.Sprintf("gbtier3_u%d", i), Quota: 0, AffCode: fmt.Sprintf("gbtier3_aff%d", i)}
		require.NoError(t, DB.Create(u).Error)
		userIds = append(userIds, u.Id)
		seedGroupBuyMember(t, gb.Id, u.Id, fmt.Sprintf("GBTIER3_T%d", i))
	}

	// 前两人支付：未达最大档（3），不结算
	_, err := TrySettleGroupBuyOrder("GBTIER3_T0", PaymentProviderWechatPay, "ip")
	require.NoError(t, err)
	_, err = TrySettleGroupBuyOrder("GBTIER3_T1", PaymentProviderWechatPay, "ip")
	require.NoError(t, err)
	var g GroupBuy
	require.NoError(t, DB.First(&g, gb.Id).Error)
	assert.Equal(t, GroupBuyStatusPending, g.Status)

	// 第三人支付：满最大档，立即成团并按最高档（30）入账
	_, err = TrySettleGroupBuyOrder("GBTIER3_T2", PaymentProviderWechatPay, "ip")
	require.NoError(t, err)
	require.NoError(t, DB.First(&g, gb.Id).Error)
	assert.Equal(t, GroupBuyStatusSuccess, g.Status)
	assert.Equal(t, int64(30), g.PerShareAmount)
	expectedAdd := 30 * 500000
	for _, id := range userIds {
		var u User
		require.NoError(t, DB.First(&u, id).Error)
		assert.Equal(t, expectedAdd, u.Quota)
	}
}

// TestGroupBuyMarkFailed 校验失败拼团返回待退款的已支付成员。
func TestGroupBuyMarkFailed(t *testing.T) {
	setupGroupBuyTest(t)
	u1 := &User{Username: "gbu1", Quota: 0}
	require.NoError(t, DB.Create(u1).Error)
	now := common.GetTimestamp()
	gb := &GroupBuy{GroupNo: "GBT3", Status: GroupBuyStatusPending, RequiredCount: 3, PerShareAmount: 10, PerSharePrice: 5, ExpireTime: now - 10, CreateTime: now - 100}
	require.NoError(t, DB.Create(gb).Error)
	seedGroupBuyMember(t, gb.Id, u1.Id, "GBT3A")

	// 标记该成员已支付
	_, err := TrySettleGroupBuyOrder("GBT3A", PaymentProviderWechatPay, "ip")
	require.NoError(t, err)

	paid, err := MarkGroupBuyFailed(gb.Id)
	require.NoError(t, err)
	require.Len(t, paid, 1)
	assert.Equal(t, "GBT3A", paid[0].TradeNo)

	var g GroupBuy
	require.NoError(t, DB.First(&g, gb.Id).Error)
	assert.Equal(t, GroupBuyStatusFailed, g.Status)

	// 幂等：再次标记失败不再返回成员
	paid2, err := MarkGroupBuyFailed(gb.Id)
	require.NoError(t, err)
	assert.Len(t, paid2, 0)
}
