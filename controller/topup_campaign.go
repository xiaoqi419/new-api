package controller

import (
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

func topupPaymentDiscount(amount float64, campaign *model.TopUpBonusPublic) float64 {
	if rate, active := campaign.Discount(amount); active {
		return rate
	}
	if math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 || amount > float64(math.MaxInt) {
		return 1
	}
	if rate := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; rate > 0 && !math.IsNaN(rate) && !math.IsInf(rate, 0) {
		return rate
	}
	return 1
}

// An explicit nil excludes non-wallet purchases from campaign pricing.
func paymentCampaign(supplied []*model.TopUpBonusPublic) *model.TopUpBonusPublic {
	if len(supplied) > 0 {
		return supplied[0]
	}
	return model.ActiveTopUpBonus(common.GetTimestamp())
}

func insertCampaignTopUp(order *model.TopUp, campaign *model.TopUpBonusPublic, amount float64) error {
	order.CampaignSnapshot = true
	order.CampaignMode = "none"
	order.CampaignDiscount = 1
	if campaign != nil {
		order.CampaignMode = campaign.Mode
	}
	if rate, active := campaign.Discount(amount); active {
		order.CampaignDiscount = rate
	}
	bonus, err := campaign.BonusQuota(order.Money)
	if err != nil {
		return err
	}
	order.BonusQuota = bonus
	return order.Insert()
}
