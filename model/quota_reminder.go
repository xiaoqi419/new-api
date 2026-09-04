package model

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

type QuotaReminderBalanceKind string

const (
	QuotaReminderBalanceWallet       QuotaReminderBalanceKind = "wallet"
	QuotaReminderBalanceSubscription QuotaReminderBalanceKind = "subscription"
)

// QuotaReminderSnapshot captures the display semantics used when a low-balance
// cycle is opened.  Keeping this data with the reminder state prevents a
// pending/retried delivery from being reinterpreted after an administrator
// changes the site's currency or exchange rates.
type QuotaReminderSnapshot struct {
	DisplayUnit        string
	QuotaPerUnit       float64
	USDExchangeRate    float64
	CustomExchangeRate float64
	CurrencySymbol     string
}

type QuotaReminderState struct {
	ID            int64                    `json:"id" gorm:"primaryKey"`
	UserID        int                      `json:"user_id" gorm:"uniqueIndex:idx_quota_reminder_state"`
	BalanceKind   QuotaReminderBalanceKind `json:"balance_kind" gorm:"type:varchar(32);uniqueIndex:idx_quota_reminder_state"`
	ResourceID    int64                    `json:"resource_id" gorm:"uniqueIndex:idx_quota_reminder_state"`
	Armed         bool                     `json:"armed"`
	Status        string                   `json:"status" gorm:"type:varchar(32);index"`
	LastBalance   int64                    `json:"last_balance"`
	Threshold     int64                    `json:"threshold"`
	ReminderCount int                      `json:"reminder_count"`
	LastAttemptAt int64                    `json:"last_attempt_at"`
	LastSentAt    int64                    `json:"last_sent_at"`
	LastError     string                   `json:"last_error" gorm:"type:text"`
	DeliveryToken string                   `json:"-" gorm:"type:varchar(64)"`
	TemplateID    string                   `json:"template_id" gorm:"type:varchar(32)"`
	Template      string                   `json:"template" gorm:"type:text"`
	SentThreshold int64                    `json:"sent_threshold"`
	// ThresholdDisplayUnit and the conversion values are immutable for an
	// active low-balance cycle. They are captured on the crossing observation
	// and retained through retries/sending so rendering remains deterministic.
	ThresholdDisplayUnit        string  `json:"threshold_display_unit" gorm:"type:varchar(16)"`
	ThresholdQuotaPerUnit       float64 `json:"threshold_quota_per_unit"`
	ThresholdUSDExchangeRate    float64 `json:"threshold_usd_exchange_rate"`
	ThresholdCustomExchangeRate float64 `json:"threshold_custom_exchange_rate"`
	ThresholdCurrencySymbol     string  `json:"threshold_currency_symbol" gorm:"type:varchar(32)"`
	CreatedAt                   int64   `json:"created_at"`
	UpdatedAt                   int64   `json:"updated_at"`
}

func (s QuotaReminderSnapshot) valid() bool {
	return strings.TrimSpace(s.DisplayUnit) != "" &&
		s.QuotaPerUnit > 0 && !math.IsNaN(s.QuotaPerUnit) && !math.IsInf(s.QuotaPerUnit, 0) &&
		s.USDExchangeRate > 0 && !math.IsNaN(s.USDExchangeRate) && !math.IsInf(s.USDExchangeRate, 0) &&
		s.CustomExchangeRate > 0 && !math.IsNaN(s.CustomExchangeRate) && !math.IsInf(s.CustomExchangeRate, 0)
}

func snapshotFromState(state *QuotaReminderState) QuotaReminderSnapshot {
	return QuotaReminderSnapshot{
		DisplayUnit:        state.ThresholdDisplayUnit,
		QuotaPerUnit:       state.ThresholdQuotaPerUnit,
		USDExchangeRate:    state.ThresholdUSDExchangeRate,
		CustomExchangeRate: state.ThresholdCustomExchangeRate,
		CurrencySymbol:     state.ThresholdCurrencySymbol,
	}
}

func applySnapshotToState(state *QuotaReminderState, snapshot QuotaReminderSnapshot) {
	if !snapshot.valid() {
		return
	}
	state.ThresholdDisplayUnit = strings.ToUpper(strings.TrimSpace(snapshot.DisplayUnit))
	state.ThresholdQuotaPerUnit = snapshot.QuotaPerUnit
	state.ThresholdUSDExchangeRate = snapshot.USDExchangeRate
	state.ThresholdCustomExchangeRate = snapshot.CustomExchangeRate
	state.ThresholdCurrencySymbol = snapshot.CurrencySymbol
}

func clearSnapshotFromState(state *QuotaReminderState) {
	state.ThresholdDisplayUnit = ""
	state.ThresholdQuotaPerUnit = 0
	state.ThresholdUSDExchangeRate = 0
	state.ThresholdCustomExchangeRate = 0
	state.ThresholdCurrencySymbol = ""
}

// QuotaReminderSnapshot returns the captured display semantics, or false for
// legacy rows created before snapshot columns existed.
func (s *QuotaReminderState) QuotaReminderSnapshot() (QuotaReminderSnapshot, bool) {
	if s == nil {
		return QuotaReminderSnapshot{}, false
	}
	snapshot := snapshotFromState(s)
	return snapshot, snapshot.valid()
}

const (
	QuotaReminderStatusArmed      = "armed"
	QuotaReminderStatusLowPending = "low_pending"
	QuotaReminderStatusSending    = "sending"
	QuotaReminderStatusSent       = "sent"
	QuotaReminderStatusSuppressed = "suppressed"
)

func (s *QuotaReminderState) BeforeCreate(_ *gorm.DB) error {
	now := common.GetTimestamp()
	if s.CreatedAt == 0 {
		s.CreatedAt = now
	}
	if s.UpdatedAt == 0 {
		s.UpdatedAt = now
	}
	return nil
}

// TransitionQuotaReminder atomically applies one authoritative balance
// observation. It returns true only when this observation crosses from at or
// above the threshold to below it while the state is armed.
func TransitionQuotaReminder(userID int, kind QuotaReminderBalanceKind, resourceID int64, previousBalance, currentBalance, threshold int64) (bool, error) {
	return TransitionQuotaReminderWithSnapshot(userID, kind, resourceID, previousBalance, currentBalance, threshold, QuotaReminderSnapshot{})
}

// TransitionQuotaReminderWithSnapshot is the snapshot-aware variant of
// TransitionQuotaReminder. The supplied display metadata is captured only
// when an observation opens a new low-balance cycle. Once low_pending or
// sending, subsequent observations cannot overwrite it; recovery clears the
// snapshot so the next crossing can capture fresh semantics.
func TransitionQuotaReminderWithSnapshot(userID int, kind QuotaReminderBalanceKind, resourceID int64, previousBalance, currentBalance, threshold int64, snapshot QuotaReminderSnapshot) (bool, error) {
	if userID <= 0 || threshold <= 0 {
		return false, errors.New("invalid quota reminder transition")
	}
	if kind != QuotaReminderBalanceWallet && kind != QuotaReminderBalanceSubscription {
		return false, errors.New("invalid quota reminder balance kind")
	}
	triggered := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var state QuotaReminderState
		err := lockForUpdate(tx).
			Where("user_id = ? AND balance_kind = ? AND resource_id = ?", userID, kind, resourceID).
			First(&state).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state = QuotaReminderState{
				UserID: userID, BalanceKind: kind, ResourceID: resourceID,
				Armed: currentBalance >= threshold, Status: QuotaReminderStatusArmed,
				LastBalance: previousBalance, Threshold: threshold,
			}
			if previousBalance >= threshold && currentBalance < threshold {
				state.Armed = false
				state.Status = QuotaReminderStatusLowPending
				applySnapshotToState(&state, snapshot)
				triggered = true
			}
			state.LastBalance = currentBalance
			return tx.Create(&state).Error
		}
		if err != nil {
			return err
		}
		previousObserved := state.LastBalance
		if state.LastBalance != currentBalance && previousBalance != currentBalance {
			previousObserved = previousBalance
		}
		// Keep the threshold and display snapshot stable while a cycle is
		// pending or being delivered. A changed administrator/user setting
		// applies after recovery and the next crossing, not to this reminder.
		cycleActive := state.Status == QuotaReminderStatusLowPending || state.Status == QuotaReminderStatusSending
		if !cycleActive {
			state.Threshold = threshold
		}
		state.LastBalance = currentBalance
		if currentBalance >= threshold {
			state.Threshold = threshold
			state.Armed = true
			state.Status = QuotaReminderStatusArmed
			state.DeliveryToken = ""
			state.LastError = ""
			clearSnapshotFromState(&state)
			return tx.Save(&state).Error
		}
		if state.Armed && previousObserved >= threshold {
			state.Armed = false
			state.Status = QuotaReminderStatusLowPending
			state.DeliveryToken = ""
			applySnapshotToState(&state, snapshot)
			triggered = true
		}
		return tx.Save(&state).Error
	})
	return triggered, err
}

func GetQuotaReminderState(userID int, kind QuotaReminderBalanceKind, resourceID int64) (*QuotaReminderState, error) {
	var state QuotaReminderState
	err := DB.Where("user_id = ? AND balance_kind = ? AND resource_id = ?", userID, kind, resourceID).First(&state).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &state, nil
}

func ListPendingQuotaReminderStates(limit int) ([]QuotaReminderState, error) {
	if limit <= 0 {
		limit = 200
	}
	var states []QuotaReminderState
	staleAttempt := common.GetTimestamp() - 10*60
	err := DB.Where("status = ? OR (status = ? AND last_attempt_at < ?)", QuotaReminderStatusLowPending, QuotaReminderStatusSending, staleAttempt).
		Order("updated_at asc").Limit(limit).Find(&states).Error
	return states, err
}

func ClaimQuotaReminderDeliveryWithToken(userID int, kind QuotaReminderBalanceKind, resourceID int64) (string, bool, error) {
	now := common.GetTimestamp()
	staleAttempt := now - 10*60
	token := common.GetUUID()
	result := DB.Model(&QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ?", userID, kind, resourceID).
		Where("status = ? OR (status = ? AND last_attempt_at < ?)", QuotaReminderStatusLowPending, QuotaReminderStatusSending, staleAttempt).
		Updates(map[string]interface{}{
			"status": QuotaReminderStatusSending, "delivery_token": token,
			"last_attempt_at": now, "updated_at": now,
		})
	if result.Error != nil || result.RowsAffected != 1 {
		return "", false, result.Error
	}
	return token, true, nil
}

// ClaimQuotaReminderDelivery is retained while callers migrate to the token
// aware API. New delivery code must keep the token and use conditional finish
// methods so an expired worker cannot complete another delivery cycle.
func ClaimQuotaReminderDelivery(userID int, kind QuotaReminderBalanceKind, resourceID int64) (bool, error) {
	_, claimed, err := ClaimQuotaReminderDeliveryWithToken(userID, kind, resourceID)
	return claimed, err
}

func IsQuotaReminderDeliveryClaimActive(userID int, kind QuotaReminderBalanceKind, resourceID int64, token string) (bool, error) {
	if strings.TrimSpace(token) == "" {
		return false, errors.New("quota reminder delivery token is empty")
	}
	var count int64
	err := DB.Model(&QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ? AND status = ? AND delivery_token = ?", userID, kind, resourceID, QuotaReminderStatusSending, token).
		Count(&count).Error
	return count == 1, err
}

// ObserveQuotaReminderBalance updates an existing reminder state after any
// wallet/subscription mutation. It deliberately does not send mail.
func ObserveQuotaReminderBalance(userID int, kind QuotaReminderBalanceKind, resourceID, current int64) {
	if !common.QuotaRemindEnabled {
		err := DB.Transaction(func(tx *gorm.DB) error {
			var state QuotaReminderState
			err := lockForUpdate(tx).
				Where("user_id = ? AND balance_kind = ? AND resource_id = ?", userID, kind, resourceID).
				First(&state).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			if err != nil {
				return err
			}
			state.LastBalance = current
			state.Armed = current >= state.Threshold
			state.DeliveryToken = ""
			clearSnapshotFromState(&state)
			if state.Armed {
				state.Status = QuotaReminderStatusArmed
			} else {
				state.Status = QuotaReminderStatusSuppressed
			}
			state.LastError = ""
			state.UpdatedAt = common.GetTimestamp()
			return tx.Save(&state).Error
		})
		if err != nil {
			common.SysLog(fmt.Sprintf("failed to suppress quota reminder state for user %d: %v", userID, err))
		}
		return
	}
	state, err := GetQuotaReminderState(userID, kind, resourceID)
	if err != nil || state == nil || state.Threshold <= 0 {
		return
	}
	if _, err := TransitionQuotaReminder(userID, kind, resourceID, state.LastBalance, current, state.Threshold); err != nil {
		common.SysLog(fmt.Sprintf("failed to update quota reminder state for user %d: %v", userID, err))
	}
}

// ObserveQuotaReminderBalanceWithPrevious records a wallet mutation when the
// caller still has the authoritative pre-mutation balance.  This is required
// for first-time observations: without the previous value, a high-to-low
// administrative adjustment cannot be recognized as a threshold crossing
// when no reminder state row exists yet.
func ObserveQuotaReminderBalanceWithPrevious(userID int, kind QuotaReminderBalanceKind, resourceID, previous, current int64) {
	if !common.QuotaRemindEnabled {
		ObserveQuotaReminderBalance(userID, kind, resourceID, current)
		return
	}
	// New reminder options persist a display-unit value together with the exact
	// rates that were active when it was saved. Normalize that snapshot here;
	// QuotaRemindThreshold is only a compatibility fallback for installations
	// that do not yet have the new option keys.
	threshold := int64(common.QuotaRemindThreshold)
	snapshot := QuotaReminderSnapshot{
		DisplayUnit:        operation_setting.GetQuotaDisplayType(),
		QuotaPerUnit:       common.QuotaPerUnit,
		USDExchangeRate:    operation_setting.USDExchangeRate,
		CustomExchangeRate: operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate,
		CurrencySymbol:     operation_setting.GetGeneralSetting().CustomCurrencySymbol,
	}
	common.OptionMapRWMutex.RLock()
	globalThresholdText := strings.TrimSpace(common.OptionMap["quota_reminder.threshold"])
	globalUnit := strings.TrimSpace(common.OptionMap["quota_reminder.threshold_unit"])
	globalQuotaPerUnitText := strings.TrimSpace(common.OptionMap["quota_reminder.threshold_quota_per_unit"])
	globalUSDRateText := strings.TrimSpace(common.OptionMap["quota_reminder.threshold_usd_exchange_rate"])
	globalCustomRateText := strings.TrimSpace(common.OptionMap["quota_reminder.threshold_custom_exchange_rate"])
	globalCustomSymbol := common.OptionMap["quota_reminder.threshold_custom_currency_symbol"]
	common.OptionMapRWMutex.RUnlock()

	if globalUnit != "" {
		snapshot.DisplayUnit = globalUnit
	}
	if value, err := strconv.ParseFloat(globalQuotaPerUnitText, 64); err == nil && value > 0 && !math.IsNaN(value) && !math.IsInf(value, 0) {
		snapshot.QuotaPerUnit = value
	}
	if value, err := strconv.ParseFloat(globalUSDRateText, 64); err == nil && value > 0 && !math.IsNaN(value) && !math.IsInf(value, 0) {
		snapshot.USDExchangeRate = value
	}
	if value, err := strconv.ParseFloat(globalCustomRateText, 64); err == nil && value > 0 && !math.IsNaN(value) && !math.IsInf(value, 0) {
		snapshot.CustomExchangeRate = value
	}
	if globalCustomSymbol != "" {
		snapshot.CurrencySymbol = globalCustomSymbol
	}
	if displayedThreshold, err := strconv.ParseFloat(globalThresholdText, 64); err == nil {
		if normalized, normalizeErr := common.NormalizeDisplayedQuotaThreshold(
			displayedThreshold,
			snapshot.DisplayUnit,
			snapshot.QuotaPerUnit,
			snapshot.USDExchangeRate,
			snapshot.CustomExchangeRate,
		); normalizeErr == nil {
			threshold = int64(normalized)
		}
	}
	if user, err := GetUserById(userID, true); err == nil && user != nil {
		setting := user.GetSetting()
		if setting.QuotaWarningThreshold > 0 {
			unit := setting.QuotaWarningThresholdUnit
			quotaPerUnit := setting.QuotaWarningThresholdQuotaPerUnit
			usdRate := setting.QuotaWarningThresholdUSDRate
			customRate := setting.QuotaWarningThresholdCustomRate
			if unit == "" {
				unit = snapshot.DisplayUnit
			}
			if quotaPerUnit <= 0 {
				quotaPerUnit = snapshot.QuotaPerUnit
			}
			if usdRate <= 0 {
				usdRate = snapshot.USDExchangeRate
			}
			if customRate <= 0 {
				customRate = snapshot.CustomExchangeRate
			}
			if normalized, normalizeErr := common.NormalizeDisplayedQuotaThreshold(setting.QuotaWarningThreshold, unit, quotaPerUnit, usdRate, customRate); normalizeErr == nil {
				threshold = int64(normalized)
			}
			currencySymbol := snapshot.CurrencySymbol
			if setting.QuotaWarningThresholdCustomSymbol != "" {
				currencySymbol = setting.QuotaWarningThresholdCustomSymbol
			}
			snapshot = QuotaReminderSnapshot{
				DisplayUnit:        unit,
				QuotaPerUnit:       quotaPerUnit,
				USDExchangeRate:    usdRate,
				CustomExchangeRate: customRate,
				CurrencySymbol:     currencySymbol,
			}
		}
	}
	if state, err := GetQuotaReminderState(userID, kind, resourceID); err == nil && state != nil && state.Threshold > 0 {
		threshold = state.Threshold
	}
	if threshold <= 0 {
		return
	}
	if _, err := TransitionQuotaReminderWithSnapshot(userID, kind, resourceID, previous, current, threshold, snapshot); err != nil {
		common.SysLog(fmt.Sprintf("failed to update quota reminder state for user %d: %v", userID, err))
	}
}

func suppressPendingQuotaReminders(tx *gorm.DB) error {
	now := common.GetTimestamp()
	return tx.Model(&QuotaReminderState{}).
		Where("status = ? OR status = ?", QuotaReminderStatusLowPending, QuotaReminderStatusSending).
		Updates(map[string]interface{}{
			"armed": false, "status": QuotaReminderStatusSuppressed,
			"delivery_token": "", "last_error": "", "updated_at": now,
			"threshold_display_unit": "", "threshold_quota_per_unit": 0,
			"threshold_usd_exchange_rate": 0, "threshold_custom_exchange_rate": 0,
			"threshold_currency_symbol": "",
		}).Error
}

func MarkQuotaReminderSent(userID int, kind QuotaReminderBalanceKind, resourceID int64, threshold int64, templateID string, template string) error {
	return DB.Model(&QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ? AND status = ?", userID, kind, resourceID, QuotaReminderStatusSending).
		Updates(map[string]interface{}{
			"status": QuotaReminderStatusSent, "last_sent_at": common.GetTimestamp(),
			"last_attempt_at": common.GetTimestamp(), "last_error": "",
			"delivery_token": "",
			"template_id":    templateID, "template": template,
			"sent_threshold": threshold,
			"reminder_count": gorm.Expr("reminder_count + ?", 1),
			"updated_at":     common.GetTimestamp(),
		}).Error
}

func MarkQuotaReminderSentWithToken(userID int, kind QuotaReminderBalanceKind, resourceID int64, token string, threshold int64, templateID string, template string) (bool, error) {
	if strings.TrimSpace(token) == "" {
		return false, errors.New("quota reminder delivery token is empty")
	}
	result := DB.Model(&QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ? AND status = ? AND delivery_token = ?", userID, kind, resourceID, QuotaReminderStatusSending, token).
		Updates(map[string]interface{}{
			"status": QuotaReminderStatusSent, "last_sent_at": common.GetTimestamp(),
			"last_attempt_at": common.GetTimestamp(), "last_error": "", "delivery_token": "",
			"template_id": templateID, "template": template,
			"sent_threshold": threshold,
			"reminder_count": gorm.Expr("reminder_count + ?", 1),
			"updated_at":     common.GetTimestamp(),
		})
	return result.RowsAffected == 1, result.Error
}

func MarkQuotaReminderFailed(userID int, kind QuotaReminderBalanceKind, resourceID int64, err error) error {
	message := "reminder delivery failed"
	if err != nil {
		message = err.Error()
	}
	return DB.Model(&QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ? AND status = ?", userID, kind, resourceID, QuotaReminderStatusSending).
		Updates(map[string]interface{}{
			"status": QuotaReminderStatusLowPending, "last_attempt_at": common.GetTimestamp(),
			"delivery_token": "", "last_error": message, "updated_at": common.GetTimestamp(),
		}).Error
}

func MarkQuotaReminderFailedWithToken(userID int, kind QuotaReminderBalanceKind, resourceID int64, token string, err error) (bool, error) {
	if strings.TrimSpace(token) == "" {
		return false, errors.New("quota reminder delivery token is empty")
	}
	message := "reminder delivery failed"
	if err != nil {
		message = err.Error()
	}
	result := DB.Model(&QuotaReminderState{}).
		Where("user_id = ? AND balance_kind = ? AND resource_id = ? AND status = ? AND delivery_token = ?", userID, kind, resourceID, QuotaReminderStatusSending, token).
		Updates(map[string]interface{}{
			"status": QuotaReminderStatusLowPending, "last_attempt_at": common.GetTimestamp(),
			"delivery_token": "", "last_error": message, "updated_at": common.GetTimestamp(),
		})
	return result.RowsAffected == 1, result.Error
}
