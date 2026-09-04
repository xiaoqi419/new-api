package service

import (
	"errors"
	"fmt"
	"html"
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const (
	quotaReminderEnabledKey            = "quota_reminder.enabled"
	quotaReminderThresholdKey          = "quota_reminder.threshold"
	quotaReminderThresholdUnitKey      = "quota_reminder.threshold_unit"
	quotaReminderTemplateKey           = "quota_reminder.template"
	quotaReminderCustomTemplateKey     = "quota_reminder.custom_template"
	quotaReminderThresholdQuotaPerUnit = "quota_reminder.threshold_quota_per_unit"
	quotaReminderThresholdUSDRate      = "quota_reminder.threshold_usd_exchange_rate"
	quotaReminderThresholdCustomRate   = "quota_reminder.threshold_custom_exchange_rate"
	quotaReminderThresholdCustomSymbol = "quota_reminder.threshold_custom_currency_symbol"
)

type quotaReminderTemplate struct {
	Subject string `json:"subject"`
	HTML    string `json:"html"`
	Text    string `json:"text"`
}

var quotaReminderTemplates = map[string]quotaReminderTemplate{
	"default": {
		Subject: "额度提醒：余额即将用尽",
		HTML:    "<p>您好，{{username}}：</p><p>您的余额仅剩 <strong>{{remaining_quota}}</strong>，已低于提醒阈值 <strong>{{threshold}}</strong>。</p><p>请及时充值：<a href=\"{{top_up_url}}\">{{top_up_url}}</a></p>",
		Text:    "您好，{{username}}：\n您的余额仅剩 {{remaining_quota}}，已低于提醒阈值 {{threshold}}。\n请及时充值：{{top_up_url}}",
	},
	"concise": {
		Subject: "余额不足提醒",
		HTML:    "<p>{{username}}，您的余额为 {{remaining_quota}}，低于阈值 {{threshold}}。<a href=\"{{top_up_url}}\">立即充值</a></p>",
		Text:    "{{username}}，您的余额为 {{remaining_quota}}，低于阈值 {{threshold}}。立即充值：{{top_up_url}}",
	},
}

var quotaReminderAllowedVariables = map[string]struct{}{
	"username": {}, "remaining_quota": {}, "threshold": {},
	"currency_symbol": {}, "top_up_url": {}, "site_name": {},
}

type QuotaReminderRenderedEmail struct {
	Subject string `json:"subject"`
	HTML    string `json:"html"`
	Text    string `json:"text"`
}

type quotaReminderConfig struct {
	Enabled            bool
	Threshold          int
	DisplayUnit        string
	QuotaPerUnit       float64
	USDExchangeRate    float64
	CustomExchangeRate float64
	CurrencySymbol     string
	TemplateID         string
	Template           quotaReminderTemplate
}

func quotaReminderSnapshotFromConfig(cfg quotaReminderConfig) model.QuotaReminderSnapshot {
	return model.QuotaReminderSnapshot{
		DisplayUnit:        cfg.DisplayUnit,
		QuotaPerUnit:       cfg.QuotaPerUnit,
		USDExchangeRate:    cfg.USDExchangeRate,
		CustomExchangeRate: cfg.CustomExchangeRate,
		CurrencySymbol:     cfg.CurrencySymbol,
	}
}

func quotaReminderOptions() map[string]string {
	keys := [...]string{
		quotaReminderEnabledKey,
		quotaReminderThresholdKey,
		quotaReminderThresholdUnitKey,
		quotaReminderTemplateKey,
		quotaReminderCustomTemplateKey,
		quotaReminderThresholdQuotaPerUnit,
		quotaReminderThresholdUSDRate,
		quotaReminderThresholdCustomRate,
		quotaReminderThresholdCustomSymbol,
	}
	options := make(map[string]string, len(keys))
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	for _, key := range keys {
		options[key] = strings.TrimSpace(common.OptionMap[key])
	}
	return options
}

func quotaReminderConfigFromOptions() (quotaReminderConfig, error) {
	options := quotaReminderOptions()
	cfg := quotaReminderConfig{
		Enabled:            common.QuotaRemindEnabled,
		DisplayUnit:        strings.ToUpper(strings.TrimSpace(operation_setting.GetQuotaDisplayType())),
		QuotaPerUnit:       common.QuotaPerUnit,
		USDExchangeRate:    operation_setting.USDExchangeRate,
		CustomExchangeRate: operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate,
		CurrencySymbol:     operation_setting.GetGeneralSetting().CustomCurrencySymbol,
	}
	if v := options[quotaReminderEnabledKey]; v != "" {
		parsed, err := strconv.ParseBool(v)
		if err != nil {
			return cfg, fmt.Errorf("invalid quota reminder enabled option: %w", err)
		}
		cfg.Enabled = parsed
	}
	if v := options[quotaReminderThresholdUnitKey]; v != "" {
		cfg.DisplayUnit = strings.ToUpper(v)
	}
	if err := validateQuotaReminderDisplayUnit(cfg.DisplayUnit); err != nil {
		return cfg, err
	}
	var err error
	if cfg.QuotaPerUnit, err = quotaReminderPositiveSnapshot(options[quotaReminderThresholdQuotaPerUnit], cfg.QuotaPerUnit, "quota per unit"); err != nil {
		return cfg, err
	}
	if cfg.USDExchangeRate, err = quotaReminderPositiveSnapshot(options[quotaReminderThresholdUSDRate], cfg.USDExchangeRate, "USD exchange rate"); err != nil {
		return cfg, err
	}
	if cfg.CustomExchangeRate, err = quotaReminderPositiveSnapshot(options[quotaReminderThresholdCustomRate], cfg.CustomExchangeRate, "custom exchange rate"); err != nil {
		return cfg, err
	}
	if options[quotaReminderThresholdCustomSymbol] != "" {
		cfg.CurrencySymbol = options[quotaReminderThresholdCustomSymbol]
	}

	displayedThreshold := float64(1)
	if thresholdText := options[quotaReminderThresholdKey]; thresholdText != "" {
		displayedThreshold, err = strconv.ParseFloat(thresholdText, 64)
		if err != nil {
			return cfg, fmt.Errorf("invalid quota reminder threshold: %w", err)
		}
	}
	cfg.Threshold, err = common.NormalizeDisplayedQuotaThreshold(displayedThreshold, cfg.DisplayUnit, cfg.QuotaPerUnit, cfg.USDExchangeRate, cfg.CustomExchangeRate)
	if err != nil {
		return cfg, fmt.Errorf("invalid quota reminder threshold: %w", err)
	}

	id := options[quotaReminderTemplateKey]
	if id == "" {
		id = "default"
	}
	template, ok := quotaReminderTemplates[id]
	if !ok {
		if id != "custom" {
			return cfg, fmt.Errorf("unknown quota reminder template %q", id)
		}
		custom := options[quotaReminderCustomTemplateKey]
		if custom == "" {
			return cfg, errors.New("custom quota reminder template is required")
		}
		if err := common.UnmarshalJsonStr(custom, &template); err != nil {
			return cfg, fmt.Errorf("invalid custom quota reminder template: %w", err)
		}
	}
	if err := validateQuotaReminderTemplate(template); err != nil {
		return cfg, err
	}
	cfg.Template = template
	cfg.TemplateID = id
	return cfg, nil
}

func validateQuotaReminderDisplayUnit(unit string) error {
	switch unit {
	case common.QuotaDisplayUnitUSD, common.QuotaDisplayUnitCNY,
		common.QuotaDisplayUnitCustom, common.QuotaDisplayUnitTokens:
		return nil
	default:
		return fmt.Errorf("unsupported quota reminder display unit %q", unit)
	}
}

func quotaReminderPositiveSnapshot(raw string, fallback float64, name string) (float64, error) {
	value := fallback
	var err error
	if raw != "" {
		value, err = strconv.ParseFloat(raw, 64)
	}
	if err != nil || value <= 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, fmt.Errorf("quota reminder %s must be finite and greater than zero", name)
	}
	return value, nil
}

func validateQuotaReminderTemplate(template quotaReminderTemplate) error {
	if strings.TrimSpace(template.Subject) == "" || strings.TrimSpace(template.HTML) == "" || strings.TrimSpace(template.Text) == "" {
		return fmt.Errorf("quota reminder template subject, html and text are required")
	}
	if strings.ContainsAny(template.Subject, "\r\n") {
		return errors.New("quota reminder template subject must be a single line")
	}
	for _, body := range []string{template.Subject, template.HTML, template.Text} {
		if _, err := renderQuotaReminderTemplate(body, nil, false); err != nil {
			return err
		}
	}
	return nil
}

func ValidateQuotaReminderCustomTemplate(value string) error {
	var template quotaReminderTemplate
	if err := common.Unmarshal([]byte(value), &template); err != nil {
		return fmt.Errorf("invalid custom quota reminder template: %w", err)
	}
	return validateQuotaReminderTemplate(template)
}

func renderQuotaReminderTemplate(body string, values map[string]string, escapeHTML bool) (string, error) {
	var out strings.Builder
	for len(body) > 0 {
		open := strings.Index(body, "{{")
		close := strings.Index(body, "}}")
		if close >= 0 && (open < 0 || close < open) {
			return "", errors.New("unexpected closing delimiter")
		}
		if open < 0 {
			out.WriteString(body)
			break
		}
		out.WriteString(body[:open])
		body = body[open+2:]
		close = strings.Index(body, "}}")
		if close < 0 {
			return "", errors.New("unclosed variable")
		}
		name := strings.TrimSpace(body[:close])
		if strings.Contains(name, "{{") {
			return "", errors.New("nested opening delimiter")
		}
		if _, ok := quotaReminderAllowedVariables[name]; !ok {
			return "", fmt.Errorf("unsupported variable %q", name)
		}
		if values == nil {
			out.WriteString("{{" + name + "}}")
		} else {
			value, ok := values[name]
			if !ok {
				return "", fmt.Errorf("missing value for variable %q", name)
			}
			if escapeHTML {
				value = html.EscapeString(value)
			}
			out.WriteString(value)
		}
		body = body[close+2:]
	}
	return out.String(), nil
}

func formatQuotaReminderValue(quota int64, cfg quotaReminderConfig) (string, error) {
	if quota > int64(common.MaxQuota) || quota < int64(common.MinQuota) {
		return "", fmt.Errorf("quota reminder value %d is outside supported range", quota)
	}
	if quota == 0 {
		return "0", nil
	}
	negative := quota < 0
	if negative {
		quota = -quota
	}
	value, err := common.DisplayedQuotaThreshold(int(quota), cfg.DisplayUnit, cfg.QuotaPerUnit, cfg.USDExchangeRate, cfg.CustomExchangeRate)
	if err != nil {
		return "", err
	}
	if negative {
		value = -value
	}
	return strconv.FormatFloat(value, 'f', -1, 64), nil
}

func renderQuotaReminderEmailWithConfig(cfg quotaReminderConfig, username string, remainingQuota int64, topUpURL string) (QuotaReminderRenderedEmail, error) {
	symbol := quotaReminderCurrencySymbol(cfg.DisplayUnit, cfg.CurrencySymbol)
	remaining, err := formatQuotaReminderValue(remainingQuota, cfg)
	if err != nil {
		return QuotaReminderRenderedEmail{}, err
	}
	threshold, err := formatQuotaReminderValue(int64(cfg.Threshold), cfg)
	if err != nil {
		return QuotaReminderRenderedEmail{}, err
	}
	values := map[string]string{"username": username, "remaining_quota": symbol + remaining, "threshold": symbol + threshold, "currency_symbol": symbol, "top_up_url": topUpURL, "site_name": common.SystemName}
	subject, err := renderQuotaReminderTemplate(cfg.Template.Subject, values, false)
	if err != nil {
		return QuotaReminderRenderedEmail{}, err
	}
	// Prevent user/site supplied values from introducing additional mail
	// headers when the subject is passed to net/smtp.
	subject = strings.NewReplacer("\r", " ", "\n", " ").Replace(subject)
	htmlBody, err := renderQuotaReminderTemplate(cfg.Template.HTML, values, true)
	if err != nil {
		return QuotaReminderRenderedEmail{}, err
	}
	textBody, err := renderQuotaReminderTemplate(cfg.Template.Text, values, false)
	if err != nil {
		return QuotaReminderRenderedEmail{}, err
	}
	return QuotaReminderRenderedEmail{Subject: subject, HTML: htmlBody, Text: textBody}, nil
}

func quotaReminderCurrencySymbol(unit string, customSymbol string) string {
	switch unit {
	case common.QuotaDisplayUnitUSD:
		return "$"
	case common.QuotaDisplayUnitCNY:
		return "¥"
	case common.QuotaDisplayUnitCustom:
		if symbol := customSymbol; symbol != "" {
			return symbol
		}
		return "¤"
	default:
		return ""
	}
}

func RenderQuotaReminderEmail(username string, remainingQuota int64, threshold int64, topUpURL string) (QuotaReminderRenderedEmail, error) {
	cfg, err := quotaReminderConfigFromOptions()
	if err != nil {
		return QuotaReminderRenderedEmail{}, err
	}
	if threshold > 0 {
		cfg.Threshold = int(threshold)
	}
	return renderQuotaReminderEmailWithConfig(cfg, username, remainingQuota, topUpURL)
}
func RenderQuotaReminderTestEmail() (QuotaReminderRenderedEmail, error) {
	cfg, err := quotaReminderConfigFromOptions()
	if err != nil {
		return QuotaReminderRenderedEmail{}, err
	}
	remaining := int64(cfg.Threshold - 1)
	if remaining < 0 {
		remaining = 0
	}
	return renderQuotaReminderEmailWithConfig(cfg, "管理员", remaining, PaymentReturnURL("/wallet"))
}
func QuotaReminderEnabled() bool {
	cfg, err := quotaReminderConfigFromOptions()
	return err == nil && cfg.Enabled
}

func quotaReminderConfigForUser(userSetting dto.UserSetting) (quotaReminderConfig, error) {
	cfg, err := quotaReminderConfigFromOptions()
	if err != nil {
		return quotaReminderConfig{}, err
	}
	if userSetting.QuotaWarningThreshold == 0 {
		return cfg, nil
	}
	unit, quotaPerUnit, usdRate, customRate := userSetting.QuotaWarningThresholdUnit, userSetting.QuotaWarningThresholdQuotaPerUnit, userSetting.QuotaWarningThresholdUSDRate, userSetting.QuotaWarningThresholdCustomRate
	if unit == "" && userSetting.QuotaWarningThreshold > 0 {
		// Legacy personal settings were stored without metadata; interpret them
		// using the current display semantics.
		unit = cfg.DisplayUnit
	}
	if unit == "" {
		unit = cfg.DisplayUnit
	}
	if quotaPerUnit <= 0 {
		quotaPerUnit = cfg.QuotaPerUnit
	}
	if usdRate <= 0 {
		usdRate = cfg.USDExchangeRate
	}
	if customRate <= 0 {
		customRate = cfg.CustomExchangeRate
	}
	threshold, err := common.NormalizeDisplayedQuotaThreshold(userSetting.QuotaWarningThreshold, unit, quotaPerUnit, usdRate, customRate)
	if err != nil {
		return quotaReminderConfig{}, err
	}
	cfg.Threshold = threshold
	cfg.DisplayUnit = strings.ToUpper(strings.TrimSpace(unit))
	cfg.QuotaPerUnit = quotaPerUnit
	cfg.USDExchangeRate = usdRate
	cfg.CustomExchangeRate = customRate
	if userSetting.QuotaWarningThresholdCustomSymbol != "" {
		cfg.CurrencySymbol = userSetting.QuotaWarningThresholdCustomSymbol
	}
	return cfg, nil
}

func EffectiveQuotaReminderThresholdForUser(userSetting dto.UserSetting) (int, error) {
	cfg, err := quotaReminderConfigForUser(userSetting)
	if err != nil {
		return 0, err
	}
	return cfg.Threshold, nil
}

func SendQuotaReminder(userID int, kind model.QuotaReminderBalanceKind, resourceID int64, remaining, threshold int64) error {
	_, err := sendQuotaReminder(userID, kind, resourceID, remaining, threshold, "")
	return err
}

// SendQuotaReminderWithAttempt sends only while the delivery claim is still
// active. Its token-aware state completion prevents a stale worker from
// overwriting a disabled, re-armed, or retried reminder cycle.
func SendQuotaReminderWithAttempt(userID int, kind model.QuotaReminderBalanceKind, resourceID int64, remaining, threshold int64, token string) (bool, error) {
	if !QuotaReminderEnabled() {
		return false, nil
	}
	active, err := model.IsQuotaReminderDeliveryClaimActive(userID, kind, resourceID, token)
	if err != nil {
		return false, err
	}
	if !active {
		return false, nil
	}
	return sendQuotaReminder(userID, kind, resourceID, remaining, threshold, token)
}

func sendQuotaReminder(userID int, kind model.QuotaReminderBalanceKind, resourceID int64, remaining, threshold int64, token string) (bool, error) {
	user, err := model.GetUserById(userID, false)
	if err != nil {
		return false, err
	}
	setting := user.GetSetting()
	to := setting.NotificationEmail
	if to == "" {
		to = user.Email
	}
	if to == "" {
		common.SysLog(fmt.Sprintf("quota reminder skipped for user %d: no email address", userID))
		return false, errors.New("user has no quota reminder email")
	}
	cfg, err := quotaReminderConfigForUser(setting)
	if err != nil {
		return false, err
	}
	// Delivery workers may outlive an administrator/user currency change. For
	// token-aware sends, prefer the immutable metadata captured when this
	// reminder cycle crossed the threshold. Legacy rows without a snapshot
	// continue using current settings.
	if token != "" {
		if state, stateErr := model.GetQuotaReminderState(userID, kind, resourceID); stateErr != nil {
			return false, stateErr
		} else if state != nil {
			if snapshot, ok := state.QuotaReminderSnapshot(); ok {
				cfg.DisplayUnit = snapshot.DisplayUnit
				cfg.QuotaPerUnit = snapshot.QuotaPerUnit
				cfg.USDExchangeRate = snapshot.USDExchangeRate
				cfg.CustomExchangeRate = snapshot.CustomExchangeRate
				cfg.CurrencySymbol = snapshot.CurrencySymbol
			}
			// Threshold is part of the persisted cycle state. Keep the caller's
			// value only for legacy rows where no state can be read.
			if state.Threshold > 0 {
				threshold = state.Threshold
			}
		}
	}
	if threshold > 0 {
		cfg.Threshold = int(threshold)
	}
	email, err := renderQuotaReminderEmailWithConfig(cfg, user.Username, remaining, PaymentReturnURL("/wallet"))
	if err != nil {
		return false, err
	}
	if err := common.SendEmailWithAlternative(email.Subject, to, email.HTML, email.Text); err != nil {
		return false, err
	}
	templateSnapshot, err := common.Marshal(cfg.Template)
	if err != nil {
		return false, err
	}
	if token != "" {
		return model.MarkQuotaReminderSentWithToken(userID, kind, resourceID, token, int64(cfg.Threshold), cfg.TemplateID, string(templateSnapshot))
	}
	if err := model.MarkQuotaReminderSent(userID, kind, resourceID, int64(cfg.Threshold), cfg.TemplateID, string(templateSnapshot)); err != nil {
		return false, err
	}
	return true, nil
}

type QuotaReminderTaskResult struct {
	Pending int `json:"pending"`
	Sent    int `json:"sent"`
	Failed  int `json:"failed"`
}

func RunQuotaReminderTaskOnce() (QuotaReminderTaskResult, error) {
	result := QuotaReminderTaskResult{}
	if !QuotaReminderEnabled() {
		return result, nil
	}
	states, err := model.ListPendingQuotaReminderStates(200)
	if err != nil {
		return result, err
	}
	result.Pending = len(states)
	for _, state := range states {
		remaining := state.LastBalance
		switch state.BalanceKind {
		case model.QuotaReminderBalanceWallet:
			quota, e := model.GetUserQuota(state.UserID, true)
			if e != nil {
				result.Failed++
				continue
			}
			remaining = int64(quota)
		case model.QuotaReminderBalanceSubscription:
			sub, e := model.GetUserSubscriptionByID(int(state.ResourceID))
			if e != nil {
				result.Failed++
				continue
			}
			remaining = sub.AmountTotal - sub.AmountUsed
		default:
			result.Failed++
			continue
		}
		if remaining >= state.Threshold {
			_, _ = model.TransitionQuotaReminder(state.UserID, state.BalanceKind, state.ResourceID, state.LastBalance, remaining, state.Threshold)
			continue
		}
		token, claimed, claimErr := model.ClaimQuotaReminderDeliveryWithToken(state.UserID, state.BalanceKind, state.ResourceID)
		if claimErr != nil {
			result.Failed++
			continue
		}
		if !claimed {
			continue
		}
		sent, e := SendQuotaReminderWithAttempt(state.UserID, state.BalanceKind, state.ResourceID, remaining, state.Threshold, token)
		if e != nil {
			_, _ = model.MarkQuotaReminderFailedWithToken(state.UserID, state.BalanceKind, state.ResourceID, token, e)
			result.Failed++
			continue
		}
		if sent {
			result.Sent++
		}
	}
	return result, nil
}

// SendQuotaReminderEmail renders and sends a reminder without touching
// persisted reminder state. Callers performing a state transition should use
// SendQuotaReminder, which marks the state only after successful delivery.
func SendQuotaReminderEmail(receiver, username string, remainingQuota, threshold int64, topUpURL string) error {
	receiver = strings.TrimSpace(receiver)
	if !common.IsValidEmail(receiver) {
		return errors.New("invalid quota reminder recipient email")
	}
	email, err := RenderQuotaReminderEmail(username, remainingQuota, threshold, topUpURL)
	if err != nil {
		return err
	}
	return common.SendEmailWithAlternative(email.Subject, receiver, email.HTML, email.Text)
}
