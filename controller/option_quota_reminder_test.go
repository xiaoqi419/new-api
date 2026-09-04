package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func boolPtr(value bool) *bool {
	return &value
}

func float64Ptr(value float64) *float64 {
	return &value
}

func TestValidateQuotaReminderOption(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		value   string
		wantErr bool
	}{
		{name: "enabled true", key: "QuotaRemindEnabled", value: "true"},
		{name: "enabled invalid", key: "QuotaRemindEnabled", value: "yes", wantErr: true},
		{name: "threshold positive", key: "QuotaRemindThreshold", value: "1"},
		{name: "threshold zero", key: "QuotaRemindThreshold", value: "0", wantErr: true},
		{name: "threshold nan", key: "QuotaRemindThreshold", value: "NaN", wantErr: true},
		{name: "threshold infinity", key: "QuotaRemindThreshold", value: "+Inf", wantErr: true},
		{name: "threshold out of range", key: "QuotaRemindThreshold", value: "1e300", wantErr: true},
		{name: "unit usd", key: "QuotaRemindThresholdUnit", value: "usd"},
		{name: "unit custom", key: "quota_reminder.threshold_unit", value: "CUSTOM"},
		{name: "unit invalid", key: "QuotaReminderThresholdUnit", value: "points", wantErr: true},
		{name: "template required", key: "QuotaRemindTemplate", value: "", wantErr: true},
		{name: "custom template requires current content", key: "quota_reminder.template", value: "custom", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateQuotaReminderOption(tt.key, tt.value)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestValidateQuotaReminderOptionAcceptsCustomTemplateAfterBodyWasSaved(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{
		"quota_reminder.custom_template": `{"subject":"Low {{username}}","html":"<p>{{remaining_quota}}</p>","text":"{{remaining_quota}}"}`,
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})

	require.NoError(t, validateQuotaReminderOption("quota_reminder.template", "custom"))
}

func TestValidateQuotaReminderConfigRequestRequiresCompleteCustomTemplate(t *testing.T) {
	err := validateQuotaReminderConfigRequest(quotaReminderConfigUpdateRequest{
		Enabled:   boolPtr(true),
		Threshold: float64Ptr(1),
		Template:  "custom",
	})
	require.Error(t, err)
}

func TestValidateQuotaReminderConfigRequestIgnoresStaleCustomTemplateForBuiltIn(t *testing.T) {
	require.NoError(t, validateQuotaReminderConfigRequest(quotaReminderConfigUpdateRequest{
		Enabled:        boolPtr(true),
		Threshold:      float64Ptr(1),
		Template:       "default",
		CustomTemplate: `{"subject":"{{unknown}}","html":"<p>x</p>","text":"x"}`,
	}))
}
