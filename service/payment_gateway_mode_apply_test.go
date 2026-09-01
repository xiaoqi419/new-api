package service

import (
	"errors"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func usePaymentGatewayModeApplyFixture(t *testing.T, desiredMode string) (*gorm.DB, int64) {
	t.Helper()

	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.SystemInstance{}))

	now := common.GetTimestamp()
	require.NoError(t, db.Create(&model.Option{
		Key:   operation_setting.PaymentGatewayModeOptionKey,
		Value: desiredMode,
	}).Error)
	require.NoError(t, db.Create(&model.SystemInstance{
		NodeName:   "payment-mode-test",
		StartedAt:  now - 10,
		LastSeenAt: now,
	}).Error)

	model.DB = db
	previousOptionMap := common.OptionMap
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{
		operation_setting.PaymentGatewayModeOptionKey: desiredMode,
	}
	common.OptionMapRWMutex.Unlock()
	previousStartTime := common.StartTime
	common.StartTime = now - 10
	previousSelfRestart := common.AdminSelfRestartEnabled
	common.AdminSelfRestartEnabled = true
	t.Setenv("ADMIN_SELF_RESTART_ENABLED", "true")
	restoreMode := operation_setting.SetEffectivePaymentGatewayModeForTest(operation_setting.PaymentGatewayModeEpayLegacy)
	restoreSupport := SetPaymentGatewayModeShutdownSupportForTest(true)
	restoreTrigger := SetPaymentGatewayModeShutdownTrigger(func() {})
	ResetPaymentGatewayModeApplyForTest()

	t.Cleanup(func() {
		ResetPaymentGatewayModeApplyForTest()
		restoreTrigger()
		restoreSupport()
		restoreMode()
		common.AdminSelfRestartEnabled = previousSelfRestart
		common.StartTime = previousStartTime
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
		model.DB = previousDB
		_ = sqlDB.Close()
	})
	return db, now
}

func paymentGatewayModeApplyRequest(requestID, targetMode, effectiveMode, desiredMode string) PaymentGatewayModeApplyRequest {
	return PaymentGatewayModeApplyRequest{
		TargetMode:            targetMode,
		ExpectedEffectiveMode: effectiveMode,
		ExpectedDesiredMode:   desiredMode,
		RequestID:             requestID,
	}
}

func TestValidatePaymentGatewayModeApplyRequestRequiresCompleteFixedSchema(t *testing.T) {
	valid := paymentGatewayModeApplyRequest(
		"request-1",
		operation_setting.PaymentGatewayModeGMPayNative,
		operation_setting.PaymentGatewayModeEpayLegacy,
		operation_setting.PaymentGatewayModeEpayLegacy,
	)
	require.NoError(t, ValidatePaymentGatewayModeApplyRequest(valid))

	cases := []struct {
		name   string
		mutate func(*PaymentGatewayModeApplyRequest)
	}{
		{
			name: "missing target mode",
			mutate: func(request *PaymentGatewayModeApplyRequest) {
				request.TargetMode = ""
			},
		},
		{
			name: "missing expected effective mode",
			mutate: func(request *PaymentGatewayModeApplyRequest) {
				request.ExpectedEffectiveMode = ""
			},
		},
		{
			name: "missing expected desired mode",
			mutate: func(request *PaymentGatewayModeApplyRequest) {
				request.ExpectedDesiredMode = ""
			},
		},
		{
			name: "unknown mode",
			mutate: func(request *PaymentGatewayModeApplyRequest) {
				request.TargetMode = "domain_auto"
			},
		},
		{
			name: "missing request id",
			mutate: func(request *PaymentGatewayModeApplyRequest) {
				request.RequestID = "  "
			},
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			request := valid
			testCase.mutate(&request)
			require.ErrorIs(t, ValidatePaymentGatewayModeApplyRequest(request), ErrPaymentGatewayModeApplyInvalidRequest)
		})
	}
}

func TestLivePaymentGatewayModeInstancesFailsClosedForUnknownStaleAndMultipleInstances(t *testing.T) {
	now := int64(1000)
	cases := []struct {
		name       string
		instances  []*model.SystemInstance
		wantCount  int
		wantKnown  bool
		wantReason string
	}{
		{
			name:       "empty instance list",
			instances:  nil,
			wantReason: PaymentGatewayModeApplyReasonInstanceCount,
		},
		{
			name: "unknown instance",
			instances: []*model.SystemInstance{{
				NodeName:   "",
				LastSeenAt: now,
			}},
			wantReason: PaymentGatewayModeApplyReasonInstanceCheckFailed,
		},
		{
			name: "future heartbeat is unknown",
			instances: []*model.SystemInstance{{
				NodeName:   "node-a",
				LastSeenAt: now + 1,
			}},
			wantReason: PaymentGatewayModeApplyReasonInstanceCheckFailed,
		},
		{
			name: "stale instance",
			instances: []*model.SystemInstance{{
				NodeName:   "node-a",
				LastSeenAt: now - model.SystemInstanceStaleAfterSeconds - 1,
			}},
			wantReason: PaymentGatewayModeApplyReasonStaleInstance,
		},
		{
			name: "multiple active instances",
			instances: []*model.SystemInstance{
				{NodeName: "node-a", LastSeenAt: now},
				{NodeName: "node-b", LastSeenAt: now},
			},
			wantCount:  2,
			wantKnown:  true,
			wantReason: PaymentGatewayModeApplyReasonInstanceCount,
		},
		{
			name: "one active instance",
			instances: []*model.SystemInstance{{
				NodeName:   "node-a",
				LastSeenAt: now,
			}},
			wantCount: 1,
			wantKnown: true,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			count, known, reason := livePaymentGatewayModeInstances(testCase.instances, now)
			assert.Equal(t, testCase.wantCount, count)
			assert.Equal(t, testCase.wantKnown, known)
			assert.Equal(t, testCase.wantReason, reason)
		})
	}
}

func TestGetPaymentGatewayModeStatusEvaluatesAnUnsavedDraftTarget(t *testing.T) {
	_, now := usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
	status, err := GetPaymentGatewayModeStatusForTarget(operation_setting.PaymentGatewayModeGMPayNative)

	require.NoError(t, err)
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, status.TargetMode)
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, status.DesiredMode)
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, status.EffectiveMode)
	assert.Equal(t, now-10, status.StartedAt)
	assert.True(t, status.Healthy)
	assert.True(t, status.Capability.CanSelfRestart)
	assert.Empty(t, status.Capability.UnavailableReason)
}

func TestGetPaymentGatewayModeStatusRejectsAnInvalidTarget(t *testing.T) {
	_, _ = usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)

	status, err := GetPaymentGatewayModeStatusForTarget("domain_auto")

	assert.ErrorIs(t, err, ErrPaymentGatewayModeApplyInvalidRequest)
	assert.Empty(t, status.TargetMode)
}

func TestGetPaymentGatewayModeStatusFailsClosedForUnsafeInstanceStates(t *testing.T) {
	tests := []struct {
		name       string
		instances  []model.SystemInstance
		wantReason string
	}{
		{
			name:       "unknown instance",
			instances:  []model.SystemInstance{{NodeName: "", LastSeenAt: common.GetTimestamp()}},
			wantReason: PaymentGatewayModeApplyReasonInstanceCheckFailed,
		},
		{
			name: "multiple active instances",
			instances: []model.SystemInstance{
				{NodeName: "node-a", LastSeenAt: common.GetTimestamp()},
				{NodeName: "node-b", LastSeenAt: common.GetTimestamp()},
			},
			wantReason: PaymentGatewayModeApplyReasonInstanceCount,
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			db, _ := usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
			require.NoError(t, db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&model.SystemInstance{}).Error)
			for _, instance := range testCase.instances {
				require.NoError(t, db.Create(&instance).Error)
			}

			status, err := GetPaymentGatewayModeStatusForTarget(operation_setting.PaymentGatewayModeGMPayNative)

			require.NoError(t, err)
			assert.True(t, status.Healthy)
			assert.False(t, status.Capability.CanSelfRestart)
			assert.Equal(t, testCase.wantReason, status.Capability.UnavailableReason)
		})
	}
}

func TestGetPaymentGatewayModeStatusFailsClosedWhileApplyIsInProgress(t *testing.T) {
	_, _ = usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
	paymentGatewayModeApplyState.Lock()
	paymentGatewayModeApplyState.operation = paymentGatewayModeApplyOperation{
		PaymentGatewayModeApplyOperation: PaymentGatewayModeApplyOperation{
			State:      PaymentGatewayModeApplyStateApplying,
			RequestID:  "status-applying",
			TargetMode: operation_setting.PaymentGatewayModeGMPayNative,
		},
		active: true,
	}
	paymentGatewayModeApplyState.Unlock()
	t.Cleanup(ResetPaymentGatewayModeApplyForTest)

	status, err := GetPaymentGatewayModeStatusForTarget(operation_setting.PaymentGatewayModeGMPayNative)

	require.NoError(t, err)
	assert.False(t, status.Capability.CanSelfRestart)
	assert.Equal(t, PaymentGatewayModeApplyReasonOperationInProgress, status.Capability.UnavailableReason)
	assert.Equal(t, PaymentGatewayModeApplyStateApplying, status.Operation.State)
}

func TestApplyPaymentGatewayModeRejectsDatabaseReadFailureWithoutMutationOrTrigger(t *testing.T) {
	_, _ = usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
	triggered := make(chan struct{}, 1)
	restoreTrigger := SetPaymentGatewayModeShutdownTrigger(func() {
		triggered <- struct{}{}
	})
	t.Cleanup(restoreTrigger)

	sqlDB, err := model.DB.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())

	result := ApplyPaymentGatewayMode(
		paymentGatewayModeApplyRequest(
			"db-read-failure",
			operation_setting.PaymentGatewayModeGMPayNative,
			operation_setting.PaymentGatewayModeEpayLegacy,
			operation_setting.PaymentGatewayModeEpayLegacy,
		),
		func(PaymentGatewayModeApplyAudit) error {
			return errors.New("audit must not run")
		},
	)

	assert.Equal(t, PaymentGatewayModeApplyOutcomeRejected, result.Outcome)
	assert.Equal(t, PaymentGatewayModeApplyReasonOptionReadFailed, result.Code)
	common.OptionMapRWMutex.RLock()
	configuredMode := common.OptionMap[operation_setting.PaymentGatewayModeOptionKey]
	common.OptionMapRWMutex.RUnlock()
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, configuredMode)
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, operation_setting.GetEffectivePaymentGatewayMode())
	select {
	case <-triggered:
		t.Fatal("shutdown trigger must not run after a database read failure")
	default:
	}
}

func TestApplyPaymentGatewayModeRejectsMissingAuditWriterBeforePersisting(t *testing.T) {
	db, _ := usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
	triggered := make(chan struct{}, 1)
	restoreTrigger := SetPaymentGatewayModeShutdownTrigger(func() {
		triggered <- struct{}{}
	})
	t.Cleanup(restoreTrigger)
	request := paymentGatewayModeApplyRequest(
		"missing-audit-writer",
		operation_setting.PaymentGatewayModeGMPayNative,
		operation_setting.PaymentGatewayModeEpayLegacy,
		operation_setting.PaymentGatewayModeEpayLegacy,
	)

	result := ApplyPaymentGatewayMode(request, nil)

	require.Equal(t, PaymentGatewayModeApplyOutcomeRejected, result.Outcome)
	assert.Equal(t, PaymentGatewayModeApplyReasonAuditFailed, result.Code)
	var option model.Option
	require.NoError(t, db.First(&option, "key = ?", operation_setting.PaymentGatewayModeOptionKey).Error)
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, option.Value)
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, operation_setting.GetEffectivePaymentGatewayMode())
	select {
	case <-triggered:
		t.Fatal("shutdown trigger must not run without an audit writer")
	default:
	}

	duplicate := ApplyPaymentGatewayMode(request, func(PaymentGatewayModeApplyAudit) error {
		t.Fatal("a rejected request must not be retried with a later audit writer")
		return nil
	})
	assert.Equal(t, PaymentGatewayModeApplyOutcomeRejected, duplicate.Outcome)
}

func TestApplyPaymentGatewayModeRejectsConcurrentDesiredWrite(t *testing.T) {
	_, _ = usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
	restoreHook := SetPaymentGatewayModeApplyBeforeOptionWriteHookForTest(func() {
		require.NoError(t, model.UpdateOption(
			operation_setting.PaymentGatewayModeOptionKey,
			operation_setting.PaymentGatewayModeGMPayNative,
		))
	})
	t.Cleanup(restoreHook)
	triggered := false
	restoreTrigger := SetPaymentGatewayModeShutdownTrigger(func() {
		triggered = true
	})
	t.Cleanup(restoreTrigger)
	auditCalled := false

	result := ApplyPaymentGatewayMode(
		paymentGatewayModeApplyRequest(
			"concurrent-desired-write",
			operation_setting.PaymentGatewayModeGMPayNative,
			operation_setting.PaymentGatewayModeEpayLegacy,
			operation_setting.PaymentGatewayModeEpayLegacy,
		),
		func(PaymentGatewayModeApplyAudit) error {
			auditCalled = true
			return nil
		},
	)

	assert.Equal(t, PaymentGatewayModeApplyOutcomeConflict, result.Outcome)
	assert.Equal(t, PaymentGatewayModeApplyReasonStateConflict, result.Code)
	assert.False(t, auditCalled)
	assert.False(t, triggered)
	configured, err := model.GetPaymentGatewayModeOption()
	require.NoError(t, err)
	assert.Equal(t, operation_setting.PaymentGatewayModeGMPayNative, configured)
}

func TestApplyPaymentGatewayModeRejectsDesiredMutationAfterReservation(t *testing.T) {
	db, _ := usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
	afterReservation := SetPaymentGatewayModeApplyAfterOptionWriteHookForTest(func() {
		// Simulate a writer from an older process that does not yet know about
		// the reservation.  Apply must re-read before audit/accept/trigger and
		// reject the stale transition instead of auditing the wrong state.
		require.NoError(t, db.Model(&model.Option{}).
			Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).
			Update("value", operation_setting.PaymentGatewayModeEpayLegacy).Error)
	})
	t.Cleanup(afterReservation)
	triggered := false
	restoreTrigger := SetPaymentGatewayModeShutdownTrigger(func() { triggered = true })
	t.Cleanup(restoreTrigger)
	auditCalled := false

	result := ApplyPaymentGatewayMode(
		paymentGatewayModeApplyRequest(
			"post-reservation-race",
			operation_setting.PaymentGatewayModeGMPayNative,
			operation_setting.PaymentGatewayModeEpayLegacy,
			operation_setting.PaymentGatewayModeEpayLegacy,
		),
		func(PaymentGatewayModeApplyAudit) error {
			auditCalled = true
			return nil
		},
	)

	assert.Equal(t, PaymentGatewayModeApplyOutcomeConflict, result.Outcome)
	assert.Equal(t, PaymentGatewayModeApplyReasonStateConflict, result.Code)
	assert.False(t, auditCalled)
	assert.False(t, triggered)
	configured, err := model.GetPaymentGatewayModeOption()
	require.NoError(t, err)
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, configured)
}

func TestApplyPaymentGatewayModeRejectsCapabilityFailureWithoutPersistingOrAuditing(t *testing.T) {
	db, _ := usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
	restoreSupport := SetPaymentGatewayModeShutdownSupportForTest(false)
	t.Cleanup(restoreSupport)
	auditCalled := false

	result := ApplyPaymentGatewayMode(
		paymentGatewayModeApplyRequest(
			"capability-failure",
			operation_setting.PaymentGatewayModeGMPayNative,
			operation_setting.PaymentGatewayModeEpayLegacy,
			operation_setting.PaymentGatewayModeEpayLegacy,
		),
		func(PaymentGatewayModeApplyAudit) error {
			auditCalled = true
			return nil
		},
	)

	assert.Equal(t, PaymentGatewayModeApplyOutcomeRejected, result.Outcome)
	assert.Equal(t, PaymentGatewayModeApplyReasonShutdownUnavailable, result.Code)
	assert.False(t, auditCalled)
	var option model.Option
	require.NoError(t, db.First(&option, "key = ?", operation_setting.PaymentGatewayModeOptionKey).Error)
	assert.Equal(t, operation_setting.PaymentGatewayModeEpayLegacy, option.Value)
}

func TestApplyPaymentGatewayModeAuditsBeforeResponseCompletionTriggerAndIsIdempotent(t *testing.T) {
	_, _ = usePaymentGatewayModeApplyFixture(t, operation_setting.PaymentGatewayModeEpayLegacy)
	auditFinished := make(chan struct{})
	triggerAfterAudit := make(chan bool, 1)
	restoreTrigger := SetPaymentGatewayModeShutdownTrigger(func() {
		select {
		case <-auditFinished:
			triggerAfterAudit <- true
		default:
			triggerAfterAudit <- false
		}
	})
	t.Cleanup(restoreTrigger)
	auditCalls := 0
	request := paymentGatewayModeApplyRequest(
		"ordered-apply",
		operation_setting.PaymentGatewayModeGMPayNative,
		operation_setting.PaymentGatewayModeEpayLegacy,
		operation_setting.PaymentGatewayModeEpayLegacy,
	)
	result := ApplyPaymentGatewayMode(request, func(audit PaymentGatewayModeApplyAudit) error {
		auditCalls++
		assert.Equal(t, request.RequestID, audit.RequestID)
		assert.Equal(t, request.ExpectedEffectiveMode, audit.OldEffectiveMode)
		assert.Equal(t, request.TargetMode, audit.TargetMode)
		close(auditFinished)
		return nil
	})

	require.Equal(t, PaymentGatewayModeApplyOutcomeAccepted, result.Outcome)
	assert.Equal(t, 1, auditCalls)
	select {
	case <-triggerAfterAudit:
		t.Fatal("shutdown trigger ran before response completion")
	default:
	}

	duplicate := ApplyPaymentGatewayMode(request, func(PaymentGatewayModeApplyAudit) error {
		t.Fatal("idempotent duplicate must not write a second audit")
		return nil
	})
	assert.Equal(t, PaymentGatewayModeApplyOutcomeAccepted, duplicate.Outcome)
	assert.True(t, duplicate.TriggerPending)

	require.True(t, CompletePaymentGatewayModeApply(request.RequestID))
	select {
	case triggerWasOrdered := <-triggerAfterAudit:
		assert.True(t, triggerWasOrdered)
	case <-time.After(time.Second):
		t.Fatal("shutdown trigger was not scheduled")
	}
	assert.False(t, CompletePaymentGatewayModeApply(request.RequestID))
	assert.Equal(t, 1, auditCalls)

	duplicateAfterTrigger := ApplyPaymentGatewayMode(request, nil)
	assert.Equal(t, PaymentGatewayModeApplyOutcomeAccepted, duplicateAfterTrigger.Outcome)
	assert.False(t, duplicateAfterTrigger.TriggerPending)
}
