package controller

import (
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

// probeIdentityPrompt 是行为判据的提问。要求只回型号，是为了让回答短到能塞进探测的
// token 上限里，也便于比对；换掉「hi」不额外增加请求次数。
const probeIdentityPrompt = "Answer with only your model name and version, no other words."

// probeReplyMaxTokens 是行为判据回答的 token 上限，够放下型号名即可。
const probeReplyMaxTokens = uint(32)

// probeEvidence 是一条判据结论。Severity 只有 suspect / info 两档：suspect 会把整次
// 判定拉成可疑，info 只作为管理员排查时的上下文，不参与结论。
type probeEvidence struct {
	Signal   string `json:"signal"`
	Severity string `json:"severity"`
	Detail   string `json:"detail"`
}

const (
	evidenceSeveritySuspect = "suspect"
	evidenceSeverityInfo    = "info"
)

// modelFamilyKeywords 把模型名归到厂商家族。行为判据只在「家族」这一粒度上比对：
// 让模型自报小版本号并不可靠（它往往不知道自己是 0613 还是 1106），但一个真 Claude
// 不会自称 GPT。键是家族名，值是该家族在模型名或自述里可能出现的特征词。
var modelFamilyKeywords = map[string][]string{
	"gpt":      {"gpt", "chatgpt", "o1", "o3", "o4", "codex"},
	"claude":   {"claude", "anthropic", "sonnet", "opus", "haiku"},
	"gemini":   {"gemini", "bard", "palm"},
	"grok":     {"grok", "xai"},
	"deepseek": {"deepseek"},
	"qwen":     {"qwen", "tongyi", "通义"},
	"glm":      {"glm", "chatglm", "zhipu", "智谱"},
	"moonshot": {"moonshot", "kimi"},
	"llama":    {"llama"},
	"mistral":  {"mistral", "mixtral"},
	"doubao":   {"doubao", "seed", "豆包"},
	"ernie":    {"ernie", "wenxin", "文心"},
	"hunyuan":  {"hunyuan", "混元"},
	"minimax":  {"minimax", "abab"},
	"step":     {"step-", "stepfun", "阶跃"},
	"yi":       {"yi-", "01-ai", "零一"},
	"spark":    {"spark", "xunfei", "讯飞", "星火"},
}

// modelDateSuffix 匹配厂商挂在模型名后面的日期/版本后缀，比对家族时要先剥掉。
var modelDateSuffix = regexp.MustCompile(`[-_](\d{4}|\d{6}|\d{8}|\d{4}-\d{2}-\d{2}|latest|preview|exp)$`)

// detectModelFamily 判断模型名或一段自述文本属于哪个厂商家族，认不出来返回空字符串。
func detectModelFamily(text string) string {
	lowered := strings.ToLower(text)
	best := ""
	bestLen := 0
	for family, keywords := range modelFamilyKeywords {
		for _, kw := range keywords {
			// 取最长匹配，避免 "gpt" 抢掉 "chatgpt" 之外的更具体特征词。
			if strings.Contains(lowered, kw) && len(kw) > bestLen {
				best = family
				bestLen = len(kw)
			}
		}
	}
	return best
}

// normalizeModelName 去掉日期后缀与分隔符差异，用于宽松比对模型名。
func normalizeModelName(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	normalized = strings.TrimPrefix(normalized, "models/")
	// 上游可能带上部署前缀，例如 "azure/gpt-4o"。
	if idx := strings.LastIndex(normalized, "/"); idx >= 0 {
		normalized = normalized[idx+1:]
	}
	normalized = modelDateSuffix.ReplaceAllString(normalized, "")
	return strings.ReplaceAll(normalized, "_", "-")
}

// extractUpstreamFacts 从测试响应里读出可核对的字段。解析失败不算错误——只是这次
// 拿不到判据，真实性会判成 unknown 而不是可疑。
func extractUpstreamFacts(respBody []byte, isStream bool, usage *dto.Usage) *upstreamFacts {
	facts := &upstreamFacts{}
	if usage != nil {
		facts.PromptTokens = usage.PromptTokens
		facts.CompletionTokens = usage.CompletionTokens
	}
	if len(respBody) == 0 {
		return facts
	}
	if isStream {
		parseStreamFacts(respBody, facts)
		return facts
	}
	parseJSONFacts(respBody, facts)
	return facts
}

// upstreamResponseShape 覆盖 OpenAI chat / Claude messages / Gemini 三种响应外形里
// 我们要读的字段，缺的字段留零值。
type upstreamResponseShape struct {
	Id                string `json:"id"`
	Model             string `json:"model"`
	SystemFingerprint string `json:"system_fingerprint"`
	Choices           []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	// Claude 的文本在 content[].text。
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
	// Gemini 的文本在 candidates[].content.parts[].text。
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	ModelVersion string `json:"modelVersion"`
}

func (shape *upstreamResponseShape) replyText() string {
	var parts []string
	for _, choice := range shape.Choices {
		if choice.Message.Content != "" {
			parts = append(parts, choice.Message.Content)
		}
		if choice.Delta.Content != "" {
			parts = append(parts, choice.Delta.Content)
		}
	}
	for _, block := range shape.Content {
		if block.Text != "" {
			parts = append(parts, block.Text)
		}
	}
	for _, candidate := range shape.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.Text != "" {
				parts = append(parts, part.Text)
			}
		}
	}
	return strings.Join(parts, "")
}

func parseJSONFacts(respBody []byte, facts *upstreamFacts) {
	var shape upstreamResponseShape
	if err := common.Unmarshal(respBody, &shape); err != nil {
		return
	}
	facts.ResponseId = shape.Id
	facts.SystemFingerprint = shape.SystemFingerprint
	facts.ReportedModel = shape.Model
	if facts.ReportedModel == "" {
		facts.ReportedModel = shape.ModelVersion
	}
	facts.ReplyText = shape.replyText()
}

// parseStreamFacts 把 SSE 的 data 行逐条解析后合并：模型名与 id 取第一条拿到的，
// 正文按 delta 顺序拼接。
func parseStreamFacts(respBody []byte, facts *upstreamFacts) {
	var reply strings.Builder
	for _, line := range strings.Split(string(respBody), "\n") {
		payload := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "data:"))
		if payload == "" || payload == "[DONE]" || !strings.HasPrefix(payload, "{") {
			continue
		}
		var shape upstreamResponseShape
		if err := common.UnmarshalJsonStr(payload, &shape); err != nil {
			continue
		}
		if facts.ResponseId == "" {
			facts.ResponseId = shape.Id
		}
		if facts.SystemFingerprint == "" {
			facts.SystemFingerprint = shape.SystemFingerprint
		}
		if facts.ReportedModel == "" {
			facts.ReportedModel = shape.Model
			if facts.ReportedModel == "" {
				facts.ReportedModel = shape.ModelVersion
			}
		}
		reply.WriteString(shape.replyText())
	}
	facts.ReplyText = reply.String()
}

// evaluateModelAuthenticity 用三层判据判断上游给的是不是它声称的模型。
//
// 判据本身都不是铁证：正规渠道也会改模型名（Azure 回部署名、OpenAI 把 gpt-4 回成
// gpt-4-0613），模型自述更是众所周知地不可靠。所以这里只在「厂商家族」这个粗粒度上
// 认定可疑——一个真 Claude 不会自称 GPT——并且把每条依据原样记下来，让管理员自己判断，
// 不做自动禁用。
func evaluateModelAuthenticity(requestedModel string, facts *upstreamFacts) (string, []probeEvidence) {
	if facts == nil {
		return model.ProbeVerdictUnknown, nil
	}

	evidence := make([]probeEvidence, 0, 4)
	claimedFamily := detectModelFamily(requestedModel)
	suspect := false

	// 第一层：上游自报的模型名。
	switch {
	case facts.ReportedModel == "":
		evidence = append(evidence, probeEvidence{
			Signal:   "reported_model_missing",
			Severity: evidenceSeverityInfo,
			Detail:   "上游响应里没有模型名，无法据此核对",
		})
	case normalizeModelName(facts.ReportedModel) == normalizeModelName(requestedModel):
		evidence = append(evidence, probeEvidence{
			Signal:   "reported_model_match",
			Severity: evidenceSeverityInfo,
			Detail:   "上游自报的模型名与请求一致：" + facts.ReportedModel,
		})
	default:
		reportedFamily := detectModelFamily(facts.ReportedModel)
		if claimedFamily != "" && reportedFamily != "" && claimedFamily != reportedFamily {
			suspect = true
			evidence = append(evidence, probeEvidence{
				Signal:   "reported_model_family_mismatch",
				Severity: evidenceSeveritySuspect,
				Detail:   "请求 " + requestedModel + "，上游自报 " + facts.ReportedModel + "，不是同一家族",
			})
		} else {
			evidence = append(evidence, probeEvidence{
				Signal:   "reported_model_differs",
				Severity: evidenceSeverityInfo,
				Detail:   "上游自报 " + facts.ReportedModel + "，与请求的 " + requestedModel + " 不同名但属同一家族或无法归类",
			})
		}
	}

	// 第二层：响应结构指纹。只作为上下文，不单独定罪——网关改写响应外形太常见了。
	if facts.ResponseId == "" {
		evidence = append(evidence, probeEvidence{
			Signal:   "response_id_missing",
			Severity: evidenceSeverityInfo,
			Detail:   "上游没有返回响应 id，多见于中转网关自行拼装响应",
		})
	}
	if claimedFamily == "gpt" && facts.SystemFingerprint == "" {
		evidence = append(evidence, probeEvidence{
			Signal:   "system_fingerprint_missing",
			Severity: evidenceSeverityInfo,
			Detail:   "声称是 OpenAI 家族却没有 system_fingerprint",
		})
	}
	if facts.PromptTokens <= 0 || facts.CompletionTokens <= 0 {
		evidence = append(evidence, probeEvidence{
			Signal:   "usage_incomplete",
			Severity: evidenceSeverityInfo,
			Detail:   "上游没有返回完整的 token 用量",
		})
	}

	// 第三层：行为判据，看模型自己说它是谁。
	spokenFamily := detectModelFamily(facts.ReplyText)
	switch {
	case strings.TrimSpace(facts.ReplyText) == "":
		evidence = append(evidence, probeEvidence{
			Signal:   "identity_reply_empty",
			Severity: evidenceSeverityInfo,
			Detail:   "模型没有回答自我识别问题",
		})
	case spokenFamily == "":
		evidence = append(evidence, probeEvidence{
			Signal:   "identity_reply_unrecognized",
			Severity: evidenceSeverityInfo,
			Detail:   "模型自述里认不出厂商家族：" + common.LocalLogPreview(facts.ReplyText),
		})
	case claimedFamily != "" && spokenFamily != claimedFamily:
		suspect = true
		evidence = append(evidence, probeEvidence{
			Signal:   "identity_reply_family_mismatch",
			Severity: evidenceSeveritySuspect,
			Detail:   "请求 " + requestedModel + "，模型自述像 " + spokenFamily + " 家族：" + common.LocalLogPreview(facts.ReplyText),
		})
	default:
		evidence = append(evidence, probeEvidence{
			Signal:   "identity_reply_match",
			Severity: evidenceSeverityInfo,
			Detail:   "模型自述与声称的家族一致：" + common.LocalLogPreview(facts.ReplyText),
		})
	}

	if suspect {
		return model.ProbeVerdictSuspect, evidence
	}
	// 声称的家族都认不出来时，两层比对都无从下手，别给出「可信」的错觉。
	if claimedFamily == "" {
		return model.ProbeVerdictUnknown, evidence
	}
	return model.ProbeVerdictTrusted, evidence
}
