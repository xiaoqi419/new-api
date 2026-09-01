package service

import (
	"errors"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// Payment gateway mode changes are deliberately a process-local operation.
// The persisted desired mode is the only cross-process state; no deployment
// target, command, or signal is accepted from callers.
const (
	PaymentGatewayModeApplyStateIdle     = "idle"
	PaymentGatewayModeApplyStateApplying = "applying"
	PaymentGatewayModeApplyStateFailed   = "failed"

	PaymentGatewayModeApplyOutcomeAccepted       = "accepted"
	PaymentGatewayModeApplyOutcomeAlreadyApplied = "already_applied"
	PaymentGatewayModeApplyOutcomeConflict       = "conflict"
	PaymentGatewayModeApplyOutcomeRejected       = "rejected"

	PaymentGatewayModeApplyReasonSelfRestartDisabled = "self_restart_disabled"
	PaymentGatewayModeApplyReasonShutdownUnavailable = "graceful_shutdown_unavailable"
	PaymentGatewayModeApplyReasonInstanceCheckFailed = "instance_check_failed"
	PaymentGatewayModeApplyReasonStaleInstance       = "stale_instance_present"
	PaymentGatewayModeApplyReasonInstanceCount       = "instance_count_not_one"
	PaymentGatewayModeApplyReasonOperationInProgress = "operation_in_progress"
	PaymentGatewayModeApplyReasonTargetAlreadyActive = "target_already_effective"
	PaymentGatewayModeApplyReasonOptionReadFailed    = "option_read_failed"
	PaymentGatewayModeApplyReasonOptionWriteFailed   = "option_write_failed"
	PaymentGatewayModeApplyReasonAuditFailed         = "audit_write_failed"
	PaymentGatewayModeApplyReasonStateConflict       = "state_conflict"
	PaymentGatewayModeApplyReasonInvalidRequest      = "invalid_request"
)

var (
	ErrPaymentGatewayModeApplyInvalidRequest = errors.New("invalid payment gateway mode apply request")
	ErrPaymentGatewayModeApplyStateConflict  = errors.New("payment gateway mode state changed; refresh and try again")
	ErrPaymentGatewayModeApplyUnavailable    = errors.New("payment gateway mode cannot be applied safely in this process")
)

// PaymentGatewayModeApplyRequest is the complete, fixed schema accepted by
// the save-and-apply endpoint.  Keep this type intentionally small: adding a
// deployment target or command field would expand the authority of the API.
type PaymentGatewayModeApplyRequest struct {
	TargetMode            string `json:"target_mode"`
	ExpectedEffectiveMode string `json:"expected_effective_mode"`
	ExpectedDesiredMode   string `json:"expected_desired_mode"`
	RequestID             string `json:"request_id"`
}

// PaymentGatewayModeApplyAudit contains only mode transition metadata.  It is
// passed to the controller's audit writer and must never contain credentials,
// authorization headers, URLs, hostnames, or deployment details.
type PaymentGatewayModeApplyAudit struct {
	RequestID        string
	OldDesiredMode   string
	OldEffectiveMode string
	TargetMode       string
	Result           string
	Reason           string
}

type PaymentGatewayModeApplyCapability struct {
	SelfRestartEnabled      bool   `json:"self_restart_enabled"`
	GracefulShutdownSupport bool   `json:"graceful_shutdown_supported"`
	ShutdownTriggerReady    bool   `json:"shutdown_trigger_ready"`
	SingleInstanceEligible  bool   `json:"single_instance_eligible"`
	ActiveInstanceCount     int    `json:"active_instance_count"`
	InstanceCheckKnown      bool   `json:"instance_check_known"`
	CanSelfRestart          bool   `json:"can_self_restart"`
	UnavailableReason       string `json:"unavailable_reason,omitempty"`
}

type PaymentGatewayModeApplyOperation struct {
	State      string `json:"state"`
	RequestID  string `json:"request_id,omitempty"`
	TargetMode string `json:"target_mode,omitempty"`
	AcceptedAt int64  `json:"accepted_at,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

// PaymentGatewayModeStatus is safe to expose to a Root administrator.  It
// intentionally contains capability booleans and a bounded reason, but no
// instance names, addresses, credentials, or supervisor/deployment details.
type PaymentGatewayModeStatus struct {
	// TargetMode identifies the exact mode for which Capability was evaluated.
	// Status callers must provide this target explicitly so an unsaved draft can
	// be checked without changing the persisted desired mode.
	TargetMode    string                            `json:"target_mode"`
	DesiredMode   string                            `json:"desired_mode"`
	EffectiveMode string                            `json:"effective_mode"`
	StartedAt     int64                             `json:"started_at"`
	Healthy       bool                              `json:"healthy"`
	Capability    PaymentGatewayModeApplyCapability `json:"capability"`
	Operation     PaymentGatewayModeApplyOperation  `json:"operation"`
}

type PaymentGatewayModeApplyResult struct {
	Outcome           string `json:"outcome"`
	Code              string `json:"code,omitempty"`
	Message           string `json:"message,omitempty"`
	RequestID         string `json:"request_id,omitempty"`
	TargetMode        string `json:"target_mode,omitempty"`
	DesiredMode       string `json:"desired_mode,omitempty"`
	EffectiveMode     string `json:"effective_mode,omitempty"`
	ExpectedStartedAt int64  `json:"started_at,omitempty"`
	TriggerPending    bool   `json:"trigger_pending,omitempty"`
}

type paymentGatewayModeApplyOperation struct {
	PaymentGatewayModeApplyOperation
	trigger          func()
	triggerScheduled bool
	active           bool
	outcome          string
}

var paymentGatewayModeApplyState = struct {
	sync.Mutex
	operation paymentGatewayModeApplyOperation
}{
	operation: paymentGatewayModeApplyOperation{
		PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{State: PaymentGatewayModeApplyStateIdle},
	},
}

var paymentGatewayModeApplyTestHooks = struct {
	sync.RWMutex
	beforeOptionWrite func()
	afterOptionWrite  func()
}{}

// SetPaymentGatewayModeApplyBeforeOptionWriteHookForTest injects a
// deterministic desired-mode update between apply's optimistic read/check and
// its conditional write.  Production code leaves this hook unset.
func SetPaymentGatewayModeApplyBeforeOptionWriteHookForTest(hook func()) func() {
	paymentGatewayModeApplyTestHooks.Lock()
	previous := paymentGatewayModeApplyTestHooks.beforeOptionWrite
	paymentGatewayModeApplyTestHooks.beforeOptionWrite = hook
	paymentGatewayModeApplyTestHooks.Unlock()
	return func() {
		paymentGatewayModeApplyTestHooks.Lock()
		paymentGatewayModeApplyTestHooks.beforeOptionWrite = previous
		paymentGatewayModeApplyTestHooks.Unlock()
	}
}

func paymentGatewayModeApplyBeforeOptionWrite() {
	paymentGatewayModeApplyTestHooks.RLock()
	hook := paymentGatewayModeApplyTestHooks.beforeOptionWrite
	paymentGatewayModeApplyTestHooks.RUnlock()
	if hook != nil {
		hook()
	}
}

// SetPaymentGatewayModeApplyAfterOptionWriteHookForTest injects a
// deterministic write between the durable reservation/CAS and the audit
// writer.  Production code leaves this hook unset; it exists to prove that a
// stale process cannot be accepted after the database write has committed.
func SetPaymentGatewayModeApplyAfterOptionWriteHookForTest(hook func()) func() {
	paymentGatewayModeApplyTestHooks.Lock()
	previous := paymentGatewayModeApplyTestHooks.afterOptionWrite
	paymentGatewayModeApplyTestHooks.afterOptionWrite = hook
	paymentGatewayModeApplyTestHooks.Unlock()
	return func() {
		paymentGatewayModeApplyTestHooks.Lock()
		paymentGatewayModeApplyTestHooks.afterOptionWrite = previous
		paymentGatewayModeApplyTestHooks.Unlock()
	}
}

func paymentGatewayModeApplyAfterOptionWrite() {
	paymentGatewayModeApplyTestHooks.RLock()
	hook := paymentGatewayModeApplyTestHooks.afterOptionWrite
	paymentGatewayModeApplyTestHooks.RUnlock()
	if hook != nil {
		hook()
	}
}

var paymentGatewayModeShutdown = struct {
	sync.RWMutex
	trigger func()
}{}

var paymentGatewayModePlatform = struct {
	sync.RWMutex
	supported bool
}{
	supported: runtime.GOOS != "",
}

// SetPaymentGatewayModeShutdownTrigger registers the already-wired HTTP
// server graceful-shutdown path.  The returned function restores the previous
// trigger, which lets deterministic tests inject a channel without terminating
// the test process.
func SetPaymentGatewayModeShutdownTrigger(trigger func()) func() {
	paymentGatewayModeShutdown.Lock()
	previous := paymentGatewayModeShutdown.trigger
	paymentGatewayModeShutdown.trigger = trigger
	paymentGatewayModeShutdown.Unlock()
	return func() {
		paymentGatewayModeShutdown.Lock()
		paymentGatewayModeShutdown.trigger = previous
		paymentGatewayModeShutdown.Unlock()
	}
}

func paymentGatewayModeShutdownTrigger() func() {
	paymentGatewayModeShutdown.RLock()
	defer paymentGatewayModeShutdown.RUnlock()
	return paymentGatewayModeShutdown.trigger
}

// SetPaymentGatewayModeShutdownSupportForTest overrides the platform support
// check.  Production wiring uses the existing http.Server.Shutdown path; this
// hook only makes unsupported-platform and capability-failure tests explicit.
func SetPaymentGatewayModeShutdownSupportForTest(supported bool) func() {
	paymentGatewayModePlatform.Lock()
	previous := paymentGatewayModePlatform.supported
	paymentGatewayModePlatform.supported = supported
	paymentGatewayModePlatform.Unlock()
	return func() {
		paymentGatewayModePlatform.Lock()
		paymentGatewayModePlatform.supported = previous
		paymentGatewayModePlatform.Unlock()
	}
}

func paymentGatewayModeShutdownSupported() bool {
	paymentGatewayModePlatform.RLock()
	defer paymentGatewayModePlatform.RUnlock()
	return paymentGatewayModePlatform.supported
}

func paymentGatewayModeSelfRestartEnabled() bool {
	if raw, ok := os.LookupEnv("ADMIN_SELF_RESTART_ENABLED"); ok {
		enabled, err := strconv.ParseBool(strings.TrimSpace(raw))
		return err == nil && enabled
	}
	return common.AdminSelfRestartEnabled
}

func normalizePaymentGatewayModeApplyRequest(request PaymentGatewayModeApplyRequest) (PaymentGatewayModeApplyRequest, error) {
	request.TargetMode = strings.TrimSpace(request.TargetMode)
	request.ExpectedEffectiveMode = strings.TrimSpace(request.ExpectedEffectiveMode)
	request.ExpectedDesiredMode = strings.TrimSpace(request.ExpectedDesiredMode)
	request.RequestID = strings.TrimSpace(request.RequestID)
	if request.RequestID == "" || len(request.RequestID) > 128 {
		return PaymentGatewayModeApplyRequest{}, ErrPaymentGatewayModeApplyInvalidRequest
	}
	for _, r := range request.RequestID {
		if r < 0x21 || r == 0x7f {
			return PaymentGatewayModeApplyRequest{}, ErrPaymentGatewayModeApplyInvalidRequest
		}
	}
	for _, value := range []string{request.TargetMode, request.ExpectedEffectiveMode, request.ExpectedDesiredMode} {
		// NormalizePaymentGatewayMode treats an empty persisted option as the
		// legacy default.  Apply requests are a fixed schema, however: an omitted
		// expected value must not silently become a valid optimistic precondition.
		if strings.TrimSpace(value) == "" {
			return PaymentGatewayModeApplyRequest{}, ErrPaymentGatewayModeApplyInvalidRequest
		}
		if _, err := operation_setting.NormalizePaymentGatewayMode(value); err != nil {
			return PaymentGatewayModeApplyRequest{}, ErrPaymentGatewayModeApplyInvalidRequest
		}
	}
	var err error
	request.TargetMode, err = operation_setting.NormalizePaymentGatewayMode(request.TargetMode)
	if err != nil {
		return PaymentGatewayModeApplyRequest{}, ErrPaymentGatewayModeApplyInvalidRequest
	}
	request.ExpectedEffectiveMode, err = operation_setting.NormalizePaymentGatewayMode(request.ExpectedEffectiveMode)
	if err != nil {
		return PaymentGatewayModeApplyRequest{}, ErrPaymentGatewayModeApplyInvalidRequest
	}
	request.ExpectedDesiredMode, err = operation_setting.NormalizePaymentGatewayMode(request.ExpectedDesiredMode)
	if err != nil {
		return PaymentGatewayModeApplyRequest{}, ErrPaymentGatewayModeApplyInvalidRequest
	}
	return request, nil
}

// ValidatePaymentGatewayModeApplyRequest is exported for request-boundary
// tests and for callers that want to validate before touching the operation
// state.  ApplyPaymentGatewayMode repeats this check as a defense in depth.
func ValidatePaymentGatewayModeApplyRequest(request PaymentGatewayModeApplyRequest) error {
	_, err := normalizePaymentGatewayModeApplyRequest(request)
	return err
}

func livePaymentGatewayModeInstances(instances []*model.SystemInstance, now int64) (count int, known bool, reason string) {
	if len(instances) == 0 {
		return 0, false, PaymentGatewayModeApplyReasonInstanceCount
	}
	for _, instance := range instances {
		if instance == nil || strings.TrimSpace(instance.NodeName) == "" || instance.LastSeenAt <= 0 || instance.LastSeenAt > now {
			return count, false, PaymentGatewayModeApplyReasonInstanceCheckFailed
		}
		if now-instance.LastSeenAt > model.SystemInstanceStaleAfterSeconds {
			return count, false, PaymentGatewayModeApplyReasonStaleInstance
		}
		count++
	}
	if count != 1 {
		return count, true, PaymentGatewayModeApplyReasonInstanceCount
	}
	return count, true, ""
}

func paymentGatewayModeCapabilityForTarget(targetMode, desiredMode, effectiveMode string, operationActive bool) (PaymentGatewayModeApplyCapability, error) {
	instances, err := model.ListSystemInstances()
	if err != nil {
		return PaymentGatewayModeApplyCapability{
			SelfRestartEnabled:      paymentGatewayModeSelfRestartEnabled(),
			GracefulShutdownSupport: paymentGatewayModeShutdownSupported(),
			ShutdownTriggerReady:    paymentGatewayModeShutdownTrigger() != nil,
			InstanceCheckKnown:      false,
			UnavailableReason:       PaymentGatewayModeApplyReasonInstanceCheckFailed,
		}, err
	}

	activeCount, known, reason := livePaymentGatewayModeInstances(instances, common.GetTimestamp())
	selfRestartEnabled := paymentGatewayModeSelfRestartEnabled()
	gracefulSupported := paymentGatewayModeShutdownSupported()
	triggerReady := paymentGatewayModeShutdownTrigger() != nil
	singleInstance := known && activeCount == 1
	capability := PaymentGatewayModeApplyCapability{
		SelfRestartEnabled:      selfRestartEnabled,
		GracefulShutdownSupport: gracefulSupported,
		ShutdownTriggerReady:    triggerReady,
		SingleInstanceEligible:  singleInstance,
		ActiveInstanceCount:     activeCount,
		InstanceCheckKnown:      known,
		CanSelfRestart:          false,
		UnavailableReason:       reason,
	}
	if !selfRestartEnabled {
		capability.UnavailableReason = PaymentGatewayModeApplyReasonSelfRestartDisabled
	} else if !gracefulSupported || !triggerReady {
		capability.UnavailableReason = PaymentGatewayModeApplyReasonShutdownUnavailable
	} else if !known {
		// Preserve stale/empty-instance distinctions for the UI and audit.
		if capability.UnavailableReason == "" {
			capability.UnavailableReason = PaymentGatewayModeApplyReasonInstanceCheckFailed
		}
	} else if !singleInstance {
		capability.UnavailableReason = reason
	} else if targetMode == effectiveMode {
		capability.UnavailableReason = PaymentGatewayModeApplyReasonTargetAlreadyActive
	} else if operationActive {
		capability.UnavailableReason = PaymentGatewayModeApplyReasonOperationInProgress
	} else {
		capability.CanSelfRestart = true
		capability.UnavailableReason = ""
	}
	return capability, nil
}

func paymentGatewayModeCapability(desiredMode, effectiveMode string, operationActive bool) (PaymentGatewayModeApplyCapability, error) {
	return paymentGatewayModeCapabilityForTarget(desiredMode, desiredMode, effectiveMode, operationActive)
}

func validatePaymentGatewayModeStatusTarget(targetMode string) error {
	// Unlike persisted options and apply bodies, a status target is a query
	// contract.  Do not trim or default it: callers must identify one of the
	// two exact, bounded modes before capability is evaluated.
	if targetMode != operation_setting.PaymentGatewayModeEpayLegacy &&
		targetMode != operation_setting.PaymentGatewayModeGMPayNative {
		return ErrPaymentGatewayModeApplyInvalidRequest
	}
	return nil
}

// ValidatePaymentGatewayModeStatusTarget validates the exact target accepted
// by the target-aware status endpoint.  It is exported for the HTTP boundary
// and tests so an omitted, free-form, or ambiguous query value fails closed.
func ValidatePaymentGatewayModeStatusTarget(targetMode string) error {
	return validatePaymentGatewayModeStatusTarget(targetMode)
}

// GetPaymentGatewayModeStatus reads desired mode and the current site's
// heartbeat table using the persisted desired mode as its target.  It remains
// available for internal callers that only need the saved-target view; the
// HTTP endpoint uses GetPaymentGatewayModeStatusForTarget so draft targets are
// evaluated explicitly.
func GetPaymentGatewayModeStatus() (PaymentGatewayModeStatus, error) {
	return getPaymentGatewayModeStatus("")
}

// GetPaymentGatewayModeStatusForTarget evaluates restart capability for the
// exact requested mode while keeping desired/effective values observational.
// In particular, a draft target may differ from desired before the user saves
// it, and must still receive a capability result based on that target.
func GetPaymentGatewayModeStatusForTarget(targetMode string) (PaymentGatewayModeStatus, error) {
	if err := validatePaymentGatewayModeStatusTarget(targetMode); err != nil {
		return PaymentGatewayModeStatus{}, err
	}
	return getPaymentGatewayModeStatus(targetMode)
}

func getPaymentGatewayModeStatus(targetMode string) (PaymentGatewayModeStatus, error) {
	paymentGatewayModeApplyState.Lock()
	operation := paymentGatewayModeApplyState.operation
	paymentGatewayModeApplyState.Unlock()

	desiredMode, err := model.GetPaymentGatewayModeOption()
	if err != nil {
		return PaymentGatewayModeStatus{
			TargetMode:    targetMode,
			EffectiveMode: operation_setting.GetEffectivePaymentGatewayMode(),
			StartedAt:     common.StartTime,
			Healthy:       false,
			Operation:     operation.PaymentGatewayModeApplyOperation,
		}, err
	}
	if targetMode == "" {
		targetMode = desiredMode
	}
	effectiveMode := operation_setting.GetEffectivePaymentGatewayMode()
	reservationActive, err := model.PaymentGatewayModeApplyReservationActive()
	if err != nil {
		return PaymentGatewayModeStatus{
			TargetMode:    targetMode,
			DesiredMode:   desiredMode,
			EffectiveMode: effectiveMode,
			StartedAt:     common.StartTime,
			Healthy:       false,
			Operation:     operation.PaymentGatewayModeApplyOperation,
		}, err
	}
	operationActive := operation.active || reservationActive
	if reservationActive && !operation.active {
		operation.PaymentGatewayModeApplyOperation = PaymentGatewayModeApplyOperation{
			State:  PaymentGatewayModeApplyStateApplying,
			Reason: PaymentGatewayModeApplyReasonOperationInProgress,
		}
	}
	capability, err := paymentGatewayModeCapabilityForTarget(targetMode, desiredMode, effectiveMode, operationActive)
	if err != nil {
		return PaymentGatewayModeStatus{
			TargetMode:    targetMode,
			DesiredMode:   desiredMode,
			EffectiveMode: effectiveMode,
			StartedAt:     common.StartTime,
			Healthy:       false,
			Capability:    capability,
			Operation:     operation.PaymentGatewayModeApplyOperation,
		}, err
	}
	return PaymentGatewayModeStatus{
		TargetMode:    targetMode,
		DesiredMode:   desiredMode,
		EffectiveMode: effectiveMode,
		StartedAt:     common.StartTime,
		Healthy:       true,
		Capability:    capability,
		Operation:     operation.PaymentGatewayModeApplyOperation,
	}, nil
}

func paymentGatewayModeApplyFailure(requestID, target, code, message string) PaymentGatewayModeApplyResult {
	return PaymentGatewayModeApplyResult{
		Outcome:    PaymentGatewayModeApplyOutcomeRejected,
		Code:       code,
		Message:    message,
		RequestID:  requestID,
		TargetMode: target,
	}
}

func paymentGatewayModeApplyConflict(requestID, target, code, message string) PaymentGatewayModeApplyResult {
	return PaymentGatewayModeApplyResult{
		Outcome:    PaymentGatewayModeApplyOutcomeConflict,
		Code:       code,
		Message:    message,
		RequestID:  requestID,
		TargetMode: target,
	}
}

func paymentGatewayModeApplyRecorded(operation *paymentGatewayModeApplyOperation, requestID string) bool {
	return operation != nil && requestID != "" && operation.RequestID == requestID && operation.outcome != ""
}

// ApplyPaymentGatewayMode persists a desired mode only after validating the
// current database state and all self-restart capabilities.  The audit writer
// runs synchronously after the database transaction and before this function
// returns an accepted result.  The actual shutdown is intentionally separate:
// the controller calls CompletePaymentGatewayModeApply after writing/flushing
// the HTTP response.
func ApplyPaymentGatewayMode(request PaymentGatewayModeApplyRequest, auditWriter func(PaymentGatewayModeApplyAudit) error) PaymentGatewayModeApplyResult {
	normalized, err := normalizePaymentGatewayModeApplyRequest(request)
	if err != nil {
		return paymentGatewayModeApplyFailure(request.RequestID, request.TargetMode, PaymentGatewayModeApplyReasonInvalidRequest, ErrPaymentGatewayModeApplyInvalidRequest.Error())
	}

	paymentGatewayModeApplyState.Lock()
	defer paymentGatewayModeApplyState.Unlock()
	operation := &paymentGatewayModeApplyState.operation
	if paymentGatewayModeApplyRecorded(operation, normalized.RequestID) {
		outcome := operation.outcome
		code := operation.Reason
		if code == "" {
			code = operation.State
		}
		return PaymentGatewayModeApplyResult{
			Outcome:        outcome,
			Code:           code,
			Message:        "payment gateway mode apply request already recorded",
			RequestID:      operation.RequestID,
			TargetMode:     operation.TargetMode,
			TriggerPending: operation.active && !operation.triggerScheduled,
		}
	}
	if operation.active {
		return paymentGatewayModeApplyConflict(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonOperationInProgress, ErrPaymentGatewayModeApplyStateConflict.Error())
	}
	if auditWriter == nil {
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonAuditFailed,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		return paymentGatewayModeApplyFailure(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonAuditFailed, "unable to record the payment gateway mode operation")
	}

	desiredMode, err := model.GetPaymentGatewayModeOption()
	if err != nil {
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonOptionReadFailed,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		return paymentGatewayModeApplyFailure(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonOptionReadFailed, "unable to read the payment gateway mode")
	}
	effectiveMode := operation_setting.GetEffectivePaymentGatewayMode()
	if normalized.ExpectedEffectiveMode != effectiveMode || normalized.ExpectedDesiredMode != desiredMode {
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonStateConflict,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		return paymentGatewayModeApplyConflict(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonStateConflict, ErrPaymentGatewayModeApplyStateConflict.Error())
	}
	if normalized.TargetMode == effectiveMode {
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateIdle,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonTargetAlreadyActive,
		}, outcome: PaymentGatewayModeApplyOutcomeAlreadyApplied}
		return PaymentGatewayModeApplyResult{
			Outcome:           PaymentGatewayModeApplyOutcomeAlreadyApplied,
			Code:              PaymentGatewayModeApplyReasonTargetAlreadyActive,
			Message:           "the requested payment gateway mode is already effective",
			RequestID:         normalized.RequestID,
			TargetMode:        normalized.TargetMode,
			DesiredMode:       desiredMode,
			EffectiveMode:     effectiveMode,
			ExpectedStartedAt: common.StartTime,
		}
	}

	capability, _ := paymentGatewayModeCapabilityForTarget(normalized.TargetMode, desiredMode, effectiveMode, false)
	if !capability.CanSelfRestart {
		reason := capability.UnavailableReason
		if reason == "" {
			reason = PaymentGatewayModeApplyReasonShutdownUnavailable
		}
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     reason,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		return paymentGatewayModeApplyFailure(normalized.RequestID, normalized.TargetMode, reason, ErrPaymentGatewayModeApplyUnavailable.Error())
	}
	trigger := paymentGatewayModeShutdownTrigger()
	if trigger == nil {
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonShutdownUnavailable,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		return paymentGatewayModeApplyFailure(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonShutdownUnavailable, ErrPaymentGatewayModeApplyUnavailable.Error())
	}

	paymentGatewayModeApplyBeforeOptionWrite()
	updated, err := model.ReservePaymentGatewayModeApply(
		desiredMode,
		normalized.TargetMode,
		normalized.RequestID,
	)
	if err != nil {
		reason := PaymentGatewayModeApplyReasonOptionWriteFailed
		if errors.Is(err, model.ErrPaymentGatewayModeApplyReservationActive) {
			reason = PaymentGatewayModeApplyReasonOperationInProgress
		}
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     reason,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		if reason == PaymentGatewayModeApplyReasonOperationInProgress {
			return paymentGatewayModeApplyConflict(normalized.RequestID, normalized.TargetMode, reason, ErrPaymentGatewayModeApplyStateConflict.Error())
		}
		return paymentGatewayModeApplyFailure(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonOptionWriteFailed, "unable to save the payment gateway mode")
	}
	if !updated {
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonStateConflict,
		}, outcome: PaymentGatewayModeApplyOutcomeConflict}
		return paymentGatewayModeApplyConflict(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonStateConflict, ErrPaymentGatewayModeApplyStateConflict.Error())
	}

	// The reservation blocks all supported generic writers, while this second
	// read also detects a legacy/rogue process that changed the row directly
	// after the transaction committed.  Never audit or accept a stale target.
	paymentGatewayModeApplyAfterOptionWrite()
	owned, err := model.PaymentGatewayModeApplyReservationOwnedBy(normalized.RequestID)
	if err != nil {
		_ = model.ReleasePaymentGatewayModeApplyReservation(normalized.RequestID)
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonOptionReadFailed,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		return paymentGatewayModeApplyFailure(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonOptionReadFailed, "unable to verify the payment gateway mode")
	}
	latestDesiredMode, err := model.GetPaymentGatewayModeOption()
	if err != nil {
		_ = model.ReleasePaymentGatewayModeApplyReservation(normalized.RequestID)
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonOptionReadFailed,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		return paymentGatewayModeApplyFailure(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonOptionReadFailed, "unable to verify the payment gateway mode")
	}
	if !owned || latestDesiredMode != normalized.TargetMode {
		_ = model.ReleasePaymentGatewayModeApplyReservation(normalized.RequestID)
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonStateConflict,
		}, outcome: PaymentGatewayModeApplyOutcomeConflict}
		return paymentGatewayModeApplyConflict(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonStateConflict, ErrPaymentGatewayModeApplyStateConflict.Error())
	}

	audit := PaymentGatewayModeApplyAudit{
		RequestID:        normalized.RequestID,
		OldDesiredMode:   desiredMode,
		OldEffectiveMode: effectiveMode,
		TargetMode:       normalized.TargetMode,
		Result:           PaymentGatewayModeApplyOutcomeAccepted,
	}
	if err := auditWriter(audit); err != nil {
		_ = model.ReleasePaymentGatewayModeApplyReservation(normalized.RequestID)
		*operation = paymentGatewayModeApplyOperation{PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateFailed,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			Reason:     PaymentGatewayModeApplyReasonAuditFailed,
		}, outcome: PaymentGatewayModeApplyOutcomeRejected}
		return paymentGatewayModeApplyFailure(normalized.RequestID, normalized.TargetMode, PaymentGatewayModeApplyReasonAuditFailed, "unable to record the payment gateway mode operation")
	}

	acceptedAt := common.GetTimestamp()
	*operation = paymentGatewayModeApplyOperation{
		PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateApplying,
			RequestID:  normalized.RequestID,
			TargetMode: normalized.TargetMode,
			AcceptedAt: acceptedAt,
		},
		trigger: trigger,
		active:  true,
		outcome: PaymentGatewayModeApplyOutcomeAccepted,
	}
	return PaymentGatewayModeApplyResult{
		Outcome:           PaymentGatewayModeApplyOutcomeAccepted,
		Code:              PaymentGatewayModeApplyStateApplying,
		Message:           "payment gateway mode saved; graceful restart requested",
		RequestID:         normalized.RequestID,
		TargetMode:        normalized.TargetMode,
		DesiredMode:       normalized.TargetMode,
		EffectiveMode:     effectiveMode,
		ExpectedStartedAt: common.StartTime,
		TriggerPending:    true,
	}
}

// CompletePaymentGatewayModeApply marks the accepted operation as applying
// and invokes the captured current-process shutdown trigger asynchronously.
// It is idempotent: a duplicate callback request cannot trigger another
// shutdown.
func CompletePaymentGatewayModeApply(requestID string) bool {
	paymentGatewayModeApplyState.Lock()
	operation := &paymentGatewayModeApplyState.operation
	if !operation.active || operation.RequestID != requestID || operation.triggerScheduled || operation.trigger == nil {
		paymentGatewayModeApplyState.Unlock()
		return false
	}
	operation.triggerScheduled = true
	trigger := operation.trigger
	reservationOwner := operation.RequestID
	paymentGatewayModeApplyState.Unlock()

	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				common.SysError(fmt.Sprintf("payment gateway mode shutdown trigger panicked: %v", recovered))
			}
		}()
		defer func() {
			if err := model.ReleasePaymentGatewayModeApplyReservation(reservationOwner); err != nil {
				common.SysError("payment gateway mode apply reservation release failed: " + err.Error())
			}
		}()
		trigger()
	}()
	return true
}

// ResetPaymentGatewayModeApplyForTest clears the process-local idempotency
// state.  Production code never calls this; tests use it to isolate fixtures.
func ResetPaymentGatewayModeApplyForTest() {
	paymentGatewayModeApplyState.Lock()
	requestID := paymentGatewayModeApplyState.operation.RequestID
	paymentGatewayModeApplyState.operation = paymentGatewayModeApplyOperation{
		PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{State: PaymentGatewayModeApplyStateIdle},
	}
	paymentGatewayModeApplyState.Unlock()
	if requestID != "" {
		_ = model.ReleasePaymentGatewayModeApplyReservation(requestID)
	}
}
