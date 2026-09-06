package model

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	// GroupBuyStatusDraft 发起人尚未付款的拼团：不进大厅、不可参团、详情仅发起人可见，
	// 发起人付款成功后才转为 pending 正式上架。
	GroupBuyStatusDraft   = "draft"
	GroupBuyStatusPending = "pending"
	GroupBuyStatusSuccess = "success"
	GroupBuyStatusFailed  = "failed"

	GroupBuyParticipantPending       = "pending"
	GroupBuyParticipantPaid          = "paid"
	GroupBuyParticipantRefunded      = "refunded"
	GroupBuyParticipantRefundPending = "refund_pending"
)

// groupBuyReserveTTLSeconds 参团下单后未支付的名额预占时长，超时释放名额。
const groupBuyReserveTTLSeconds int64 = 15 * 60

// GroupBuyTier 阶梯档位：有效人数达到 Count 时，每位已支付成员到账 PerShareAmount
// （展示单位与普通充值一致）。人数越多档位越高、每人到账越多。
type GroupBuyTier struct {
	Count          int   `json:"count"`
	PerShareAmount int64 `json:"per_share_amount"`
}

func marshalGroupBuyTiers(tiers []GroupBuyTier) string {
	if len(tiers) == 0 {
		return ""
	}
	b, err := common.Marshal(tiers)
	if err != nil {
		return ""
	}
	return string(b)
}

func unmarshalGroupBuyTiers(s string) []GroupBuyTier {
	if s == "" {
		return nil
	}
	var tiers []GroupBuyTier
	if err := common.Unmarshal([]byte(s), &tiers); err != nil {
		return nil
	}
	return tiers
}

// highestUnlockedGroupBuyTier 返回已解锁的最高档（paidCount >= tier.Count 的最大档）。
// 依赖档位按人数升序排列（ValidateForSave 强制校验）。
func highestUnlockedGroupBuyTier(tiers []GroupBuyTier, paidCount int) (GroupBuyTier, bool) {
	var best GroupBuyTier
	found := false
	for _, tier := range tiers {
		if paidCount >= tier.Count {
			best = tier
			found = true
		}
	}
	return best, found
}

// GroupBuyPackage 管理员预设的拼团套餐模板。
type GroupBuyPackage struct {
	Id            int     `json:"id"`
	Name          string  `json:"name" gorm:"type:varchar(191)"`
	Description   string  `json:"description" gorm:"type:varchar(500)"`
	RequiredCount int     `json:"required_count"`                       // 旧版：固定成团人数（阶梯团忽略，仅作兼容兜底）
	TotalAmount   int64   `json:"total_amount"`                         // 旧版：总到账额度（成员均分）
	TotalPrice    float64 `json:"total_price"`                          // 旧版：总价（CNY，成员均分）
	PerSharePrice float64 `json:"per_share_price"`                      // 每人固定价（CNY）；>0 时启用阶梯团
	TiersJson     string  `json:"-" gorm:"column:tiers_json;type:text"` // 阶梯档位快照（JSON）
	// Tiers 为传输/内存字段，落库走 TiersJson。
	Tiers         []GroupBuyTier `json:"tiers" gorm:"-"`
	DurationUnit  string         `json:"duration_unit" gorm:"type:varchar(16)"` // 成团时限单位：year/month/day/hour
	DurationValue int            `json:"duration_value"`                        // 成团时限数值
	Enabled       bool           `json:"enabled"`
	// RewardSubscriptionPlanId >0 时，成团奖励发放绑定分组的订阅额度（额度=解锁档到账额度）而非钱包额度。
	RewardSubscriptionPlanId int   `json:"reward_subscription_plan_id" gorm:"type:int;default:0"`
	CreateTime               int64 `json:"create_time"`
}

// AfterFind 从 TiersJson 反序列化出阶梯档位。
func (pkg *GroupBuyPackage) AfterFind(_ *gorm.DB) error {
	pkg.Tiers = unmarshalGroupBuyTiers(pkg.TiersJson)
	return nil
}

// resolvedTiers 返回有效档位：优先阶梯档位，否则按旧版单档兜底。
func (pkg *GroupBuyPackage) resolvedTiers() []GroupBuyTier {
	if len(pkg.Tiers) > 0 {
		return pkg.Tiers
	}
	if pkg.RequiredCount >= 2 && pkg.TotalAmount > 0 {
		return []GroupBuyTier{{Count: pkg.RequiredCount, PerShareAmount: pkg.TotalAmount / int64(pkg.RequiredCount)}}
	}
	return nil
}

// resolvedPerSharePrice 返回每人价格：优先固定价，否则按旧版总价均分。
func (pkg *GroupBuyPackage) resolvedPerSharePrice() float64 {
	if pkg.PerSharePrice > 0 {
		return pkg.PerSharePrice
	}
	if pkg.RequiredCount > 0 {
		return decimal.NewFromFloat(pkg.TotalPrice).Div(decimal.NewFromInt(int64(pkg.RequiredCount))).Round(2).InexactFloat64()
	}
	return 0
}

// GroupBuy 拼团实例。套餐字段做快照，避免后续改套餐影响进行中的拼团。
type GroupBuy struct {
	Id             int     `json:"id"`
	GroupNo        string  `json:"group_no" gorm:"unique;type:varchar(64);index"`
	PackageId      int     `json:"package_id" gorm:"index"`
	PackageName    string  `json:"package_name" gorm:"type:varchar(191)"`
	InitiatorId    int     `json:"initiator_id" gorm:"index"`
	Status         string  `json:"status" gorm:"type:varchar(20);index"`
	RequiredCount  int     `json:"required_count"` // 最低成团人数（最小档）
	TargetCount    int     `json:"target_count"`   // 招募目标人数（最大档）
	PaidCount      int     `json:"paid_count"`
	TotalAmount    int64   `json:"total_amount"`
	TotalPrice     float64 `json:"total_price"`
	PerShareAmount int64   `json:"per_share_amount"` // 已结算的每人到账额度；未结算时为最低档保底
	PerSharePrice  float64 `json:"per_share_price"`
	TiersJson      string  `json:"-" gorm:"column:tiers_json;type:text"`
	// Tiers 为传输/内存字段，落库走 TiersJson。
	Tiers []GroupBuyTier `json:"tiers" gorm:"-"`
	// RewardSubscriptionPlanId 为套餐快照：>0 时成团发放绑定分组的订阅额度而非钱包额度。
	RewardSubscriptionPlanId int   `json:"reward_subscription_plan_id" gorm:"type:int;default:0"`
	ExpireTime               int64 `json:"expire_time"`
	CreateTime               int64 `json:"create_time"`
	CompleteTime             int64 `json:"complete_time"`
}

// AfterFind 从 TiersJson 反序列化出档位快照。
func (gb *GroupBuy) AfterFind(_ *gorm.DB) error {
	gb.Tiers = unmarshalGroupBuyTiers(gb.TiersJson)
	return nil
}

// resolvedTiers 返回档位快照：优先阶梯快照，否则按旧版单档兜底。
func (gb *GroupBuy) resolvedTiers() []GroupBuyTier {
	if len(gb.Tiers) > 0 {
		return gb.Tiers
	}
	if gb.RequiredCount >= 1 && gb.PerShareAmount > 0 {
		return []GroupBuyTier{{Count: gb.RequiredCount, PerShareAmount: gb.PerShareAmount}}
	}
	return nil
}

// capacity 返回可参团上限（最大档人数），兼容迁移前无 TargetCount 的旧数据。
func (gb *GroupBuy) capacity() int {
	if gb.TargetCount > 0 {
		return gb.TargetCount
	}
	return gb.RequiredCount
}

// GroupBuyParticipant 参团记录。
type GroupBuyParticipant struct {
	Id                int     `json:"id"`
	GroupBuyId        int     `json:"group_buy_id" gorm:"index"`
	UserId            int     `json:"user_id" gorm:"index"`
	Username          string  `json:"username" gorm:"type:varchar(191)"`
	TradeNo           string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PayStatus         string  `json:"pay_status" gorm:"type:varchar(20);index"`
	PayMoney          float64 `json:"pay_money"`
	ReserveExpireTime int64   `json:"reserve_expire_time"`
	JoinTime          int64   `json:"join_time"`
	PayTime           int64   `json:"pay_time"`
}

// ===== 套餐 CRUD（管理员） =====

func GetGroupBuyPackages(onlyEnabled bool) ([]*GroupBuyPackage, error) {
	var packages []*GroupBuyPackage
	query := DB.Model(&GroupBuyPackage{})
	if onlyEnabled {
		query = query.Where("enabled = ?", true)
	}
	err := query.Order("id desc").Find(&packages).Error
	return packages, err
}

func GetGroupBuyPackageById(id int) (*GroupBuyPackage, error) {
	pkg := &GroupBuyPackage{}
	if err := DB.Where("id = ?", id).First(pkg).Error; err != nil {
		return nil, errors.New("拼团套餐不存在")
	}
	return pkg, nil
}

func (pkg *GroupBuyPackage) Insert() error {
	pkg.CreateTime = common.GetTimestamp()
	pkg.TiersJson = marshalGroupBuyTiers(pkg.Tiers)
	return DB.Create(pkg).Error
}

func (pkg *GroupBuyPackage) Update() error {
	pkg.TiersJson = marshalGroupBuyTiers(pkg.Tiers)
	return DB.Model(&GroupBuyPackage{}).Where("id = ?", pkg.Id).Updates(map[string]interface{}{
		"name":                        pkg.Name,
		"description":                 pkg.Description,
		"required_count":              pkg.RequiredCount,
		"total_amount":                pkg.TotalAmount,
		"total_price":                 pkg.TotalPrice,
		"per_share_price":             pkg.PerSharePrice,
		"tiers_json":                  pkg.TiersJson,
		"duration_unit":               pkg.DurationUnit,
		"duration_value":              pkg.DurationValue,
		"enabled":                     pkg.Enabled,
		"reward_subscription_plan_id": pkg.RewardSubscriptionPlanId,
	}).Error
}

func DeleteGroupBuyPackage(id int) error {
	return DB.Where("id = ?", id).Delete(&GroupBuyPackage{}).Error
}

// maxGroupBuyPerShareAmount 返回单档每人到账额度上限，避免结算时超出 int32 额度列而被饱和截断。
func maxGroupBuyPerShareAmount() int64 {
	if common.QuotaPerUnit <= 0 {
		return math.MaxInt64
	}
	return int64(math.MaxInt32 / common.QuotaPerUnit)
}

// ValidateForSave 校验套餐字段。启用阶梯团（配置了 Tiers）时校验档位，否则回退旧版均分校验。
func (pkg *GroupBuyPackage) ValidateForSave() error {
	if pkg.Name == "" {
		return errors.New("套餐名称不能为空")
	}
	if pkg.DurationValue <= 0 {
		return errors.New("成团时限需大于 0")
	}
	switch pkg.DurationUnit {
	case SubscriptionDurationYear, SubscriptionDurationMonth, SubscriptionDurationDay, SubscriptionDurationHour:
	default:
		return errors.New("成团时限单位无效")
	}

	if pkg.RewardSubscriptionPlanId > 0 {
		if _, err := GetSubscriptionPlanById(pkg.RewardSubscriptionPlanId); err != nil {
			return errors.New("绑定的订阅套餐不存在")
		}
	}

	if len(pkg.Tiers) > 0 {
		if pkg.PerSharePrice <= 0 {
			return errors.New("每人价格需大于 0")
		}
		maxAmount := maxGroupBuyPerShareAmount()
		prevCount := 0
		var prevAmount int64
		for _, tier := range pkg.Tiers {
			if tier.Count < 2 {
				return errors.New("每档成团人数至少为 2")
			}
			if tier.Count <= prevCount {
				return errors.New("档位人数需从小到大严格递增")
			}
			if tier.PerShareAmount <= 0 {
				return errors.New("每档到账额度需大于 0")
			}
			if tier.PerShareAmount < prevAmount {
				return errors.New("人数越多每人到账不应更少")
			}
			if tier.PerShareAmount > maxAmount {
				return fmt.Errorf("每档到账额度过大（上限约 %d）", maxAmount)
			}
			prevCount = tier.Count
			prevAmount = tier.PerShareAmount
		}
		return nil
	}

	// 旧版均分校验（兼容存量套餐）。
	if pkg.RequiredCount < 2 {
		return errors.New("成团人数至少为 2")
	}
	if pkg.TotalAmount <= 0 {
		return errors.New("总额度需大于 0")
	}
	if pkg.TotalAmount%int64(pkg.RequiredCount) != 0 {
		return errors.New("总额度需能被成团人数整除，以便成员均分")
	}
	if pkg.TotalPrice <= 0 {
		return errors.New("总价需大于 0")
	}
	return nil
}

// groupBuyExpireTime 按"单位+数值"计算成团截止时间（与订阅套餐口径一致）。
func groupBuyExpireTime(now int64, unit string, value int) int64 {
	start := time.Unix(now, 0)
	switch unit {
	case SubscriptionDurationYear:
		return start.AddDate(value, 0, 0).Unix()
	case SubscriptionDurationMonth:
		return start.AddDate(0, value, 0).Unix()
	case SubscriptionDurationDay:
		return start.Add(time.Duration(value) * 24 * time.Hour).Unix()
	default:
		return start.Add(time.Duration(value) * time.Hour).Unix()
	}
}

// ===== 拼团实例创建 / 参团 =====

// countActiveParticipantsTx 统计某拼团有效占位人数（已支付 + 未过期的待支付预占）。
func countActiveParticipantsTx(tx *gorm.DB, groupBuyId int, now int64) (int64, error) {
	var count int64
	err := tx.Model(&GroupBuyParticipant{}).
		Where("group_buy_id = ? AND (pay_status = ? OR (pay_status = ? AND reserve_expire_time > ?))",
			groupBuyId, GroupBuyParticipantPaid, GroupBuyParticipantPending, now).
		Count(&count).Error
	return count, err
}

// CreateGroupBuyOrder 发起拼团：原子创建拼团实例 + 发起人参团记录 + 充值订单（待支付）。
func CreateGroupBuyOrder(initiatorId int, username string, pkg *GroupBuyPackage, tradeNo, provider, paymentMethod string) (*GroupBuy, error) {
	now := common.GetTimestamp()
	tiers := pkg.resolvedTiers()
	if len(tiers) == 0 {
		return nil, errors.New("拼团套餐配置无效")
	}
	perSharePrice := pkg.resolvedPerSharePrice()
	if perSharePrice <= 0 {
		return nil, errors.New("拼团套餐价格无效")
	}
	minCount := tiers[0].Count
	maxCount := tiers[len(tiers)-1].Count
	floorAmount := tiers[0].PerShareAmount
	bestAmount := tiers[len(tiers)-1].PerShareAmount

	// 阶梯团展示"满团价/最高可得"，旧版均分沿用套餐原始总价/总额度快照。
	totalAmountSnapshot := pkg.TotalAmount
	totalPriceSnapshot := pkg.TotalPrice
	if len(pkg.Tiers) > 0 || pkg.PerSharePrice > 0 {
		totalAmountSnapshot = bestAmount
		totalPriceSnapshot = decimal.NewFromFloat(perSharePrice).Mul(decimal.NewFromInt(int64(maxCount))).Round(2).InexactFloat64()
	}

	groupBuy := &GroupBuy{
		GroupNo:                  "GB" + common.GetRandomString(16),
		PackageId:                pkg.Id,
		PackageName:              pkg.Name,
		InitiatorId:              initiatorId,
		Status:                   GroupBuyStatusDraft,
		RequiredCount:            minCount,
		TargetCount:              maxCount,
		PaidCount:                0,
		TotalAmount:              totalAmountSnapshot,
		TotalPrice:               totalPriceSnapshot,
		PerShareAmount:           floorAmount,
		PerSharePrice:            perSharePrice,
		TiersJson:                marshalGroupBuyTiers(tiers),
		Tiers:                    tiers,
		RewardSubscriptionPlanId: pkg.RewardSubscriptionPlanId,
		ExpireTime:               groupBuyExpireTime(now, pkg.DurationUnit, pkg.DurationValue),
		CreateTime:               now,
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(groupBuy).Error; err != nil {
			return err
		}
		participant := &GroupBuyParticipant{
			GroupBuyId:        groupBuy.Id,
			UserId:            initiatorId,
			Username:          username,
			TradeNo:           tradeNo,
			PayStatus:         GroupBuyParticipantPending,
			PayMoney:          perSharePrice,
			ReserveExpireTime: now + groupBuyReserveTTLSeconds,
			JoinTime:          now,
		}
		if err := tx.Create(participant).Error; err != nil {
			return err
		}
		topUp := &TopUp{
			UserId:          initiatorId,
			Amount:          floorAmount,
			Money:           perSharePrice,
			TradeNo:         tradeNo,
			PaymentMethod:   paymentMethod,
			PaymentProvider: provider,
			GroupBuyId:      groupBuy.Id,
			CreateTime:      now,
			Status:          common.TopUpStatusPending,
		}
		return tx.Create(topUp).Error
	})
	if err != nil {
		return nil, err
	}
	return groupBuy, nil
}

// JoinGroupBuyOrder 参团：校验名额后原子创建参团记录 + 充值订单（待支付）。
func JoinGroupBuyOrder(userId int, username, groupNo, tradeNo, provider, paymentMethod string) (*GroupBuy, error) {
	now := common.GetTimestamp()
	groupBuy := &GroupBuy{}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("group_no = ?", groupNo).First(groupBuy).Error; err != nil {
			return errors.New("拼团不存在")
		}
		if groupBuy.Status == GroupBuyStatusDraft {
			return errors.New("拼团不存在") // 发起人未付款，对外等同于不存在
		}
		if groupBuy.Status != GroupBuyStatusPending {
			return errors.New("该拼团已结束")
		}
		if now > groupBuy.ExpireTime {
			return errors.New("该拼团已过期")
		}
		// 同一用户不可重复占位（已支付或未过期的待支付）
		var existing int64
		if err := tx.Model(&GroupBuyParticipant{}).
			Where("group_buy_id = ? AND user_id = ? AND (pay_status = ? OR (pay_status = ? AND reserve_expire_time > ?))",
				groupBuy.Id, userId, GroupBuyParticipantPaid, GroupBuyParticipantPending, now).
			Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return errors.New("你已在该拼团中")
		}
		active, err := countActiveParticipantsTx(tx, groupBuy.Id, now)
		if err != nil {
			return err
		}
		if active >= int64(groupBuy.capacity()) {
			return errors.New("拼团人数已满")
		}
		participant := &GroupBuyParticipant{
			GroupBuyId:        groupBuy.Id,
			UserId:            userId,
			Username:          username,
			TradeNo:           tradeNo,
			PayStatus:         GroupBuyParticipantPending,
			PayMoney:          groupBuy.PerSharePrice,
			ReserveExpireTime: now + groupBuyReserveTTLSeconds,
			JoinTime:          now,
		}
		if err := tx.Create(participant).Error; err != nil {
			return err
		}
		topUp := &TopUp{
			UserId:          userId,
			Amount:          groupBuy.PerShareAmount,
			Money:           groupBuy.PerSharePrice,
			TradeNo:         tradeNo,
			PaymentMethod:   paymentMethod,
			PaymentProvider: provider,
			GroupBuyId:      groupBuy.Id,
			CreateTime:      now,
			Status:          common.TopUpStatusPending,
		}
		return tx.Create(topUp).Error
	})
	if err != nil {
		return nil, err
	}
	return groupBuy, nil
}

// ===== 结算（支付成功回调路由到此处） =====

// GroupBuySubscriptionSource 标记来源于拼团发放的订阅额度。
const GroupBuySubscriptionSource = "groupbuy"

// completedMember 成团后需要在事务外补充日志/返现的成员。
type completedMember struct {
	UserId             int
	TradeNo            string
	TopUpId            int
	Quota              int
	SubscriptionPlanId int    // >0 表示奖励为订阅额度（不计入钱包缓存）
	PlanTitle          string // 订阅套餐名称（日志用）
}

// TrySettleGroupBuyOrder 若该订单属于拼团订单，则在此完成"标记参团已支付 + 满员则均分入账"，
// 并返回 handled=true 表示调用方无需再走普通加额度逻辑。非拼团订单返回 handled=false。
func TrySettleGroupBuyOrder(tradeNo, expectedProvider, callerIp string) (handled bool, err error) {
	topUp := GetTopUpByTradeNo(tradeNo)
	if topUp == nil || topUp.GroupBuyId == 0 {
		return false, nil
	}

	var completed []completedMember
	var groupCompleted bool
	var paidTopUp *TopUp

	err = DB.Transaction(func(tx *gorm.DB) error {
		locked := &TopUp{}
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(locked).Error; err != nil {
			return errors.New("充值订单不存在")
		}
		if expectedProvider != "" && locked.PaymentProvider != expectedProvider {
			return ErrPaymentMethodMismatch
		}
		if locked.Status == common.TopUpStatusSuccess {
			return nil // 幂等：已处理
		}
		if locked.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = common.GetTimestamp()
		if err := tx.Save(locked).Error; err != nil {
			return err
		}
		paidTopUp = locked

		participant := &GroupBuyParticipant{}
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(participant).Error; err != nil {
			return errors.New("参团记录不存在")
		}
		if participant.PayStatus != GroupBuyParticipantPaid {
			participant.PayStatus = GroupBuyParticipantPaid
			participant.PayTime = common.GetTimestamp()
			if err := tx.Save(participant).Error; err != nil {
				return err
			}
		}

		groupBuy := &GroupBuy{}
		if err := lockForUpdate(tx).Where("id = ?", participant.GroupBuyId).First(groupBuy).Error; err != nil {
			return errors.New("拼团不存在")
		}
		if groupBuy.Status == GroupBuyStatusDraft {
			// 发起人付款到账，草稿团正式上架。
			groupBuy.Status = GroupBuyStatusPending
		}
		if groupBuy.Status != GroupBuyStatusPending {
			return nil // 拼团已结束（成功/失败），仅保留该成员已支付状态
		}

		var paidCount int64
		if err := tx.Model(&GroupBuyParticipant{}).
			Where("group_buy_id = ? AND pay_status = ?", groupBuy.Id, GroupBuyParticipantPaid).
			Count(&paidCount).Error; err != nil {
			return err
		}
		groupBuy.PaidCount = int(paidCount)

		// 阶梯团：人数越多每人到账越多，故默认等到期按最高解锁档结算；
		// 仅当开启"满档提前成团"且已到达最大档（无法再增员）时立即结算。
		tiers := groupBuy.resolvedTiers()
		maxCount := 0
		if n := len(tiers); n > 0 {
			maxCount = tiers[n-1].Count
		}
		if !operation_setting.GetGroupBuySetting().EarlySettleWhenFull || maxCount <= 0 || int(paidCount) < maxCount {
			return tx.Save(groupBuy).Error
		}

		members, gErr := grantGroupBuySuccessTx(tx, groupBuy, tiers[len(tiers)-1].PerShareAmount)
		if gErr != nil {
			return gErr
		}
		completed = members
		groupCompleted = true
		return nil
	})
	if err != nil {
		return true, err
	}

	if paidTopUp != nil && OnTopUpSuccess != nil {
		OnTopUpSuccess(paidTopUp, 0)
	}
	if groupCompleted {
		applyGroupBuyCompletion(completed, callerIp)
	}
	return true, nil
}

// grantGroupBuySuccessTx 在事务内将拼团置为成功，并按 tierAmount 给全部已支付成员发放额度。
// 返回需在事务外补充缓存/日志/返现的成员列表。
func grantGroupBuySuccessTx(tx *gorm.DB, groupBuy *GroupBuy, tierAmount int64) ([]completedMember, error) {
	if math.IsNaN(common.QuotaPerUnit) || math.IsInf(common.QuotaPerUnit, 0) || common.QuotaPerUnit <= 0 {
		return nil, errors.New("额度单位配置错误")
	}
	quotaPerShare, clamp := common.QuotaFromDecimalChecked(decimal.NewFromInt(tierAmount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if clamp != nil {
		return nil, clamp
	}
	if quotaPerShare <= 0 {
		return nil, errors.New("无效的拼团额度")
	}
	groupBuy.Status = GroupBuyStatusSuccess
	groupBuy.PerShareAmount = tierAmount
	groupBuy.CompleteTime = common.GetTimestamp()
	if err := tx.Save(groupBuy).Error; err != nil {
		return nil, err
	}

	// 订阅奖励：发放绑定分组的订阅额度（额度=解锁档到账额度）而非钱包额度。
	// 若绑定套餐已被删除/不可用，退回钱包发放以保证成员仍能拿到额度。
	var rewardPlan *SubscriptionPlan
	if groupBuy.RewardSubscriptionPlanId > 0 {
		if plan, err := getSubscriptionPlanByIdTx(tx, groupBuy.RewardSubscriptionPlanId); err == nil && plan != nil {
			rewardPlan = plan
		} else {
			common.SysLog(fmt.Sprintf("group-buy %s reward plan %d unavailable, falling back to wallet grant: %v",
				groupBuy.GroupNo, groupBuy.RewardSubscriptionPlanId, err))
		}
	}

	var members []GroupBuyParticipant
	if err := tx.Where("group_buy_id = ? AND pay_status = ?", groupBuy.Id, GroupBuyParticipantPaid).Find(&members).Error; err != nil {
		return nil, err
	}
	completed := make([]completedMember, 0, len(members))
	for _, m := range members {
		if rewardPlan != nil {
			if _, err := GrantGroupBuySubscriptionTx(tx, m.UserId, rewardPlan, int64(quotaPerShare), GroupBuySubscriptionSource); err != nil {
				return nil, err
			}
			completed = append(completed, completedMember{
				UserId: m.UserId, TradeNo: m.TradeNo, Quota: quotaPerShare,
				SubscriptionPlanId: rewardPlan.Id, PlanTitle: rewardPlan.Title,
			})
			continue
		}
		if err := creditTopUpQuota(tx, m.UserId, quotaPerShare, nil); err != nil {
			return nil, err
		}
		completed = append(completed, completedMember{UserId: m.UserId, TradeNo: m.TradeNo, Quota: quotaPerShare})
	}
	return completed, nil
}

// applyGroupBuyCompletion 在事务外同步缓存额度、记录充值日志并生成邀请返现。
func applyGroupBuyCompletion(completed []completedMember, callerIp string) {
	for _, m := range completed {
		if m.SubscriptionPlanId > 0 {
			// 订阅额度独立计费、不进钱包，故不同步钱包缓存。
			RecordTopupLog(m.UserId, fmt.Sprintf("拼团成功，获得订阅额度: %v（%s）", logger.LogQuota(m.Quota), m.PlanTitle), callerIp, "groupbuy", "groupbuy")
		} else {
			if cacheErr := cacheIncrUserQuota(m.UserId, int64(m.Quota)); cacheErr != nil {
				common.SysLog("failed to sync group-buy quota cache: " + cacheErr.Error())
			}
			RecordTopupLog(m.UserId, fmt.Sprintf("拼团成功，到账额度: %v", logger.LogQuota(m.Quota)), callerIp, "groupbuy", "groupbuy")
		}
		if topUpRec := GetTopUpByTradeNo(m.TradeNo); topUpRec != nil {
			CreateInviterRebate(m.UserId, topUpRec.Id, m.TradeNo, m.Quota)
		}
	}
}

// SettleExpiredGroupBuyIfEligible 处理到期拼团：若已达最低成团档，则按最高解锁档结算成团并入账，
// 返回 settled=true；未达最低档返回 settled=false，交由调用方走失败退款流程。
func SettleExpiredGroupBuyIfEligible(groupBuyId int) (settled bool, err error) {
	var completed []completedMember
	var granted bool
	err = DB.Transaction(func(tx *gorm.DB) error {
		groupBuy := &GroupBuy{}
		if err := lockForUpdate(tx).Where("id = ?", groupBuyId).First(groupBuy).Error; err != nil {
			return err
		}
		if groupBuy.Status != GroupBuyStatusPending {
			return nil // 已被其它路径结算/失败
		}
		var paidCount int64
		if err := tx.Model(&GroupBuyParticipant{}).
			Where("group_buy_id = ? AND pay_status = ?", groupBuy.Id, GroupBuyParticipantPaid).
			Count(&paidCount).Error; err != nil {
			return err
		}
		groupBuy.PaidCount = int(paidCount)
		tier, ok := highestUnlockedGroupBuyTier(groupBuy.resolvedTiers(), int(paidCount))
		if !ok {
			// 未达最低成团档：保存进度，交由调用方失败退款
			return tx.Save(groupBuy).Error
		}
		members, gErr := grantGroupBuySuccessTx(tx, groupBuy, tier.PerShareAmount)
		if gErr != nil {
			return gErr
		}
		completed = members
		granted = true
		return nil
	})
	if err != nil {
		return false, err
	}
	if granted {
		applyGroupBuyCompletion(completed, "groupbuy")
	}
	return granted, nil
}

// ===== 失败 / 过期 =====

// GetExpiredPendingGroupBuyIds 返回已过期且仍可收尾的拼团 id。
// 含 draft：发起人一直没付款的草稿团同样要到期收尾，否则会永远留在库里。
func GetExpiredPendingGroupBuyIds(now int64, limit int) ([]int, error) {
	var ids []int
	err := DB.Model(&GroupBuy{}).
		Where("status IN (?) AND expire_time < ?",
			[]string{GroupBuyStatusPending, GroupBuyStatusDraft}, now).
		Order("id asc").Limit(limit).Pluck("id", &ids).Error
	return ids, err
}

// MarkGroupBuyFailed 将拼团置为失败（幂等），返回需退款的已支付参团记录。
func MarkGroupBuyFailed(groupBuyId int) ([]GroupBuyParticipant, error) {
	var paidParticipants []GroupBuyParticipant
	err := DB.Transaction(func(tx *gorm.DB) error {
		groupBuy := &GroupBuy{}
		if err := lockForUpdate(tx).Where("id = ?", groupBuyId).First(groupBuy).Error; err != nil {
			return err
		}
		// draft 同样可置失败：草稿团只可能有发起人一条未支付记录，退款列表为空。
		if groupBuy.Status != GroupBuyStatusPending && groupBuy.Status != GroupBuyStatusDraft {
			return nil // 幂等
		}
		groupBuy.Status = GroupBuyStatusFailed
		groupBuy.CompleteTime = common.GetTimestamp()
		if err := tx.Save(groupBuy).Error; err != nil {
			return err
		}
		return tx.Where("group_buy_id = ? AND pay_status = ?", groupBuyId, GroupBuyParticipantPaid).Find(&paidParticipants).Error
	})
	return paidParticipants, err
}

// ReleaseGroupBuyReservation 用户放弃支付时立即释放名额预占，让名额可被他人占用、
// 本人也能立刻重新参团，而不必干等 groupBuyReserveTTLSeconds。
//
// 只动 reserve_expire_time，不碰充值订单：结算路径不看这个字段，因此用户若在关闭
// 收银台后仍完成付款，回调照样把该记录标记为已支付并计入成团进度，不会丢单。
func ReleaseGroupBuyReservation(userId int, tradeNo string) error {
	return DB.Model(&GroupBuyParticipant{}).
		Where("trade_no = ? AND user_id = ? AND pay_status = ?", tradeNo, userId, GroupBuyParticipantPending).
		Update("reserve_expire_time", common.GetTimestamp()).Error
}

// MarkParticipantRefundResult 标记参团记录的退款结果（refunded / refund_pending），幂等。
func MarkParticipantRefundResult(participantId int, status string) error {
	return DB.Model(&GroupBuyParticipant{}).
		Where("id = ? AND pay_status = ?", participantId, GroupBuyParticipantPaid).
		Update("pay_status", status).Error
}

// ===== 查询 =====

// GetGroupBuyByNo 返回拼团实例及其参团记录。
func GetGroupBuyByNo(groupNo string) (*GroupBuy, []GroupBuyParticipant, error) {
	groupBuy := &GroupBuy{}
	if err := DB.Where("group_no = ?", groupNo).First(groupBuy).Error; err != nil {
		return nil, nil, errors.New("拼团不存在")
	}
	var participants []GroupBuyParticipant
	if err := DB.Where("group_buy_id = ?", groupBuy.Id).Order("id asc").Find(&participants).Error; err != nil {
		return nil, nil, err
	}
	return groupBuy, participants, nil
}

// GetActiveGroupBuysForHall 返回拼团大厅可参与的拼团（进行中且未过期），按创建时间倒序分页。
func GetActiveGroupBuysForHall(now int64, pageInfo *common.PageInfo) ([]*GroupBuy, int64, error) {
	query := DB.Model(&GroupBuy{}).Where("status = ? AND expire_time > ?", GroupBuyStatusPending, now)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var groupBuys []*GroupBuy
	err := query.Order("create_time desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&groupBuys).Error
	return groupBuys, total, err
}

// GetUserGroupBuys 返回某用户参与过的拼团（按参团记录倒序）。
// 不含 draft：发起后未付款的草稿团对用户也不该出现在"我的拼团"里。
func GetUserGroupBuys(userId int, pageInfo *common.PageInfo) ([]*GroupBuy, int64, error) {
	var groupBuyIds []int
	if err := DB.Model(&GroupBuyParticipant{}).
		Joins("JOIN group_buys ON group_buys.id = group_buy_participants.group_buy_id").
		Where("group_buy_participants.user_id = ? AND group_buys.status <> ?", userId, GroupBuyStatusDraft).
		Order("group_buy_participants.id desc").
		Pluck("group_buy_participants.group_buy_id", &groupBuyIds).Error; err != nil {
		return nil, 0, err
	}
	// 去重并保持顺序
	seen := make(map[int]bool)
	uniqueIds := make([]int, 0, len(groupBuyIds))
	for _, id := range groupBuyIds {
		if !seen[id] {
			seen[id] = true
			uniqueIds = append(uniqueIds, id)
		}
	}
	total := int64(len(uniqueIds))
	start := pageInfo.GetStartIdx()
	end := start + pageInfo.GetPageSize()
	if start > len(uniqueIds) {
		start = len(uniqueIds)
	}
	if end > len(uniqueIds) {
		end = len(uniqueIds)
	}
	pageIds := uniqueIds[start:end]
	if len(pageIds) == 0 {
		return []*GroupBuy{}, total, nil
	}
	var groupBuys []*GroupBuy
	if err := DB.Where("id IN ?", pageIds).Order("id desc").Find(&groupBuys).Error; err != nil {
		return nil, 0, err
	}
	return groupBuys, total, nil
}

// GetAllGroupBuys 管理员分页查询全部拼团，可按状态过滤。
func GetAllGroupBuys(status string, pageInfo *common.PageInfo) ([]*GroupBuy, int64, error) {
	query := DB.Model(&GroupBuy{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var groupBuys []*GroupBuy
	err := query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&groupBuys).Error
	return groupBuys, total, err
}

// GetGroupBuyById 返回拼团及参团记录（管理员）。
func GetGroupBuyById(id int) (*GroupBuy, []GroupBuyParticipant, error) {
	groupBuy := &GroupBuy{}
	if err := DB.Where("id = ?", id).First(groupBuy).Error; err != nil {
		return nil, nil, errors.New("拼团不存在")
	}
	var participants []GroupBuyParticipant
	if err := DB.Where("group_buy_id = ?", groupBuy.Id).Order("id asc").Find(&participants).Error; err != nil {
		return nil, nil, err
	}
	return groupBuy, participants, nil
}

// GetRefundPendingParticipants 返回待管理员手动退款的参团记录（管理员）。
func GetRefundPendingParticipants(pageInfo *common.PageInfo) ([]*GroupBuyParticipant, int64, error) {
	query := DB.Model(&GroupBuyParticipant{}).Where("pay_status = ?", GroupBuyParticipantRefundPending)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var participants []*GroupBuyParticipant
	err := query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&participants).Error
	return participants, total, err
}

// MarkParticipantRefunded 管理员手动标记某参团记录已退款。
func MarkParticipantRefunded(participantId int) error {
	return DB.Model(&GroupBuyParticipant{}).
		Where("id = ?", participantId).
		Update("pay_status", GroupBuyParticipantRefunded).Error
}
