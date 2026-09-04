package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func withQuotaReminderOptions(t *testing.T, options map[string]string) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = options
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})
}

func TestEffectiveQuotaReminderThresholdUsesDisplayedUnitAndUserSnapshot(t *testing.T) {
	oldUnit := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldQuotaPerUnit := common.QuotaPerUnit
	oldUSDExchangeRate := operation_setting.USDExchangeRate
	t.Cleanup(func() {
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldUnit
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldUSDExchangeRate
	})
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	operation_setting.GetGeneralSetting().QuotaDisplayType = common.QuotaDisplayUnitUSD
	withQuotaReminderOptions(t, map[string]string{
		quotaReminderEnabledKey:       "true",
		quotaReminderThresholdKey:     "1",
		quotaReminderThresholdUnitKey: common.QuotaDisplayUnitUSD,
	})

	global, err := EffectiveQuotaReminderThresholdForUser(dto.UserSetting{})
	require.NoError(t, err)
	require.Equal(t, 500_000, global)

	personal := dto.UserSetting{
		QuotaWarningThreshold:             2,
		QuotaWarningThresholdUnit:         common.QuotaDisplayUnitUSD,
		QuotaWarningThresholdQuotaPerUnit: 500_000,
		QuotaWarningThresholdUSDRate:      7.3,
	}
	override, err := EffectiveQuotaReminderThresholdForUser(personal)
	require.NoError(t, err)
	require.Equal(t, 1_000_000, override)
}

func TestEffectiveQuotaReminderThresholdDefaultsToOneDisplayedUnit(t *testing.T) {
	oldUnit := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldQuotaPerUnit := common.QuotaPerUnit
	oldUSDExchangeRate := operation_setting.USDExchangeRate
	oldCustomRate := operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate
	t.Cleanup(func() {
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldUnit
		operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = oldCustomRate
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldUSDExchangeRate
	})
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = 2.5
	for _, tc := range []struct {
		unit string
		want int
	}{
		{common.QuotaDisplayUnitUSD, 500_000},
		{common.QuotaDisplayUnitCNY, 68_493},
		{common.QuotaDisplayUnitCustom, 200_000},
		{common.QuotaDisplayUnitTokens, 1},
	} {
		t.Run(tc.unit, func(t *testing.T) {
			operation_setting.GetGeneralSetting().QuotaDisplayType = tc.unit
			withQuotaReminderOptions(t, map[string]string{quotaReminderThresholdUnitKey: tc.unit})
			threshold, err := EffectiveQuotaReminderThresholdForUser(dto.UserSetting{})
			require.NoError(t, err)
			require.Equal(t, tc.want, threshold)
		})
	}
}

func TestRenderQuotaReminderEmailEscapesHTMLValuesAndUsesWhitelist(t *testing.T) {
	oldSystemName := common.SystemName
	t.Cleanup(func() { common.SystemName = oldSystemName })
	common.SystemName = "<Site>"
	withQuotaReminderOptions(t, map[string]string{
		quotaReminderThresholdKey:      "1",
		quotaReminderThresholdUnitKey:  common.QuotaDisplayUnitTokens,
		quotaReminderTemplateKey:       "custom",
		quotaReminderCustomTemplateKey: `{"subject":"Hi {{username}}","html":"<p>{{username}}</p><p>{{site_name}}</p>","text":"{{username}} {{remaining_quota}}"}`,
	})
	email, err := RenderQuotaReminderEmail("<alice>", 4, 5, "https://example.test/topup?a=1&b=2")
	require.NoError(t, err)
	require.Equal(t, "Hi <alice>", email.Subject)
	require.Contains(t, email.HTML, "&lt;alice&gt;")
	require.Contains(t, email.HTML, "&lt;Site&gt;")
	require.NotContains(t, email.HTML, "<alice>")
}

func TestValidateQuotaReminderCustomTemplateRejectsUnknownOrMalformedVariables(t *testing.T) {
	unknown := `{"subject":"x {{password}}","html":"<p>x</p>","text":"x"}`
	require.Error(t, ValidateQuotaReminderCustomTemplate(unknown))
	malformed := `{"subject":"x {{username","html":"<p>x</p>","text":"x"}`
	require.Error(t, ValidateQuotaReminderCustomTemplate(malformed))
}

func TestQuotaReminderConfigForUserUsesPersonalDisplaySnapshot(t *testing.T) {
	oldCustomSymbol := operation_setting.GetGeneralSetting().CustomCurrencySymbol
	t.Cleanup(func() { operation_setting.GetGeneralSetting().CustomCurrencySymbol = oldCustomSymbol })
	operation_setting.GetGeneralSetting().CustomCurrencySymbol = "$current"
	withQuotaReminderOptions(t, map[string]string{
		quotaReminderThresholdKey:          "1",
		quotaReminderThresholdUnitKey:      common.QuotaDisplayUnitUSD,
		quotaReminderTemplateKey:           "default",
		quotaReminderThresholdQuotaPerUnit: "500000",
		quotaReminderThresholdUSDRate:      "7.3",
		quotaReminderThresholdCustomRate:   "1",
	})
	setting := dto.UserSetting{
		QuotaWarningThreshold:             2,
		QuotaWarningThresholdUnit:         common.QuotaDisplayUnitCustom,
		QuotaWarningThresholdQuotaPerUnit: 500_000,
		QuotaWarningThresholdUSDRate:      7.3,
		QuotaWarningThresholdCustomRate:   2,
		QuotaWarningThresholdCustomSymbol: "€",
	}
	cfg, err := quotaReminderConfigForUser(setting)
	require.NoError(t, err)
	require.Equal(t, 500_000, cfg.Threshold)
	email, err := renderQuotaReminderEmailWithConfig(cfg, "alice", 250_000, "/wallet")
	require.NoError(t, err)
	require.Contains(t, email.HTML, "€1")
	require.Contains(t, email.HTML, "€2")
}
