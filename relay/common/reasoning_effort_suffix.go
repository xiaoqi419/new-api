package common

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/QuantumNous/new-api/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/reasoning"
	"github.com/QuantumNous/new-api/setting/model_setting"
)

// ReasoningEffortModelSuffixBody applies the channel's explicit wire-format
// convention after adaptor conversion and parameter overrides. Billing identity
// and the original request remain untouched. Raw JSON values preserve unknown
// passthrough fields and numeric precision.
func ReasoningEffortModelSuffixBody(info *RelayInfo, body io.Reader) (io.Reader, error) {
	if info == nil || info.ChannelMeta == nil || !info.ChannelSetting.ReasoningEffortToModelSuffix || body == nil {
		return body, nil
	}
	if info.RelayMode != relayconstant.RelayModeChatCompletions && info.RelayMode != relayconstant.RelayModeResponses {
		return body, nil
	}
	payload, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := common.Unmarshal(payload, &fields); err != nil {
		return nil, reasoning.AsClientError(fmt.Errorf("invalid reasoning request body: %w", err))
	}
	var reasoningFields map[string]json.RawMessage
	effortValue := fields["reasoning_effort"]
	if info.RelayMode == relayconstant.RelayModeResponses {
		if value := fields["reasoning"]; len(value) > 0 && string(value) != "null" {
			if err := common.Unmarshal(value, &reasoningFields); err != nil {
				return nil, reasoning.AsClientError(fmt.Errorf("reasoning must be an object: %w", err))
			}
		}
		effortValue = reasoningFields["effort"]
	}
	if len(effortValue) == 0 || string(effortValue) == "null" {
		return bytes.NewReader(payload), nil
	}
	var effort string
	if err := common.Unmarshal(effortValue, &effort); err != nil {
		return nil, reasoning.AsClientError(fmt.Errorf("reasoning effort must be a string"))
	}
	if effort == "" {
		return bytes.NewReader(payload), nil
	}
	if err := ValidateReasoningEffort(effort); err != nil {
		return nil, err
	}
	var model string
	if err := common.Unmarshal(fields["model"], &model); err != nil || model == "" {
		return nil, reasoning.AsClientError(fmt.Errorf("model must be a non-empty string"))
	}
	if info.IsModelMapped && (info.ChannelSetting.PassThroughBodyEnabled || model_setting.GetGlobalSettings().PassThroughRequestEnabled) {
		model = info.UpstreamModelName
	}
	// Replace an existing recognized effort tail instead of stacking suffixes.
	for _, tail := range []string{"none", "minimal", "low", "medium", "high", "xhigh", "max"} {
		if strings.HasSuffix(model, "-"+tail) {
			model = strings.TrimSuffix(model, "-"+tail)
			break
		}
	}
	model += "-" + effort
	fields["model"], err = common.Marshal(model)
	if err != nil {
		return nil, err
	}
	if info.RelayMode == relayconstant.RelayModeResponses {
		delete(reasoningFields, "effort")
		if len(reasoningFields) == 0 {
			delete(fields, "reasoning")
		} else {
			fields["reasoning"], err = common.Marshal(reasoningFields)
			if err != nil {
				return nil, err
			}
		}
	} else {
		delete(fields, "reasoning_effort")
	}
	payload, err = common.Marshal(fields)
	if err != nil {
		return nil, err
	}
	info.UpstreamModelName = model
	info.SetReasoningEffort(effort)
	return bytes.NewReader(payload), nil
}

// ValidateReasoningEffort validates the optional OpenAI reasoning strength.
func ValidateReasoningEffort(effort string) error {
	switch effort {
	case "", "none", "minimal", "low", "medium", "high", "xhigh", "max":
		return nil
	default:
		return reasoning.AsClientError(fmt.Errorf("invalid reasoning effort %q: expected none, minimal, low, medium, high, xhigh, or max", effort))
	}
}
