package controller

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/setting/ui_setting"

	"github.com/gin-gonic/gin"
)

var completionRatioMetaOptionKeys = []string{
	"ModelPrice",
	"ModelRatio",
	"CompletionRatio",
	"CacheRatio",
	"CreateCacheRatio",
	"ImageRatio",
	"AudioRatio",
	"AudioCompletionRatio",
}

func isPaymentComplianceOptionKey(key string) bool {
	return strings.HasPrefix(key, "payment_setting.compliance_")
}

func isPositiveOptionValue(value string) bool {
	intValue, err := strconv.Atoi(strings.TrimSpace(value))
	if err == nil {
		return intValue > 0
	}
	floatValue, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	return err == nil && floatValue > 0
}

// validateQuotaReminderOption validates the small, user-facing subset of
// options used by the low-quota reminder settings.  Option values arrive via
// the generic PUT /api/option endpoint as strings, so validation must happen
// before model.UpdateOption mutates the persisted value or the in-memory map.
// Template bodies are validated by the reminder service when that service is
// available; this boundary only enforces safe scalar/configuration values.
func validateQuotaReminderOption(key, value string) error {
	switch key {
	case "QuotaRemindEnabled", "QuotaReminderEnabled", "quota_reminder.enabled":
		if _, err := strconv.ParseBool(strings.TrimSpace(value)); err != nil {
			return fmt.Errorf("QuotaRemindEnabled must be true or false")
		}
	case "QuotaRemindThreshold", "QuotaReminderThreshold", "quota_reminder.threshold":
		threshold, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil || math.IsNaN(threshold) || math.IsInf(threshold, 0) || threshold <= 0 {
			return fmt.Errorf("QuotaRemindThreshold must be finite and greater than zero")
		}
		if _, err := common.NormalizeDisplayedQuotaThreshold(
			threshold,
			operation_setting.GetQuotaDisplayType(),
			common.QuotaPerUnit,
			operation_setting.USDExchangeRate,
			operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate,
		); err != nil {
			return fmt.Errorf("QuotaRemindThreshold is outside the supported quota range")
		}
	case "QuotaRemindThresholdUnit", "QuotaReminderThresholdUnit", "quota_reminder.threshold_unit":
		unit := strings.ToUpper(strings.TrimSpace(value))
		switch unit {
		case common.QuotaDisplayUnitUSD, common.QuotaDisplayUnitCNY,
			common.QuotaDisplayUnitCustom, common.QuotaDisplayUnitTokens:
		default:
			return fmt.Errorf("unsupported quota reminder threshold unit %q", value)
		}
	case "QuotaRemindTemplate", "QuotaReminderTemplate", "QuotaRemindTemplateID", "QuotaReminderTemplateID", "quota_reminder.template", "quota_reminder.template_id":
		templateID := strings.TrimSpace(value)
		switch templateID {
		case "default", "concise", "custom":
		default:
			return fmt.Errorf("unsupported quota reminder template %q", value)
		}
		if templateID == "custom" {
			common.OptionMapRWMutex.RLock()
			customTemplate := common.OptionMap["quota_reminder.custom_template"]
			common.OptionMapRWMutex.RUnlock()
			if err := service.ValidateQuotaReminderCustomTemplate(customTemplate); err != nil {
				return err
			}
		}
	case "quota_reminder.custom_template":
		return service.ValidateQuotaReminderCustomTemplate(value)
	case "quota_reminder.threshold_quota_per_unit", "quota_reminder.threshold_usd_exchange_rate", "quota_reminder.threshold_custom_exchange_rate":
		valueFloat, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil || math.IsNaN(valueFloat) || math.IsInf(valueFloat, 0) || valueFloat <= 0 {
			return fmt.Errorf("quota reminder snapshot must be finite and greater than zero")
		}
	case "quota_reminder.threshold_custom_currency_symbol":
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("custom currency symbol must not be empty")
		}
	}
	return nil
}

type quotaReminderConfigUpdateRequest struct {
	Enabled        *bool    `json:"enabled"`
	Threshold      *float64 `json:"threshold"`
	Template       string   `json:"template"`
	CustomTemplate string   `json:"custom_template"`
}

func validateQuotaReminderConfigRequest(req quotaReminderConfigUpdateRequest) error {
	if req.Enabled == nil {
		return fmt.Errorf("quota reminder enabled is required")
	}
	if req.Threshold == nil {
		return fmt.Errorf("quota reminder threshold is required")
	}
	if math.IsNaN(*req.Threshold) || math.IsInf(*req.Threshold, 0) || *req.Threshold <= 0 {
		return fmt.Errorf("quota reminder threshold must be finite and greater than zero")
	}
	if _, err := common.NormalizeDisplayedQuotaThreshold(
		*req.Threshold,
		operation_setting.GetQuotaDisplayType(),
		common.QuotaPerUnit,
		operation_setting.USDExchangeRate,
		operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate,
	); err != nil {
		return fmt.Errorf("quota reminder threshold is outside the supported quota range")
	}

	switch strings.TrimSpace(req.Template) {
	case "default", "concise":
		// A previously saved custom template is irrelevant while a built-in
		// template is selected. Validate it only when custom is active so stale
		// data cannot prevent switching back to a built-in template.
	case "custom":
		return service.ValidateQuotaReminderCustomTemplate(req.CustomTemplate)
	default:
		return fmt.Errorf("unsupported quota reminder template %q", req.Template)
	}
	return nil
}

func collectModelNamesFromOptionValue(raw string, modelNames map[string]struct{}) {
	if strings.TrimSpace(raw) == "" {
		return
	}

	var parsed map[string]any
	if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
		return
	}

	for modelName := range parsed {
		modelNames[modelName] = struct{}{}
	}
}

func buildCompletionRatioMetaValue(optionValues map[string]string) string {
	modelNames := make(map[string]struct{})
	for _, key := range completionRatioMetaOptionKeys {
		collectModelNamesFromOptionValue(optionValues[key], modelNames)
	}

	meta := make(map[string]ratio_setting.CompletionRatioInfo, len(modelNames))
	for modelName := range modelNames {
		meta[modelName] = ratio_setting.GetCompletionRatioInfo(modelName)
	}

	jsonBytes, err := common.Marshal(meta)
	if err != nil {
		return "{}"
	}
	return string(jsonBytes)
}

func GetOptions(c *gin.Context) {
	var options []*model.Option
	optionValues := make(map[string]string)
	common.OptionMapRWMutex.Lock()
	for k, v := range common.OptionMap {
		if k == "theme.frontend" || k == billing_setting.BillingModeOptionKey || k == billing_setting.BillingExprOptionKey {
			continue
		}
		value := common.Interface2String(v)
		isSensitiveKey := strings.HasSuffix(k, "Token") ||
			strings.HasSuffix(k, "Secret") ||
			strings.HasSuffix(k, "Key") ||
			strings.HasSuffix(k, "secret") ||
			strings.HasSuffix(k, "api_key")
		if isSensitiveKey {
			continue
		}
		options = append(options, &model.Option{
			Key:   k,
			Value: value,
		})
		if slices.Contains(completionRatioMetaOptionKeys, k) {
			optionValues[k] = value
		}
	}
	common.OptionMapRWMutex.Unlock()
	// Expose effective billing settings, including built-in model defaults,
	// without writing those defaults back to the administrator option store.
	for key, values := range map[string]map[string]string{
		billing_setting.BillingModeOptionKey: billing_setting.GetBillingModeCopy(),
		billing_setting.BillingExprOptionKey: billing_setting.GetBillingExprCopy(),
	} {
		encoded, err := common.Marshal(values)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		options = append(options, &model.Option{Key: key, Value: string(encoded)})
	}
	options = append(options, &model.Option{
		Key:   "CompletionRatioMeta",
		Value: buildCompletionRatioMetaValue(optionValues),
	})
	options = append(options, &model.Option{
		Key:   operation_setting.EffectivePaymentGatewayModeOptionKey,
		Value: operation_setting.GetEffectivePaymentGatewayMode(),
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    options,
	})
}

type OptionUpdateRequest struct {
	Key   string `json:"key"`
	Value any    `json:"value"`
}

func UpdatePasskeyDomains(c *gin.Context) {
	var request struct {
		RPID                *string `json:"rp_id"`
		LegacyRPIDs         *string `json:"legacy_rp_ids"`
		Origins             *string `json:"origins"`
		Preview             bool    `json:"preview"`
		RemovalConfirmation string  `json:"removal_confirmation"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || request.RPID == nil || request.LegacyRPIDs == nil || request.Origins == nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	change, err := model.UpdatePasskeyDomainOptions(map[string]string{
		"passkey.rp_id": *request.RPID, "passkey.legacy_rp_ids": *request.LegacyRPIDs, "passkey.origins": *request.Origins,
	}, request.Preview, request.RemovalConfirmation)
	if err != nil {
		writePasskeyDomainSettingsError(c, err)
		if !request.Preview {
			recordPasskeyDomainAudit(c, change, request.RemovalConfirmation != "", err)
		}
		return
	}
	if !request.Preview {
		recordPasskeyDomainAudit(c, change, request.RemovalConfirmation != "", nil)
	}
	common.ApiSuccess(c, change)
}

func writePasskeyDomainSettingsError(c *gin.Context, err error) {
	var removal *model.PasskeyDomainRemovalError
	if errors.As(err, &removal) {
		common.ApiErrorStatus(c, http.StatusConflict, common.NewMessage("Review the affected Passkeys and confirm the domain removal. If the settings or impact have changed, confirmation is required again."), gin.H{
			"code": "PASSKEY_RP_ID_REMOVAL_CONFIRMATION_REQUIRED",
			"data": removal.Change,
		})
		return
	}
	if errors.Is(err, system_setting.ErrPasskeyRPIDInvalid) {
		writeSecurityOperationError(c, err)
		return
	}
	common.ApiError(c, err)
}

func UpdateOption(c *gin.Context) {
	var option OptionUpdateRequest
	err := common.DecodeJson(c.Request.Body, &option)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	switch option.Value.(type) {
	case bool:
		option.Value = common.Interface2String(option.Value.(bool))
	case float64:
		option.Value = common.Interface2String(option.Value.(float64))
	case int:
		option.Value = common.Interface2String(option.Value.(int))
	default:
		option.Value = fmt.Sprintf("%v", option.Value)
	}
	switch option.Key {
	case operation_setting.EffectivePaymentGatewayModeOptionKey:
		common.ApiErrorMsg(c, "当前生效支付模式为只读配置")
		return
	case "QuotaForInviter", "QuotaForInvitee":
		if isPositiveOptionValue(option.Value.(string)) && !operation_setting.IsPaymentComplianceConfirmed() {
			common.ApiErrorT(c, "Payment, redemption, subscription, and invitation reward features are disabled. The administrator must confirm compliance terms before enabling them.")
			return
		}
	default:
		if isPaymentComplianceOptionKey(option.Key) {
			common.ApiErrorT(c, "Compliance confirmation fields cannot be changed through the general settings API")
			return
		}
	}
	if option.Key == "TaskPublicAddress" && option.Value.(string) != "" {
		if err := service.ValidateTaskArtifactBaseURL(option.Value.(string)); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	switch option.Key {
	case service.GMPayFeeConfigOptionKey:
		// Keep the fee policy as an opaque option value, but validate it before
		// it reaches the database.  The checkout path treats malformed policy
		// data as unavailable; accepting it here would make an administrator
		// believe that dynamic Native checkout is enabled while every order
		// silently falls back to an unsafe zero-fee quote.
		if _, validateErr := service.ParseGMPayFeeConfig(option.Value.(string)); validateErr != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": validateErr.Error(),
			})
			return
		}
	case "GitHubOAuthEnabled":
		if option.Value == "true" && common.GitHubClientId == "" {
			common.ApiErrorT(c, "Cannot enable {{provider}}. Enter the {{provider}} Client ID and Client Secret first.", map[string]any{"provider": "GitHub OAuth"})
			return
		}
	case "discord.enabled":
		if option.Value == "true" && system_setting.GetDiscordSettings().ClientId == "" {
			common.ApiErrorT(c, "Cannot enable {{provider}}. Enter the {{provider}} Client ID and Client Secret first.", map[string]any{"provider": "Discord OAuth"})
			return
		}
	case "oidc.enabled":
		if option.Value == "true" && system_setting.GetOIDCSettings().ClientId == "" {
			common.ApiErrorT(c, "Cannot enable {{provider}}. Enter the {{provider}} Client ID and Client Secret first.", map[string]any{"provider": "OIDC"})
			return
		}
	case "LinuxDOOAuthEnabled":
		if option.Value == "true" && common.LinuxDOClientId == "" {
			common.ApiErrorT(c, "Cannot enable {{provider}}. Enter the {{provider}} Client ID and Client Secret first.", map[string]any{"provider": "LinuxDO OAuth"})
			return
		}
	case "EmailDomainRestrictionEnabled":
		if option.Value == "true" && len(common.EmailDomainWhitelist) == 0 {
			common.ApiErrorT(c, "Cannot enable the email domain restriction. Enter the allowed email domains first.")
			return
		}
	case "WeChatAuthEnabled":
		if option.Value == "true" && common.WeChatServerAddress == "" && common.WeChatMpToken == "" {
			common.ApiErrorT(c, "Cannot enable WeChat login. Enter the WeChat login settings first.")
			return
		}
	case "TurnstileCheckEnabled":
		if option.Value == "true" && common.TurnstileSiteKey == "" {
			common.ApiErrorT(c, "Cannot enable Turnstile verification. Enter the Turnstile settings first.")
			return
		}
	case "TelegramOAuthEnabled":
		if option.Value == "true" && !system_setting.GetTelegramSettings().IsConfigured() {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"code":    "TELEGRAM_OAUTH_NOT_CONFIGURED",
				"message": "Telegram OAuth is not configured or enabled. Please contact your administrator.",
			})
			return
		}
	case "theme.frontend":
		if option.Value != "default" {
			common.ApiErrorT(c, "The Classic frontend has been removed. The theme can only be set to default")
			return
		}
	case "GroupRatio":
		err = ratio_setting.CheckGroupRatio(option.Value.(string))
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "gemini.safety_settings":
		err = model_setting.ValidateGeminiSafetySettings(option.Value.(string))
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "claude.default_max_tokens":
		err = model_setting.ValidateClaudeDefaultMaxTokens(option.Value.(string))
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case operation_setting.ToolPriceOptionKey:
		err = operation_setting.ValidateToolPricesJSON(option.Value.(string))
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "ImageRatio":
		err = ratio_setting.UpdateImageRatioByJSONString(option.Value.(string))
		if err != nil {
			common.ApiErrorT(c, "Failed to set the image ratio: {{error}}", map[string]any{"error": err.Error()})
			return
		}
	case "AudioRatio":
		err = ratio_setting.UpdateAudioRatioByJSONString(option.Value.(string))
		if err != nil {
			common.ApiErrorT(c, "Failed to set the audio ratio: {{error}}", map[string]any{"error": err.Error()})
			return
		}
	case "AudioCompletionRatio":
		err = ratio_setting.UpdateAudioCompletionRatioByJSONString(option.Value.(string))
		if err != nil {
			common.ApiErrorT(c, "Failed to set the audio completion ratio: {{error}}", map[string]any{"error": err.Error()})
			return
		}
	case "CreateCacheRatio":
		err = ratio_setting.UpdateCreateCacheRatioByJSONString(option.Value.(string))
		if err != nil {
			common.ApiErrorT(c, "Failed to set the cache creation ratio: {{error}}", map[string]any{"error": err.Error()})
			return
		}
	case "ModelRequestRateLimitGroup":
		err = setting.CheckModelRequestRateLimitGroup(option.Value.(string))
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "AutomaticDisableStatusCodes":
		_, err = operation_setting.ParseHTTPStatusCodeRanges(option.Value.(string))
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "AutomaticRetryStatusCodes":
		_, err = operation_setting.ParseHTTPStatusCodeRanges(option.Value.(string))
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "PelicanMonitorGroups":
		normalized, normalizeErr := service.NormalizePelicanGroups(option.Value.(string))
		if normalizeErr != nil {
			common.ApiErrorMsg(c, normalizeErr.Error())
			return
		}
		option.Value = normalized
	case "PelicanLogicPrompt":
		normalized, normalizeErr := service.NormalizePelicanLogicPrompt(option.Value.(string))
		if normalizeErr != nil {
			common.ApiErrorMsg(c, normalizeErr.Error())
			return
		}
		option.Value = normalized
	case "PelicanLogicAnswer":
		normalized, normalizeErr := service.NormalizePelicanLogicAnswer(option.Value.(string))
		if normalizeErr != nil {
			common.ApiErrorMsg(c, normalizeErr.Error())
			return
		}
		option.Value = normalized
	case "PelicanDrawingPrompt":
		normalized, normalizeErr := service.NormalizePelicanDrawingPrompt(option.Value.(string))
		if normalizeErr != nil {
			common.ApiErrorMsg(c, normalizeErr.Error())
			return
		}
		option.Value = normalized
	case model.TopUpBonusOptionKey:
		normalized, normalizeErr := model.NormalizeTopUpBonusCampaign(option.Value.(string))
		if normalizeErr != nil {
			common.ApiErrorMsg(c, normalizeErr.Error())
			return
		}
		option.Value = normalized
	case billing_setting.BillingExprOptionKey:
		expressions := make(map[string]string)
		if err = common.UnmarshalJsonStr(option.Value.(string), &expressions); err != nil {
			common.ApiErrorT(c, "Billing expressions must be a JSON object mapping models to expressions: {{error}}", map[string]any{"error": err.Error()})
			return
		}
		models := make([]string, 0, len(expressions))
		for modelName := range expressions {
			models = append(models, modelName)
		}
		sort.Strings(models)
		storedVariants := billing_setting.GetPluginBillingExprCopy()
		for _, modelName := range models {
			variants := make(map[string]any)
			for key, expression := range storedVariants {
				if plugin, name, ok := billing_setting.SplitPluginBillingExprKey(key); ok && name == modelName {
					variants[plugin] = expression
				}
			}
			err = model.ValidateModelPricing(modelName, model.PricingValues{
				"billing_setting.billing_expr":          expressions[modelName],
				billing_setting.PluginBillingExprOption: variants,
			})
			if err != nil {
				common.ApiErrorT(c, "Invalid billing expression for model {{model}}: {{error}}", map[string]any{"model": modelName, "error": err.Error()})
				return
			}
		}
	case billing_setting.PluginBillingExprOption:
		var expressions map[string]string
		if err = common.UnmarshalJsonStr(option.Value.(string), &expressions); err != nil || expressions == nil {
			common.ApiErrorMsg(c, "plugin billing expressions must be a JSON object")
			return
		}
		for key, expression := range expressions {
			plugin, name, valid := billing_setting.SplitPluginBillingExprKey(key)
			if !valid {
				common.ApiErrorMsg(c, "invalid plugin billing expression key: "+key)
				return
			}
			if err = model.ValidateModelPricing(name, model.PricingValues{
				billing_setting.PluginBillingExprOption: map[string]any{plugin: expression},
			}); err != nil {
				common.ApiError(c, err)
				return
			}
		}
	case "console_setting.api_info":
		err = console_setting.ValidateConsoleSettings(option.Value.(string), "ApiInfo")
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "console_setting.announcements":
		err = console_setting.ValidateConsoleSettings(option.Value.(string), "Announcements")
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "console_setting.faq":
		err = console_setting.ValidateConsoleSettings(option.Value.(string), "FAQ")
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "console_setting.uptime_kuma_groups":
		err = console_setting.ValidateConsoleSettings(option.Value.(string), "UptimeKumaGroups")
		if err != nil {
			common.ApiError(c, err)
			return
		}
	case "ui_setting.appearance":
		normalized, validateErr := ui_setting.ValidateAppearanceJSONString(option.Value.(string))
		if validateErr != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": validateErr.Error(),
			})
			return
		}
		option.Value = normalized
	case "ui_setting.apimart_home":
		normalized, validateErr := ui_setting.ValidateApimartHomeJSONString(option.Value.(string))
		if validateErr != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": validateErr.Error(),
			})
			return
		}
		option.Value = normalized
	case "CommunityLinks":
		if strings.TrimSpace(option.Value.(string)) != "" {
			var probe []map[string]any
			if jsonErr := common.Unmarshal([]byte(option.Value.(string)), &probe); jsonErr != nil {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": "官方社群配置必须是合法的 JSON 数组",
				})
				return
			}
		}
	}
	if err := validateQuotaReminderOption(option.Key, option.Value.(string)); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if model.IsPasskeyDomainOption(option.Key) {
		change, updateErr := model.UpdatePasskeyDomainOptions(map[string]string{option.Key: option.Value.(string)}, false, "")
		if updateErr != nil {
			writePasskeyDomainSettingsError(c, updateErr)
			recordPasskeyDomainAudit(c, change, false, updateErr)
			return
		}
		recordPasskeyDomainAudit(c, change, false, nil)
		common.ApiSuccess(c, change)
		return
	}
	err = model.UpdateOption(option.Key, option.Value.(string))
	if err != nil {
		if errors.Is(err, system_setting.ErrPasskeyRPIDInvalid) {
			writeSecurityOperationError(c, err)
		} else {
			common.ApiError(c, err)
		}
		return
	}
	// 出于安全考虑只记录被修改的配置项名称，不记录配置值（可能含密钥等敏感信息）。
	recordManageAudit(c, "option.update", map[string]any{
		"key": option.Key,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// UpdateQuotaReminderConfig accepts the complete reminder configuration in
// one request. The model layer persists its values and display snapshot in a
// single transaction, which avoids partial settings during concurrent task
// execution.
func UpdateQuotaReminderConfig(c *gin.Context) {
	var req quotaReminderConfigUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}
	if err := validateQuotaReminderConfigRequest(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if err := model.UpdateQuotaReminderOptions(
		*req.Enabled,
		strconv.FormatFloat(*req.Threshold, 'f', -1, 64),
		strings.TrimSpace(req.Template),
		req.CustomTemplate,
	); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "option.quota_reminder_update", map[string]interface{}{
		"keys": []string{
			"quota_reminder.enabled",
			"quota_reminder.threshold",
			"quota_reminder.template",
			"quota_reminder.custom_template",
			"quota_reminder.threshold_snapshot",
		},
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// SendTestEmail 用当前生效的 SMTP 配置发一封测试邮件，让管理员保存后立刻知道配置是否可用。
// 收件人留空时寄给操作者本人，省去手打邮箱。
func SendTestEmail(c *gin.Context) {
	var req struct {
		To string `json:"to"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	receiver := strings.TrimSpace(req.To)
	if receiver == "" {
		user, err := model.GetUserById(c.GetInt("id"), false)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		receiver = strings.TrimSpace(user.Email)
	}
	if receiver == "" {
		common.ApiErrorMsg(c, "请填写收件邮箱，或先为当前账号绑定邮箱")
		return
	}
	if !common.IsValidEmail(receiver) {
		common.ApiErrorMsg(c, "收件邮箱格式不正确")
		return
	}

	if err := sendSMTPTestEmail(receiver, "SMTP"); err != nil {
		common.ApiError(c, err)
		return
	}

	recordManageAudit(c, "option.test_email", map[string]interface{}{
		"receiver": receiver,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// SendQuotaReminderTestEmail sends a one-off low-quota reminder preview to an
// explicitly supplied address.  It intentionally does not call NotifyUser or
// touch reminder state: this endpoint is a configuration smoke test only.
// The reminder service may replace the preview renderer in the future; keeping
// the transport and validation here preserves the administrator API contract.
func SendQuotaReminderTestEmail(c *gin.Context) {
	var req struct {
		To string `json:"to"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	receiver := strings.TrimSpace(req.To)
	if receiver == "" {
		common.ApiErrorMsg(c, "请填写收件邮箱")
		return
	}
	if !common.IsValidEmail(receiver) {
		common.ApiErrorMsg(c, "收件邮箱格式不正确")
		return
	}
	email, err := service.RenderQuotaReminderTestEmail()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := common.SendEmailWithAlternative(email.Subject, receiver, email.HTML, email.Text); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "option.quota_reminder_test_email", map[string]interface{}{
		"receiver": receiver,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func sendSMTPTestEmail(receiver, kind string) error {
	subject := fmt.Sprintf("%s %s测试邮件", common.SystemName, kind)
	content := fmt.Sprintf("<p>这是一封来自 %s 的%s测试邮件。</p>"+
		"<p>您能收到它，说明当前保存的 SMTP 配置可以正常发信。</p>"+
		"<p>发送时间：%s</p>", common.SystemName, kind, time.Now().Format("2006-01-02 15:04:05"))
	return common.SendEmail(subject, receiver, content)
}
