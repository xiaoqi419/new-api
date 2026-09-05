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

const quotaReminderCompensationPageSize = 200

// seedQuotaReminderBaselines records the balances observed at the moment a
// previously disabled reminder feature is enabled.  Low balances are marked
// suppressed so the first compensation pass cannot turn an old condition into
// a retroactive notification; later authoritative crossings are still handled
// by TransitionQuotaReminderWithSnapshot.
func seedQuotaReminderBaselinesWithResult() (failed int, err error) {
	var userCursor int
	for {
		users, pageErr := model.ListEnabledUsersForQuotaReminder(userCursor, quotaReminderCompensationPageSize)
		if pageErr != nil {
			return failed, pageErr
		}
		for i := range users {
			user := &users[i]
			cfg, cfgErr := quotaReminderConfigForUser(user.GetSetting())
			if cfgErr != nil {
				failed++
				common.SysLog(fmt.Sprintf("failed to baseline wallet reminder for user %d: %v", user.Id, cfgErr))
				continue
			}
			if baselineErr := model.SeedQuotaReminderBaseline(user.Id, model.QuotaReminderBalanceWallet, 0, int64(user.Quota), int64(cfg.Threshold)); baselineErr != nil {
				failed++
				common.SysLog(fmt.Sprintf("failed to baseline wallet reminder for user %d: %v", user.Id, baselineErr))
			}
		}
		if len(users) < quotaReminderCompensationPageSize {
			break
		}
		userCursor = users[len(users)-1].Id
	}

	var subscriptionCursor int
	for {
		subscriptions, pageErr := model.ListActiveUserSubscriptionsForQuotaReminder(subscriptionCursor, quotaReminderCompensationPageSize)
		if pageErr != nil {
			return failed, pageErr
		}
		for i := range subscriptions {
			subscription := &subscriptions[i]
			user, userErr := model.GetUserById(subscription.UserId, true)
			if userErr != nil {
				failed++
				common.SysLog(fmt.Sprintf("failed to baseline subscription reminder user %d: %v", subscription.UserId, userErr))
				continue
			}
			if user == nil || user.Status != common.UserStatusEnabled {
				failed++
				common.SysLog(fmt.Sprintf("failed to baseline subscription reminder user %d: user is disabled or missing", subscription.UserId))
				continue
			}
			cfg, cfgErr := quotaReminderConfigForUser(user.GetSetting())
			if cfgErr != nil {
				failed++
				common.SysLog(fmt.Sprintf("failed to baseline subscription reminder for user %d subscription %d: %v", user.Id, subscription.Id, cfgErr))
				continue
			}
			current, eligible := quotaReminderSubscriptionRemaining(subscription.AmountTotal, subscription.AmountUsed)
			if !eligible {
				if state, stateErr := model.GetQuotaReminderState(user.Id, model.QuotaReminderBalanceSubscription, int64(subscription.Id)); stateErr != nil {
					failed++
					common.SysLog(fmt.Sprintf("failed to inspect unlimited subscription reminder for user %d subscription %d: %v", user.Id, subscription.Id, stateErr))
				} else if state != nil && (state.Status == model.QuotaReminderStatusLowPending || state.Status == model.QuotaReminderStatusSending) {
					if suppressErr := suppressQuotaReminderState(state.ID); suppressErr != nil {
						failed++
						common.SysLog(fmt.Sprintf("failed to suppress unlimited subscription reminder state %d: %v", state.ID, suppressErr))
					}
				}
				continue
			}
			if baselineErr := model.SeedQuotaReminderBaseline(user.Id, model.QuotaReminderBalanceSubscription, int64(subscription.Id), current, int64(cfg.Threshold)); baselineErr != nil {
				failed++
				common.SysLog(fmt.Sprintf("failed to baseline subscription reminder for user %d subscription %d: %v", user.Id, subscription.Id, baselineErr))
			}
		}
		if len(subscriptions) < quotaReminderCompensationPageSize {
			break
		}
		subscriptionCursor = subscriptions[len(subscriptions)-1].Id
	}
	return failed, nil
}

// compensateQuotaReminderBalances repairs gaps left by mutation observers.
// Observers normally provide the authoritative previous balance, but an
// adjustment can bypass that hook entirely.  The periodic pass therefore
// walks every enabled user and active subscription with keyset pagination and
// seeds a missing state only when the current balance is already below its
// effective threshold.  Existing states retain their own last balance and
// immutable cycle snapshot through ObserveQuotaReminderBalanceWithPrevious.
func compensateQuotaReminderBalancesWithResult() (failed int, err error) {
	var userCursor int
	for {
		users, pageErr := model.ListEnabledUsersForQuotaReminder(userCursor, quotaReminderCompensationPageSize)
		if pageErr != nil {
			return failed, pageErr
		}
		for i := range users {
			user := &users[i]
			current := int64(user.Quota)
			if recordErr := compensateQuotaReminderRecord(user.Id, model.QuotaReminderBalanceWallet, 0, user.GetSetting(), current); recordErr != nil {
				failed++
				common.SysLog(fmt.Sprintf("failed to compensate wallet reminder for user %d: %v", user.Id, recordErr))
				continue
			}
		}
		if len(users) < quotaReminderCompensationPageSize {
			break
		}
		userCursor = users[len(users)-1].Id
	}

	var subscriptionCursor int
	for {
		subscriptions, pageErr := model.ListActiveUserSubscriptionsForQuotaReminder(subscriptionCursor, quotaReminderCompensationPageSize)
		if pageErr != nil {
			return failed, pageErr
		}
		for i := range subscriptions {
			subscription := &subscriptions[i]
			user, userErr := model.GetUserById(subscription.UserId, true)
			if userErr != nil {
				failed++
				common.SysLog(fmt.Sprintf("failed to load subscription reminder user %d: %v", subscription.UserId, userErr))
				continue
			}
			if user == nil || user.Status != common.UserStatusEnabled {
				failed++
				common.SysLog(fmt.Sprintf("failed to load subscription reminder user %d: user is disabled or missing", subscription.UserId))
				continue
			}
			current, eligible := quotaReminderSubscriptionRemaining(subscription.AmountTotal, subscription.AmountUsed)
			if !eligible {
				if state, stateErr := model.GetQuotaReminderState(user.Id, model.QuotaReminderBalanceSubscription, int64(subscription.Id)); stateErr != nil {
					failed++
					common.SysLog(fmt.Sprintf("failed to inspect unlimited subscription reminder for user %d subscription %d: %v", user.Id, subscription.Id, stateErr))
				} else if state != nil && (state.Status == model.QuotaReminderStatusLowPending || state.Status == model.QuotaReminderStatusSending) {
					if suppressErr := suppressQuotaReminderState(state.ID); suppressErr != nil {
						failed++
						common.SysLog(fmt.Sprintf("failed to suppress unlimited subscription reminder state %d: %v", state.ID, suppressErr))
					}
				}
				continue
			}
			if recordErr := compensateQuotaReminderRecord(user.Id, model.QuotaReminderBalanceSubscription, int64(subscription.Id), user.GetSetting(), current); recordErr != nil {
				failed++
				common.SysLog(fmt.Sprintf("failed to compensate subscription reminder for user %d subscription %d: %v", user.Id, subscription.Id, recordErr))
				continue
			}
		}
		if len(subscriptions) < quotaReminderCompensationPageSize {
			break
		}
		subscriptionCursor = subscriptions[len(subscriptions)-1].Id
	}
	return failed, nil
}

// compensateQuotaReminderBalances retains the small error-only helper used by
// tests and callers that do not need per-record accounting.
func compensateQuotaReminderBalances() error {
	_, err := compensateQuotaReminderBalancesWithResult()
	return err
}

func compensateQuotaReminderRecord(userID int, kind model.QuotaReminderBalanceKind, resourceID int64, setting dto.UserSetting, current int64) error {
	cfg, err := quotaReminderConfigForUser(setting)
	if err != nil {
		return err
	}
	threshold := int64(cfg.Threshold)
	state, err := model.GetQuotaReminderState(userID, kind, resourceID)
	if err != nil {
		return err
	}
	if state == nil && current >= threshold {
		return nil
	}
	previous := current
	if state == nil {
		// A missing row is the signature of an observer gap. Treat the
		// threshold as the last known high balance so a low current value opens
		// one retryable cycle; subsequent scans deduplicate on state fields.
		previous = threshold
	} else {
		previous = state.LastBalance
	}
	_, err = model.TransitionQuotaReminderWithSnapshot(
		userID, kind, resourceID, previous, current, threshold, quotaReminderSnapshotFromConfig(cfg),
	)
	return err
}

// A zero subscription total is the established representation of an
// unlimited plan (see PreConsumeUserSubscription). It is not a finite balance
// and therefore must never open a low-balance reminder cycle. Negative usage is
// malformed persisted data; treating it as ineligible avoids an overflowing
// subtraction from reaching the reminder state machine.
func quotaReminderSubscriptionRemaining(total, used int64) (int64, bool) {
	if total <= 0 || used < 0 {
		return 0, false
	}
	return total - used, true
}

func listPendingQuotaReminderStatesPage(afterID int64, limit int) ([]model.QuotaReminderState, error) {
	if limit <= 0 {
		limit = quotaReminderCompensationPageSize
	}
	staleAttempt := common.GetTimestamp() - 10*60
	var states []model.QuotaReminderState
	err := model.DB.Where("id > ? AND (status = ? OR (status = ? AND last_attempt_at < ?))", afterID,
		model.QuotaReminderStatusLowPending, model.QuotaReminderStatusSending, staleAttempt).
		Order("id asc").Limit(limit).Find(&states).Error
	return states, err
}

func suppressQuotaReminderState(stateID int64) error {
	return model.DB.Model(&model.QuotaReminderState{}).Where("id = ?", stateID).Updates(map[string]interface{}{
		"armed": false, "status": model.QuotaReminderStatusSuppressed, "delivery_token": "",
		"last_error": "", "threshold_display_unit": "", "threshold_quota_per_unit": 0,
		"threshold_usd_exchange_rate": 0, "threshold_custom_exchange_rate": 0,
		"threshold_currency_symbol": "", "updated_at": common.GetTimestamp(),
	}).Error
}

// suppressPendingQuotaReminderStates disables delivery for every in-flight
// cycle when the feature is turned off. Option updates normally perform this
// transition synchronously, but the task can also observe a disabled runtime
// flag after a restart or an out-of-band configuration change. Clearing the
// delivery token and cycle snapshot makes re-enabling start from a fresh
// high-to-low crossing instead of replaying historical low balances.
func suppressPendingQuotaReminderStates() error {
	now := common.GetTimestamp()
	return model.DB.Model(&model.QuotaReminderState{}).
		Where("status = ? OR status = ?", model.QuotaReminderStatusLowPending, model.QuotaReminderStatusSending).
		Updates(map[string]interface{}{
			"armed": false, "status": model.QuotaReminderStatusSuppressed,
			"delivery_token": "", "last_error": "", "updated_at": now,
			"threshold_display_unit": "", "threshold_quota_per_unit": 0,
			"threshold_usd_exchange_rate": 0, "threshold_custom_exchange_rate": 0,
			"threshold_currency_symbol": "",
		}).Error
}

func RunQuotaReminderTaskOnce() (QuotaReminderTaskResult, error) {
	result := QuotaReminderTaskResult{}
	if !QuotaReminderEnabled() {
		if err := suppressPendingQuotaReminderStates(); err != nil {
			return result, err
		}
		return result, nil
	}
	if model.IsQuotaReminderBaselinePending() {
		baselineToken, tokenErr := model.QuotaReminderActivationToken()
		if tokenErr != nil {
			result.Failed++
			return result, tokenErr
		}
		baselineFailed, baselineErr := seedQuotaReminderBaselinesWithResult()
		result.Failed += baselineFailed
		if baselineErr != nil {
			return result, baselineErr
		}
		// Keep the durable marker set when any record could not be baselined.
		// Clearing it here would let the next pass interpret that record's
		// already-low balance as a new crossing and send a retroactive message.
		// Retrying the complete baseline on the next system-task interval is
		// preferable to silently losing that boundary.
		if baselineFailed > 0 {
			return result, nil
		}
		completed, completeErr := model.CompleteQuotaReminderBaseline(baselineToken)
		if completeErr != nil {
			result.Failed++
			return result, completeErr
		}
		// Another instance may have completed the marker while this pass was
		// running. If it is still pending, stop before compensation so a
		// partially baselined dataset cannot generate a retroactive reminder.
		if !completed && model.IsQuotaReminderBaselinePending() {
			return result, nil
		}
	}
	compensationFailed, err := compensateQuotaReminderBalancesWithResult()
	result.Failed += compensationFailed
	if err != nil {
		return result, err
	}
	var states []model.QuotaReminderState
	var stateCursor int64
	for {
		page, err := listPendingQuotaReminderStatesPage(stateCursor, quotaReminderCompensationPageSize)
		if err != nil {
			return result, err
		}
		states = append(states, page...)
		if len(page) < quotaReminderCompensationPageSize {
			break
		}
		stateCursor = page[len(page)-1].ID
	}
	result.Pending = len(states)
	for _, state := range states {
		remaining := state.LastBalance
		switch state.BalanceKind {
		case model.QuotaReminderBalanceWallet:
			user, userErr := model.GetUserById(state.UserID, true)
			if userErr != nil {
				result.Failed++
				common.SysLog(fmt.Sprintf("failed to load quota reminder user %d: %v", state.UserID, userErr))
				continue
			}
			if user == nil || user.Status != common.UserStatusEnabled {
				if suppressErr := suppressQuotaReminderState(state.ID); suppressErr != nil {
					result.Failed++
					common.SysLog(fmt.Sprintf("failed to suppress quota reminder state %d: %v", state.ID, suppressErr))
				}
				continue
			}
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
			if sub.Status != "active" || sub.EndTime <= common.GetTimestamp() {
				if suppressErr := suppressQuotaReminderState(state.ID); suppressErr != nil {
					result.Failed++
				}
				continue
			}
			user, userErr := model.GetUserById(sub.UserId, true)
			if userErr != nil {
				result.Failed++
				common.SysLog(fmt.Sprintf("failed to load quota reminder user %d: %v", sub.UserId, userErr))
				continue
			}
			if user == nil || user.Status != common.UserStatusEnabled || sub.UserId != state.UserID {
				if suppressErr := suppressQuotaReminderState(state.ID); suppressErr != nil {
					result.Failed++
					common.SysLog(fmt.Sprintf("failed to suppress quota reminder state %d: %v", state.ID, suppressErr))
				}
				continue
			}
			var eligible bool
			remaining, eligible = quotaReminderSubscriptionRemaining(sub.AmountTotal, sub.AmountUsed)
			if !eligible {
				if suppressErr := suppressQuotaReminderState(state.ID); suppressErr != nil {
					result.Failed++
					common.SysLog(fmt.Sprintf("failed to suppress unlimited subscription reminder state %d: %v", state.ID, suppressErr))
				}
				continue
			}
		default:
			result.Failed++
			continue
		}
		if remaining >= state.Threshold {
			if _, transitionErr := model.TransitionQuotaReminder(state.UserID, state.BalanceKind, state.ResourceID, state.LastBalance, remaining, state.Threshold); transitionErr != nil {
				result.Failed++
				common.SysLog(fmt.Sprintf("failed to re-arm quota reminder state %d: %v", state.ID, transitionErr))
			}
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
			if _, markErr := model.MarkQuotaReminderFailedWithToken(state.UserID, state.BalanceKind, state.ResourceID, token, e); markErr != nil {
				common.SysLog(fmt.Sprintf("failed to record quota reminder delivery failure for state %d: %v", state.ID, markErr))
			}
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
