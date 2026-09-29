package model

import (
	"errors"
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
)

// Activity lottery amounts are stored in the smallest two-decimal unit for
// currency displays. In TOKENS mode the same field stores raw quota units.
const (
	activityLotteryCurrencyUSD    = operation_setting.QuotaDisplayTypeUSD
	activityLotteryCurrencyCNY    = operation_setting.QuotaDisplayTypeCNY
	activityLotteryCurrencyCustom = operation_setting.QuotaDisplayTypeCustom
	activityLotteryCurrencyTokens = operation_setting.QuotaDisplayTypeTokens
)

type activityLotteryCurrencySnapshot struct {
	DisplayCurrency       string
	DisplayCurrencySymbol string
	DisplayCurrencyRate   float64
}

func currentActivityLotteryCurrency() (activityLotteryCurrencySnapshot, error) {
	displayCurrency := operation_setting.GetQuotaDisplayType()
	snapshot := activityLotteryCurrencySnapshot{
		DisplayCurrency:       displayCurrency,
		DisplayCurrencySymbol: operation_setting.GetCurrencySymbol(),
		DisplayCurrencyRate:   operation_setting.GetUsdToCurrencyRate(operation_setting.USDExchangeRate),
	}

	switch displayCurrency {
	case activityLotteryCurrencyUSD:
		snapshot.DisplayCurrencySymbol = "$"
		snapshot.DisplayCurrencyRate = 1
	case activityLotteryCurrencyCNY:
		snapshot.DisplayCurrencySymbol = "¥"
		if snapshot.DisplayCurrencyRate <= 0 || math.IsNaN(snapshot.DisplayCurrencyRate) || math.IsInf(snapshot.DisplayCurrencyRate, 0) {
			snapshot.DisplayCurrencyRate = operation_setting.USDExchangeRate
			if snapshot.DisplayCurrencyRate <= 0 || math.IsNaN(snapshot.DisplayCurrencyRate) || math.IsInf(snapshot.DisplayCurrencyRate, 0) {
				snapshot.DisplayCurrencyRate = operation_setting.USDExchangeRate
			}
		}
	case activityLotteryCurrencyCustom:
		if snapshot.DisplayCurrencySymbol == "" {
			snapshot.DisplayCurrencySymbol = "¤"
		}
	case activityLotteryCurrencyTokens:
		snapshot.DisplayCurrencySymbol = ""
		snapshot.DisplayCurrencyRate = 1
	default:
		return activityLotteryCurrencySnapshot{}, errors.New("unsupported activity lottery display currency")
	}

	if snapshot.DisplayCurrencyRate <= 0 || math.IsNaN(snapshot.DisplayCurrencyRate) || math.IsInf(snapshot.DisplayCurrencyRate, 0) {
		return activityLotteryCurrencySnapshot{}, errors.New("invalid activity lottery display currency rate")
	}
	return snapshot, nil
}

// activityLotteryCurrencyForCampaign provides a stable interpretation for
// published campaigns. Empty fields are legacy rows from the original
// 人民币-only implementation and must continue to be read as CNY.
func activityLotteryCurrencyForCampaign(campaign *ActivityLotteryCampaign) activityLotteryCurrencySnapshot {
	if campaign == nil {
		return activityLotteryCurrencySnapshot{
			DisplayCurrency:       activityLotteryCurrencyUSD,
			DisplayCurrencySymbol: "$",
			DisplayCurrencyRate:   1,
		}
	}

	displayCurrency := campaign.DisplayCurrency
	if displayCurrency == "" {
		rate := campaign.USDExchangeRate
		if rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
			rate = operation_setting.USDExchangeRate
		}
		if rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
			rate = 1
		}
		return activityLotteryCurrencySnapshot{
			DisplayCurrency:       activityLotteryCurrencyCNY,
			DisplayCurrencySymbol: "¥",
			DisplayCurrencyRate:   rate,
		}
	}

	snapshot := activityLotteryCurrencySnapshot{
		DisplayCurrency:       displayCurrency,
		DisplayCurrencySymbol: campaign.DisplayCurrencySymbol,
		DisplayCurrencyRate:   campaign.DisplayCurrencyRate,
	}
	switch displayCurrency {
	case activityLotteryCurrencyUSD:
		snapshot.DisplayCurrencySymbol = "$"
		snapshot.DisplayCurrencyRate = 1
	case activityLotteryCurrencyCNY:
		snapshot.DisplayCurrencySymbol = "¥"
	case activityLotteryCurrencyCustom:
		if snapshot.DisplayCurrencySymbol == "" {
			snapshot.DisplayCurrencySymbol = "¤"
		}
	case activityLotteryCurrencyTokens:
		snapshot.DisplayCurrencySymbol = ""
		snapshot.DisplayCurrencyRate = 1
	default:
		return activityLotteryCurrencySnapshot{
			DisplayCurrency:       activityLotteryCurrencyCNY,
			DisplayCurrencySymbol: "¥",
			DisplayCurrencyRate:   1,
		}
	}
	if snapshot.DisplayCurrencyRate <= 0 || math.IsNaN(snapshot.DisplayCurrencyRate) || math.IsInf(snapshot.DisplayCurrencyRate, 0) {
		snapshot.DisplayCurrencyRate = 1
	}
	return snapshot
}

func normalizeActivityLotteryCampaignCurrency(campaign *ActivityLotteryCampaign) {
	snapshot := activityLotteryCurrencyForCampaign(campaign)
	campaign.DisplayCurrency = snapshot.DisplayCurrency
	campaign.DisplayCurrencySymbol = snapshot.DisplayCurrencySymbol
	campaign.DisplayCurrencyRate = snapshot.DisplayCurrencyRate
}

func activityLotteryPrizeQuota(amountMinor int64, snapshot activityLotteryCurrencySnapshot, quotaPerUnit float64) (int, error) {
	if amountMinor < 1 || quotaPerUnit <= 0 || math.IsNaN(quotaPerUnit) || math.IsInf(quotaPerUnit, 0) {
		return 0, errors.New("invalid activity lottery prize amount or quota settings")
	}

	var quotaValue decimal.Decimal
	if snapshot.DisplayCurrency == activityLotteryCurrencyTokens {
		quotaValue = decimal.NewFromInt(amountMinor)
	} else {
		quotaValue = decimal.NewFromInt(amountMinor).
			Mul(decimal.NewFromFloat(quotaPerUnit)).
			Div(decimal.NewFromInt(100)).
			Div(decimal.NewFromFloat(snapshot.DisplayCurrencyRate))
	}
	quota, err := common.WalletQuotaFromDecimalStrict(quotaValue)
	if err != nil || quota <= 0 {
		if err != nil {
			return 0, err
		}
		return 0, fmt.Errorf("activity lottery prize quota must be positive")
	}
	return quota, nil
}

// ActivityLotteryDisplayCurrencyLabel is used by exports and clients that
// need a concise, stable label for a campaign's captured display unit.
func ActivityLotteryDisplayCurrencyLabel(campaign *ActivityLotteryCampaign) string {
	snapshot := activityLotteryCurrencyForCampaign(campaign)
	switch snapshot.DisplayCurrency {
	case activityLotteryCurrencyTokens:
		return "Tokens"
	case activityLotteryCurrencyCustom:
		return snapshot.DisplayCurrencySymbol
	default:
		return snapshot.DisplayCurrency
	}
}

// FormatActivityLotteryAmount formats the stored amount according to the
// campaign snapshot. Legacy rows remain displayed as CNY.
func FormatActivityLotteryAmount(campaign *ActivityLotteryCampaign, amountMinor int64) string {
	snapshot := activityLotteryCurrencyForCampaign(campaign)
	if snapshot.DisplayCurrency == activityLotteryCurrencyTokens {
		return fmt.Sprintf("%d", amountMinor)
	}
	return fmt.Sprintf("%s%d.%02d", snapshot.DisplayCurrencySymbol, amountMinor/100, amountMinor%100)
}
