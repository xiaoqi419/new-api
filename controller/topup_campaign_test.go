package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v81"
)

func TestCampaignPaymentThresholds(t *testing.T) {
	old := operation_setting.GetPaymentSetting().AmountDiscount
	operation_setting.GetPaymentSetting().AmountDiscount = map[int]float64{300: .5}
	t.Cleanup(func() { operation_setting.GetPaymentSetting().AmountDiscount = old })
	campaign := &model.TopUpBonusPublic{Mode: "discount", Tiers: []model.TopUpBonusTier{{Pay: 100, Discount: .9}, {Pay: 500, Discount: .8}}}
	for _, tc := range []struct {
		amount int64
		rate   float64
	}{{99, 1}, {100, .9}, {300, .9}, {499, .9}, {500, .8}, {1000, .8}} {
		assert.Equal(t, tc.rate, topupPaymentDiscount(float64(tc.amount), campaign))
	}
	assert.Equal(t, .5, topupPaymentDiscount(300, nil))
}

func TestStripeCampaignCheckoutChargesQuotedAmount(t *testing.T) {
	var amount, quantity, promotion string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/prices/price_campaign" {
			_, _ = w.Write([]byte(`{"id":"price_campaign","active":true,"currency":"cny","product":"prod_wallet","unit_amount":100,"type":"one_time"}`))
			return
		}
		require.Equal(t, "/v1/checkout/sessions", r.URL.Path)
		require.NoError(t, r.ParseForm())
		amount = r.Form.Get("line_items[0][price_data][unit_amount]")
		quantity = r.Form.Get("line_items[0][quantity]")
		promotion = r.Form.Get("allow_promotion_codes")
		assert.Equal(t, "prod_wallet", r.Form.Get("line_items[0][price_data][product]"))
		_, _ = w.Write([]byte(`{"id":"cs_test","url":"https://checkout.stripe.com/test"}`))
	}))
	defer server.Close()
	previous := stripe.GetBackend(stripe.APIBackend)
	stripe.SetBackend(stripe.APIBackend, stripe.GetBackendWithConfig(stripe.APIBackend, &stripe.BackendConfig{URL: stripe.String(server.URL), HTTPClient: server.Client()}))
	t.Cleanup(func() { stripe.SetBackend(stripe.APIBackend, previous) })
	quoted := stripeCampaignQuote{Money: 270}
	link, err := genStripeLinkWithConfig(tenantStripeConfig{ApiSecret: "sk_test_local", PriceId: "price_campaign", Promotion: true}, "order", "", "", 300, "https://example.com/ok", "https://example.com/cancel", &quoted)
	require.NoError(t, err)
	assert.Equal(t, "https://checkout.stripe.com/test", link)
	assert.Equal(t, "cny", quoted.Currency)
	assert.Equal(t, "27000", amount)
	assert.Equal(t, "1", quantity)
	assert.Equal(t, "false", promotion)
}

func TestJSAPIStateBindsCampaignAcrossRedirect(t *testing.T) {
	campaign := &model.TopUpBonusPublic{Mode: "discount", Tiers: []model.TopUpBonusTier{{Pay: 100, Discount: .9}}}
	state := buildJSAPIState(12, 300, 27000, campaign)
	assert.LessOrEqual(t, len(state), 128)
	assert.LessOrEqual(t, len(buildJSAPIState(2147483647, 1_000_000, 100_000_000, campaign)), 128)
	id, amount, cents, err := parseJSAPIState(state)
	require.NoError(t, err)
	assert.Equal(t, 12, id)
	assert.EqualValues(t, 300, amount)
	assert.EqualValues(t, 27000, cents)
	_, _, _, err = parseJSAPIState(state + "tampered")
	require.Error(t, err)
}

func TestCampaignPaymentAmountsAndTokenUnits(t *testing.T) {
	campaign := &model.TopUpBonusPublic{Mode: "discount", Tiers: []model.TopUpBonusTier{{Pay: 100, Discount: .9}, {Pay: 500, Discount: .8}}}
	oldDisplay := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldGroups := common.TopupGroupRatio2JSONString()
	oldWaffo := setting.WaffoUnitPrice
	oldPancake := setting.WaffoPancakeUnitPrice
	t.Cleanup(func() {
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldDisplay
		setting.WaffoUnitPrice = oldWaffo
		setting.WaffoPancakeUnitPrice = oldPancake
		require.NoError(t, common.UpdateTopupGroupRatioByJSONString(oldGroups))
	})
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"default":1}`))
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCNY
	setting.WaffoUnitPrice = 1
	setting.WaffoPancakeUnitPrice = 1
	for _, tc := range []struct {
		amount int64
		paid   float64
	}{{99, 99}, {100, 90}, {300, 270}, {499, 449.1}, {500, 400}, {1000, 800}} {
		assert.Equal(t, tc.paid, getPayMoney(tc.amount, "default", 1, campaign))
		assert.Equal(t, tc.paid, getWaffoPayMoney(float64(tc.amount), "default", campaign))
		assert.Equal(t, tc.paid, getWaffoPancakePayMoney(tc.amount, "default", campaign))
		assert.InDelta(t, tc.paid, getStripePayMoney(float64(tc.amount), "default", 1, campaign), 1e-8)
	}
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
	campaign.Tiers = []model.TopUpBonusTier{{Pay: common.QuotaPerUnit, Discount: .9}}
	assert.Equal(t, .9, getPayMoney(int64(common.QuotaPerUnit), "default", 1, campaign))
}

func TestCampaignThresholdCanExceedLegacyPresetCeiling(t *testing.T) {
	withPaymentAmountOptions(t, []int{100, 500}, operation_setting.QuotaDisplayTypeCNY)
	common.OptionMapRWMutex.Lock()
	old, exists := common.OptionMap[model.TopUpBonusOptionKey]
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	common.OptionMap[model.TopUpBonusOptionKey] = `{"enabled":true,"mode":"discount","start":1,"end":4102444800,"tiers":[{"pay":1000,"discount":0.8}]}`
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		if exists {
			common.OptionMap[model.TopUpBonusOptionKey] = old
		} else {
			delete(common.OptionMap, model.TopUpBonusOptionKey)
		}
	})
	assert.EqualValues(t, 1000, GetMaxTopup(1))
}
