package doubao

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseTaskResultMapsTerminalStatuses(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantStatus string
		wantReason string
	}{
		{
			name:       "cancelled is terminal",
			body:       `{"id":"cgt-1","status":"cancelled"}`,
			wantStatus: model.TaskStatusFailure,
			wantReason: "task cancelled",
		},
		{
			name:       "expired is terminal",
			body:       `{"id":"cgt-2","status":"expired"}`,
			wantStatus: model.TaskStatusFailure,
			wantReason: "task expired",
		},
		{
			name:       "upstream reason wins over the fallback",
			body:       `{"id":"cgt-3","status":"expired","error":{"code":"Timeout","message":"任务超时"}}`,
			wantStatus: model.TaskStatusFailure,
			wantReason: "任务超时",
		},
		{
			name:       "running stays in progress",
			body:       `{"id":"cgt-4","status":"running"}`,
			wantStatus: model.TaskStatusInProgress,
		},
	}

	adaptor := &TaskAdaptor{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := adaptor.ParseTaskResult([]byte(tc.body))
			require.NoError(t, err)
			assert.Equal(t, tc.wantStatus, got.Status)
			if tc.wantReason != "" {
				assert.Equal(t, tc.wantReason, got.Reason)
			}
		})
	}
}

func TestConvertToRequestPayloadForwardsAutoDuration(t *testing.T) {
	cases := []struct {
		name         string
		seconds      string
		wantDuration *int
	}{
		{"auto sentinel is forwarded", "-1", intPtr(relaycommon.AutoTaskDurationSeconds)},
		{"explicit length is forwarded", "30", intPtr(30)},
		{"unset is omitted", "", nil},
		{"zero is omitted", "0", nil},
	}

	adaptor := &TaskAdaptor{}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			payload, err := adaptor.convertToRequestPayload(&relaycommon.TaskSubmitReq{
				Model:   "doubao-seedance-2-5-260628",
				Prompt:  "a cat",
				Seconds: tc.seconds,
			})
			require.NoError(t, err)
			if tc.wantDuration == nil {
				assert.Nil(t, payload.Duration)
				return
			}
			require.NotNil(t, payload.Duration)
			assert.Equal(t, *tc.wantDuration, int(*payload.Duration))
		})
	}
}

func intPtr(v int) *int {
	return &v
}
