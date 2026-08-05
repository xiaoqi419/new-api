package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func hasEvidenceSignal(evidence []probeEvidence, signal string) bool {
	for _, item := range evidence {
		if item.Signal == signal {
			return true
		}
	}
	return false
}

// 真实性判定只在「厂商家族」这一粒度上认定可疑。这个边界决定了误报率，正规渠道改写
// 模型名（Azure 部署名、OpenAI 补日期后缀）必须仍然判为可信。
func TestEvaluateModelAuthenticityVerdicts(t *testing.T) {
	cases := []struct {
		name            string
		requestedModel  string
		facts           *upstreamFacts
		expectedVerdict string
		expectedSignal  string
	}{
		{
			name:           "上游自报同名且自述一致时可信",
			requestedModel: "gpt-4o",
			facts: &upstreamFacts{
				ReportedModel:     "gpt-4o",
				ResponseId:        "chatcmpl-123",
				SystemFingerprint: "fp_abc",
				PromptTokens:      12,
				CompletionTokens:  5,
				ReplyText:         "GPT-4o",
			},
			expectedVerdict: model.ProbeVerdictTrusted,
			expectedSignal:  "reported_model_match",
		},
		{
			name:           "OpenAI 补日期后缀不算异常",
			requestedModel: "gpt-4o",
			facts: &upstreamFacts{
				ReportedModel:    "gpt-4o-2024-08-06",
				ResponseId:       "chatcmpl-123",
				PromptTokens:     12,
				CompletionTokens: 5,
				ReplyText:        "I am GPT-4o",
			},
			expectedVerdict: model.ProbeVerdictTrusted,
		},
		{
			name:           "Azure 返回部署名前缀不算异常",
			requestedModel: "gpt-4o",
			facts: &upstreamFacts{
				ReportedModel:    "azure/gpt-4o",
				ResponseId:       "chatcmpl-123",
				PromptTokens:     12,
				CompletionTokens: 5,
				ReplyText:        "GPT-4o",
			},
			expectedVerdict: model.ProbeVerdictTrusted,
		},
		{
			name:           "上游自报跨家族的模型名判可疑",
			requestedModel: "claude-3-5-sonnet",
			facts: &upstreamFacts{
				ReportedModel:    "gpt-3.5-turbo",
				ResponseId:       "chatcmpl-123",
				PromptTokens:     12,
				CompletionTokens: 5,
				ReplyText:        "I am ChatGPT",
			},
			expectedVerdict: model.ProbeVerdictSuspect,
			expectedSignal:  "reported_model_family_mismatch",
		},
		{
			name:           "模型名对得上但自述跨家族仍判可疑",
			requestedModel: "claude-3-5-sonnet",
			facts: &upstreamFacts{
				ReportedModel:    "claude-3-5-sonnet",
				ResponseId:       "chatcmpl-123",
				PromptTokens:     12,
				CompletionTokens: 5,
				ReplyText:        "I am ChatGPT, a large language model trained by OpenAI",
			},
			expectedVerdict: model.ProbeVerdictSuspect,
			expectedSignal:  "identity_reply_family_mismatch",
		},
		{
			name:           "认不出请求模型属于哪个家族时不下可信结论",
			requestedModel: "some-private-model-v2",
			facts: &upstreamFacts{
				ReportedModel:    "some-private-model-v2",
				ResponseId:       "chatcmpl-123",
				PromptTokens:     12,
				CompletionTokens: 5,
				ReplyText:        "internal assistant",
			},
			expectedVerdict: model.ProbeVerdictUnknown,
		},
		{
			name:           "结构指纹缺失只作上下文,不单独定罪",
			requestedModel: "gpt-4o",
			facts: &upstreamFacts{
				ReportedModel: "gpt-4o",
				ReplyText:     "GPT-4o",
			},
			expectedVerdict: model.ProbeVerdictTrusted,
			expectedSignal:  "response_id_missing",
		},
		{
			name:            "完全拿不到事实时判未知",
			requestedModel:  "gpt-4o",
			facts:           nil,
			expectedVerdict: model.ProbeVerdictUnknown,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			verdict, evidence := evaluateModelAuthenticity(tc.requestedModel, tc.facts)
			assert.Equal(t, tc.expectedVerdict, verdict)
			if tc.expectedSignal != "" {
				assert.True(t, hasEvidenceSignal(evidence, tc.expectedSignal),
					"缺少判据 %s，实际判据：%+v", tc.expectedSignal, evidence)
			}
		})
	}
}

// 判为可疑时必须至少留下一条 suspect 级依据，否则告警内容会是空的。
func TestSuspectVerdictAlwaysCarriesSuspectEvidence(t *testing.T) {
	verdict, evidence := evaluateModelAuthenticity("claude-3-5-sonnet", &upstreamFacts{
		ReportedModel: "gemini-1.5-pro",
		ReplyText:     "Gemini",
	})
	require.Equal(t, model.ProbeVerdictSuspect, verdict)

	suspectCount := 0
	for _, item := range evidence {
		if item.Severity == evidenceSeveritySuspect {
			suspectCount++
		}
	}
	assert.Positive(t, suspectCount)
}

func TestNormalizeModelName(t *testing.T) {
	cases := map[string]string{
		"gpt-4o":                   "gpt-4o",
		"GPT-4O":                   "gpt-4o",
		"gpt-4o-2024-08-06":        "gpt-4o",
		"models/gemini-1.5":        "gemini-1.5",
		"azure/gpt-4o":             "gpt-4o",
		"claude-3-5-sonnet-latest": "claude-3-5-sonnet",
		"deepseek_chat":            "deepseek-chat",
	}
	for input, expected := range cases {
		assert.Equal(t, expected, normalizeModelName(input), "输入 %s", input)
	}
}

func TestDetectModelFamily(t *testing.T) {
	cases := map[string]string{
		"gpt-4o":             "gpt",
		"I am ChatGPT":       "gpt",
		"claude-3-5-sonnet":  "claude",
		"我是通义千问":             "qwen",
		"gemini-2.0-flash":   "gemini",
		"deepseek-chat":      "deepseek",
		"some-private-model": "",
	}
	for input, expected := range cases {
		assert.Equal(t, expected, detectModelFamily(input), "输入 %s", input)
	}
}

// 探测要能从三种主流响应外形里读出模型名和正文，读不出来会退化成「未知」而不是误报。
func TestExtractUpstreamFactsResponseShapes(t *testing.T) {
	usage := &dto.Usage{PromptTokens: 11, CompletionTokens: 3}

	t.Run("OpenAI chat", func(t *testing.T) {
		body := []byte(`{"id":"chatcmpl-1","model":"gpt-4o","system_fingerprint":"fp_1",` +
			`"choices":[{"message":{"role":"assistant","content":"GPT-4o"}}]}`)
		facts := extractUpstreamFacts(body, false, usage)
		require.NotNil(t, facts)
		assert.Equal(t, "gpt-4o", facts.ReportedModel)
		assert.Equal(t, "chatcmpl-1", facts.ResponseId)
		assert.Equal(t, "fp_1", facts.SystemFingerprint)
		assert.Equal(t, "GPT-4o", facts.ReplyText)
		assert.Equal(t, 11, facts.PromptTokens)
	})

	t.Run("Claude messages", func(t *testing.T) {
		body := []byte(`{"id":"msg_1","model":"claude-3-5-sonnet-20241022",` +
			`"content":[{"type":"text","text":"Claude 3.5 Sonnet"}]}`)
		facts := extractUpstreamFacts(body, false, usage)
		require.NotNil(t, facts)
		assert.Equal(t, "claude-3-5-sonnet-20241022", facts.ReportedModel)
		assert.Equal(t, "Claude 3.5 Sonnet", facts.ReplyText)
	})

	t.Run("Gemini", func(t *testing.T) {
		body := []byte(`{"modelVersion":"gemini-2.0-flash",` +
			`"candidates":[{"content":{"parts":[{"text":"Gemini 2.0 Flash"}]}}]}`)
		facts := extractUpstreamFacts(body, false, usage)
		require.NotNil(t, facts)
		assert.Equal(t, "gemini-2.0-flash", facts.ReportedModel)
		assert.Equal(t, "Gemini 2.0 Flash", facts.ReplyText)
	})

	t.Run("SSE 流式按 delta 拼接", func(t *testing.T) {
		body := []byte("data: {\"id\":\"chatcmpl-2\",\"model\":\"gpt-4o\",\"choices\":[{\"delta\":{\"content\":\"GPT\"}}]}\n\n" +
			"data: {\"choices\":[{\"delta\":{\"content\":\"-4o\"}}]}\n\n" +
			"data: [DONE]\n")
		facts := extractUpstreamFacts(body, true, usage)
		require.NotNil(t, facts)
		assert.Equal(t, "gpt-4o", facts.ReportedModel)
		assert.Equal(t, "chatcmpl-2", facts.ResponseId)
		assert.Equal(t, "GPT-4o", facts.ReplyText)
	})

	t.Run("响应体不是 JSON 时只保留用量", func(t *testing.T) {
		facts := extractUpstreamFacts([]byte("upstream gateway error"), false, usage)
		require.NotNil(t, facts)
		assert.Empty(t, facts.ReportedModel)
		assert.Equal(t, 11, facts.PromptTokens)
	})
}
