package model

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const TopUpBonusOptionKey = "TopUpBonusCampaign"

const topUpBonusTierLimit = 20

type TopUpBonusTier struct {
	Pay  float64 `json:"pay"`
	Gift float64 `json:"gift"`
}

type TopUpBonusCampaign struct {
	Enabled bool             `json:"enabled"`
	Start   int64            `json:"start"`
	End     int64            `json:"end"`
	Tiers   []TopUpBonusTier `json:"tiers"`
}

type TopUpBonusPublic struct {
	Tiers []TopUpBonusTier `json:"tiers"`
}

func defaultTopUpBonusCampaign() TopUpBonusCampaign {
	return TopUpBonusCampaign{Tiers: []TopUpBonusTier{}}
}

func NormalizeTopUpBonusCampaign(raw string) (string, error) {
	campaign := defaultTopUpBonusCampaign()
	if strings.TrimSpace(raw) != "" {
		if err := common.UnmarshalJsonStr(raw, &campaign); err != nil {
			return "", errors.New("充值活动配置必须是 JSON 对象")
		}
	}
	if campaign.Tiers == nil {
		campaign.Tiers = []TopUpBonusTier{}
	}
	if len(campaign.Tiers) > topUpBonusTierLimit {
		return "", errors.New("充值活动档位过多")
	}
	if campaign.Enabled && (campaign.Start <= 0 || campaign.End <= campaign.Start) {
		return "", errors.New("充值活动起止时间无效")
	}
	if !campaign.Enabled && campaign.End != 0 && campaign.End <= campaign.Start {
		return "", errors.New("充值活动起止时间无效")
	}
	seen := make(map[int64]struct{}, len(campaign.Tiers))
	for index := range campaign.Tiers {
		payCents, payOK := yuanCents(campaign.Tiers[index].Pay)
		giftCents, giftOK := yuanCents(campaign.Tiers[index].Gift)
		if !payOK || !giftOK || payCents <= 0 || giftCents <= 0 || payCents > 100_000_000 || giftCents > 100_000_000 {
			return "", errors.New("充值活动档位金额无效")
		}
		if _, ok := seen[payCents]; ok {
			return "", errors.New("充值活动档位金额重复")
		}
		seen[payCents] = struct{}{}
		campaign.Tiers[index].Pay = float64(payCents) / 100
		campaign.Tiers[index].Gift = float64(giftCents) / 100
	}
	sort.Slice(campaign.Tiers, func(i, j int) bool {
		return campaign.Tiers[i].Pay < campaign.Tiers[j].Pay
	})
	encoded, err := common.Marshal(campaign)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func LoadTopUpBonusCampaign() TopUpBonusCampaign {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[TopUpBonusOptionKey]
	common.OptionMapRWMutex.RUnlock()
	normalized, err := NormalizeTopUpBonusCampaign(raw)
	if err != nil {
		return defaultTopUpBonusCampaign()
	}
	campaign := defaultTopUpBonusCampaign()
	if err = common.UnmarshalJsonStr(normalized, &campaign); err != nil {
		return defaultTopUpBonusCampaign()
	}
	if campaign.Tiers == nil {
		campaign.Tiers = []TopUpBonusTier{}
	}
	return campaign
}

func ActiveTopUpBonus(now int64) *TopUpBonusPublic {
	campaign := LoadTopUpBonusCampaign()
	if !campaign.Enabled || now < campaign.Start || now > campaign.End || len(campaign.Tiers) == 0 {
		return nil
	}
	return &TopUpBonusPublic{Tiers: campaign.Tiers}
}

func TopUpBonusQuota(money float64, at int64) (int, error) {
	public := ActiveTopUpBonus(at)
	if public == nil {
		return 0, nil
	}
	paidCents, ok := yuanCents(money)
	if !ok || paidCents <= 0 {
		return 0, nil
	}
	giftCents := int64(0)
	for _, tier := range public.Tiers {
		tierCents, tierOK := yuanCents(tier.Pay)
		if tierOK && paidCents >= tierCents {
			nextGift, giftOK := yuanCents(tier.Gift)
			if giftOK {
				giftCents = nextGift
			}
		}
	}
	if giftCents <= 0 {
		return 0, nil
	}
	giftYuan := decimal.NewFromInt(giftCents).Div(decimal.NewFromInt(100))
	return common.WalletQuotaFromDecimalStrict(giftYuan.Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Truncate(0))
}

func yuanCents(value float64) (int64, bool) {
	if value <= 0 {
		return 0, false
	}
	scaled := decimal.NewFromFloat(value).Mul(decimal.NewFromInt(100))
	cents := scaled.Round(0)
	if cents.Sub(scaled).Abs().GreaterThan(decimal.NewFromFloat(0.01)) {
		return 0, false
	}
	if cents.GreaterThan(decimal.NewFromInt(100_000_000)) || !cents.IsPositive() {
		return 0, false
	}
	return cents.IntPart(), true
}

func creditUserQuotaTx(tx *gorm.DB, userId int, quota int) error {
	if quota <= 0 {
		return nil
	}
	maxCurrent, err := topUpQuotaMaxCurrent(quota)
	if err != nil {
		return err
	}
	result := tx.Model(&User{}).Where("id = ? AND quota <= ?", userId, maxCurrent).
		Update("quota", gorm.Expr("quota + ?", quota))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrTopUpQuotaLimitExceeded
	}
	return nil
}

func quotaWithBonus(paid int, bonus int) int {
	if bonus <= 0 {
		return paid
	}
	total, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(int64(paid)).Add(decimal.NewFromInt(int64(bonus))))
	if err != nil {
		return paid
	}
	return total
}

func bonusLogSuffix(bonus int) string {
	if bonus <= 0 {
		return ""
	}
	return fmt.Sprintf("，活动赠送: %s", logger.FormatQuota(bonus))
}

func TopUpBonusLogSuffix(bonus int) string {
	return bonusLogSuffix(bonus)
}

func QuotaWithTopUpBonus(paid int, bonus int) int {
	return quotaWithBonus(paid, bonus)
}
