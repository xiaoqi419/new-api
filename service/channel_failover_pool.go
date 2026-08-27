package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// selectChannelFailoverPool applies an enabled group's positive allowlist. It
// returns managed=false only when the group has no enabled pools, preserving
// the original selector for every unmanaged request.
func selectChannelFailoverPool(param *RetryParam) (*model.Channel, bool, error) {
	if param == nil || param.Ctx == nil || !IsChannelFailoverPoolTextRequest(param.Ctx) {
		return nil, false, nil
	}
	if poolID := common.GetContextKeyString(param.Ctx, constant.ContextKeyChannelFailoverPoolID); poolID != "" {
		allowed, ok := common.GetContextKey(param.Ctx, constant.ContextKeyChannelFailoverPoolAllowedIDs)
		if !ok {
			return nil, true, fmt.Errorf("channel failover pool %s lost its request boundary", poolID)
		}
		allowedIDs, ok := allowed.(map[int]struct{})
		if !ok {
			return nil, true, fmt.Errorf("channel failover pool %s has an invalid request boundary", poolID)
		}
		channelType, ok := common.GetContextKey(param.Ctx, constant.ContextKeyChannelFailoverPoolType)
		if !ok {
			return nil, true, fmt.Errorf("channel failover pool %s lost its channel type", poolID)
		}
		typeValue, ok := channelType.(int)
		if !ok {
			return nil, true, fmt.Errorf("channel failover pool %s has an invalid channel type", poolID)
		}
		channel, err := model.GetRandomSatisfiedChannelFiltered(param.TokenGroup, param.ModelName, 0, param.RequestPath, model.ChannelSelectionFilter{
			AllowedChannelIDs:  allowedIDs,
			ExcludedChannelIDs: channelFailoverPoolExcludedChannels(param.Ctx),
			ChannelType:        typeValue,
			RequireChannelType: true,
		})
		return channel, true, err
	}

	pools := operation_setting.GetChannelRoutingPoolSetting().Pools
	allowedIDs := make(map[int]struct{})
	expectedTypes := make(map[int]int)
	managed := false
	for _, pool := range pools {
		if !pool.Enabled || pool.Group != param.TokenGroup {
			continue
		}
		managed = true
		for _, channelID := range pool.ChannelIDs {
			allowedIDs[channelID] = struct{}{}
			expectedTypes[channelID] = pool.ChannelType
		}
	}
	if !managed {
		return nil, false, nil
	}
	channel, err := model.GetRandomSatisfiedChannelFiltered(param.TokenGroup, param.ModelName, 0, param.RequestPath, model.ChannelSelectionFilter{
		AllowedChannelIDs:    allowedIDs,
		ExpectedChannelTypes: expectedTypes,
	})
	if err != nil || channel == nil {
		return channel, true, err
	}
	_, locked := LockChannelFailoverPoolForSelectedChannel(param.Ctx, param.TokenGroup, channel)
	if locked {
		return channel, true, nil
	}
	return nil, true, fmt.Errorf("selected channel %d is not a valid member of an enabled failover pool", channel.Id)
}

// LockChannelFailoverPoolForSelectedChannel applies the request-local
// boundary for an affinity-selected channel. A managed group may only accept a
// channel that is a member of an enabled pool with the same channel type.
// The two results distinguish unmanaged groups from managed groups that reject
// the candidate, so callers can safely fall back to normal pool selection.
func LockChannelFailoverPoolForSelectedChannel(c *gin.Context, group string, channel *model.Channel) (managed bool, locked bool) {
	if c == nil || !IsChannelFailoverPoolTextRequest(c) {
		return false, false
	}
	for _, pool := range operation_setting.GetChannelRoutingPoolSetting().Pools {
		if !pool.Enabled || pool.Group != group {
			continue
		}
		managed = true
		if channel == nil || pool.ChannelType != channel.Type {
			continue
		}
		for _, channelID := range pool.ChannelIDs {
			if channelID != channel.Id {
				continue
			}
			common.SetContextKey(c, constant.ContextKeyChannelFailoverPoolID, pool.ID)
			common.SetContextKey(c, constant.ContextKeyChannelFailoverPoolType, pool.ChannelType)
			common.SetContextKey(c, constant.ContextKeyChannelFailoverPoolAllowedIDs, poolChannelIDSet(pool.ChannelIDs))
			return true, true
		}
	}
	return managed, false
}

func poolChannelIDSet(channelIDs []int) map[int]struct{} {
	allowed := make(map[int]struct{}, len(channelIDs))
	for _, channelID := range channelIDs {
		allowed[channelID] = struct{}{}
	}
	return allowed
}

func channelFailoverPoolExcludedChannels(c *gin.Context) map[int]struct{} {
	if existing, found := common.GetContextKey(c, constant.ContextKeyChannelFailoverPoolExcludedIDs); found {
		if excluded, ok := existing.(map[int]struct{}); ok {
			return excluded
		}
	}
	excluded := make(map[int]struct{})
	common.SetContextKey(c, constant.ContextKeyChannelFailoverPoolExcludedIDs, excluded)
	return excluded
}

// RecordChannelFailoverPoolFailure is request-local. It never updates the
// original API-key group-switch state, so a pool retry cannot advance groups.
func RecordChannelFailoverPoolFailure(c *gin.Context, channelID int) {
	if c == nil || channelID <= 0 || common.GetContextKeyString(c, constant.ContextKeyChannelFailoverPoolID) == "" {
		return
	}
	channelFailoverPoolExcludedChannels(c)[channelID] = struct{}{}
}

func IsChannelFailoverPoolTextRequest(c *gin.Context) bool {
	if c == nil {
		return false
	}
	return common.GetContextKeyBool(c, constant.ContextKeyChannelFailoverPoolTextRequest)
}

func IsChannelFailoverPoolRequest(c *gin.Context) bool {
	return IsChannelFailoverPoolTextRequest(c) && common.GetContextKeyString(c, constant.ContextKeyChannelFailoverPoolID) != ""
}

func IsChannelFailoverPoolFailoverRequest(c *gin.Context) bool {
	return IsChannelFailoverPoolRequest(c) && !c.Writer.Written()
}

// SetChannelFailoverPoolTextRequestEligibility records the request scope once.
// It is intentionally usable by both distributor middleware and the relay
// controller, which must make the same fail-closed decision before selection
// and retry handling respectively.
func SetChannelFailoverPoolTextRequestEligibility(c *gin.Context) {
	if c == nil {
		return
	}
	common.SetContextKey(c, constant.ContextKeyChannelFailoverPoolTextRequest, channelFailoverPoolRequestIsText(c))
}

func channelFailoverPoolRequestIsText(c *gin.Context) bool {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return false
	}
	mediaType, _, err := mime.ParseMediaType(c.Request.Header.Get("Content-Type"))
	if err != nil || !strings.EqualFold(mediaType, "application/json") || !channelFailoverPoolRequestIsSynchronous(c) {
		return false
	}

	path := c.Request.URL.Path
	switch {
	case path == "/v1/chat/completions", path == "/v1/completions", path == "/v1/moderations":
		request := &dto.GeneralOpenAIRequest{}
		return common.UnmarshalBodyReusable(c, request) == nil && channelFailoverPoolChatRequestIsText(request)
	case path == "/v1/messages":
		request := &dto.ClaudeRequest{}
		return common.UnmarshalBodyReusable(c, request) == nil && channelFailoverPoolClaudeRequestIsText(request)
	case path == "/v1/responses":
		request := &dto.OpenAIResponsesRequest{}
		return common.UnmarshalBodyReusable(c, request) == nil && channelFailoverPoolResponsesRequestIsText(request)
	case path == "/v1/responses/compact":
		request := &dto.OpenAIResponsesCompactionRequest{}
		return common.UnmarshalBodyReusable(c, request) == nil && channelFailoverPoolResponsesCompactionRequestIsText(request)
	case path == "/v1/embeddings":
		request := &dto.EmbeddingRequest{}
		return common.UnmarshalBodyReusable(c, request) == nil && channelFailoverPoolTextValue(request.Input)
	case path == "/v1/rerank":
		request := &dto.RerankRequest{}
		return common.UnmarshalBodyReusable(c, request) == nil && channelFailoverPoolRerankRequestIsText(request)
	case strings.HasSuffix(path, ":batchEmbedContents"):
		return false
	case strings.HasSuffix(path, ":embedContent"):
		request := &dto.GeminiEmbeddingRequest{}
		return common.UnmarshalBodyReusable(c, request) == nil && channelFailoverPoolGeminiContentIsText(request.Content)
	case strings.HasSuffix(path, ":generateContent"), strings.HasSuffix(path, ":streamGenerateContent"):
		request := &dto.GeminiChatRequest{}
		return common.UnmarshalBodyReusable(c, request) == nil && channelFailoverPoolGeminiRequestIsText(request)
	}
	return false
}

func channelFailoverPoolRequestIsSynchronous(c *gin.Context) bool {
	var envelope struct {
		Background json.RawMessage `json:"background"`
		Async      json.RawMessage `json:"async"`
		Batch      json.RawMessage `json:"batch"`
		Requests   json.RawMessage `json:"requests"`
	}
	if err := common.UnmarshalBodyReusable(c, &envelope); err != nil {
		return false
	}
	return channelFailoverPoolOptionalBooleanIsFalse(envelope.Background) &&
		channelFailoverPoolOptionalBooleanIsFalse(envelope.Async) &&
		channelFailoverPoolOptionalBooleanIsFalse(envelope.Batch) &&
		(len(envelope.Requests) == 0 || common.GetJsonType(envelope.Requests) == "null")
}

func channelFailoverPoolOptionalBooleanIsFalse(value json.RawMessage) bool {
	if len(value) == 0 || common.GetJsonType(value) == "null" {
		return true
	}
	if common.GetJsonType(value) != "boolean" {
		return false
	}
	var enabled bool
	return common.Unmarshal(value, &enabled) == nil && !enabled
}

func channelFailoverPoolTextValue(value any) bool {
	switch value := value.(type) {
	case nil, string, []string:
		return true
	case []any:
		for _, item := range value {
			if _, ok := item.(string); !ok {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func channelFailoverPoolChatContentItemIsText(item any) bool {
	switch item := item.(type) {
	case dto.MediaContent:
		return item.Type == dto.ContentTypeText && item.ImageUrl == nil && item.InputAudio == nil && item.File == nil && item.VideoUrl == nil
	case *dto.MediaContent:
		return item != nil && item.Type == dto.ContentTypeText && item.ImageUrl == nil && item.InputAudio == nil && item.File == nil && item.VideoUrl == nil
	case map[string]any:
		contentType, ok := item["type"].(string)
		if !ok || contentType != dto.ContentTypeText {
			return false
		}
		if _, ok := item["text"].(string); !ok {
			return false
		}
		for _, field := range []string{"image_url", "input_audio", "file", "video_url"} {
			if value, exists := item[field]; exists && value != nil {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func channelFailoverPoolChatRequestIsText(request *dto.GeneralOpenAIRequest) bool {
	if request == nil || !channelFailoverPoolTextValue(request.Prompt) || !channelFailoverPoolTextValue(request.Prefix) ||
		!channelFailoverPoolTextValue(request.Suffix) || !channelFailoverPoolTextValue(request.Input) {
		return false
	}
	if request.ReturnImages != nil && *request.ReturnImages {
		return false
	}
	if len(request.Audio) > 0 && common.GetJsonType(request.Audio) != "null" {
		return false
	}
	if len(request.Modalities) > 0 && common.GetJsonType(request.Modalities) != "null" {
		var modalities []string
		if common.GetJsonType(request.Modalities) != "array" || common.Unmarshal(request.Modalities, &modalities) != nil || len(modalities) == 0 {
			return false
		}
		for _, modality := range modalities {
			if modality != "text" {
				return false
			}
		}
	}
	for _, message := range request.Messages {
		switch content := message.Content.(type) {
		case nil, string:
		case []any:
			for _, item := range content {
				if !channelFailoverPoolChatContentItemIsText(item) {
					return false
				}
			}
		case []dto.MediaContent:
			for _, item := range content {
				if !channelFailoverPoolChatContentItemIsText(item) {
					return false
				}
			}
		default:
			return false
		}
	}
	return true
}

func channelFailoverPoolClaudeRequestIsText(request *dto.ClaudeRequest) bool {
	if request == nil || !channelFailoverPoolClaudeContentIsText(request.System) {
		return false
	}
	for _, message := range request.Messages {
		if !channelFailoverPoolClaudeContentIsText(message.Content) {
			return false
		}
	}
	return true
}

func channelFailoverPoolClaudeContentIsText(content any) bool {
	switch content := content.(type) {
	case nil, string:
		return true
	case []any:
		for _, item := range content {
			block, ok := item.(map[string]any)
			if !ok || block["type"] != dto.ContentTypeText {
				return false
			}
			if _, ok := block["text"].(string); !ok {
				return false
			}
		}
		return true
	default:
		return false
	}
}

type channelFailoverPoolResponsesInputItem struct {
	Type    string          `json:"type"`
	Content json.RawMessage `json:"content"`
	Text    *string         `json:"text"`
}

func channelFailoverPoolResponsesContentIsText(content json.RawMessage) bool {
	switch common.GetJsonType(content) {
	case "string":
		var text string
		return common.Unmarshal(content, &text) == nil
	case "array":
		var parts []json.RawMessage
		if common.Unmarshal(content, &parts) != nil {
			return false
		}
		for _, rawPart := range parts {
			var part channelFailoverPoolResponsesInputItem
			if common.GetJsonType(rawPart) != "object" || common.Unmarshal(rawPart, &part) != nil || part.Type != "input_text" || part.Text == nil {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func channelFailoverPoolResponsesRequestIsText(request *dto.OpenAIResponsesRequest) bool {
	if request == nil || !channelFailoverPoolResponsesToolsAreTextOnly(request.Tools) {
		return false
	}
	switch common.GetJsonType(request.Input) {
	case "string":
		var text string
		return common.Unmarshal(request.Input, &text) == nil
	case "array":
		var inputs []json.RawMessage
		if common.Unmarshal(request.Input, &inputs) != nil {
			return false
		}
		for _, rawInput := range inputs {
			if common.GetJsonType(rawInput) != "object" {
				return false
			}
			var input channelFailoverPoolResponsesInputItem
			if common.Unmarshal(rawInput, &input) != nil {
				return false
			}
			switch input.Type {
			case "input_text":
				if input.Text == nil {
					return false
				}
			case "", "message", "easy_input_message":
				if !channelFailoverPoolResponsesContentIsText(input.Content) {
					return false
				}
			default:
				return false
			}
		}
		return true
	default:
		return false
	}
}

func channelFailoverPoolResponsesCompactionRequestIsText(request *dto.OpenAIResponsesCompactionRequest) bool {
	if request == nil || !channelFailoverPoolResponsesToolsAreTextOnly(request.Tools) {
		return false
	}
	if len(request.Instructions) > 0 && common.GetJsonType(request.Instructions) != "null" {
		var instructions string
		if common.GetJsonType(request.Instructions) != "string" || common.Unmarshal(request.Instructions, &instructions) != nil {
			return false
		}
	}
	if len(request.Input) == 0 || common.GetJsonType(request.Input) == "null" {
		return true
	}
	return channelFailoverPoolResponsesInputIsText(request.Input)
}

func channelFailoverPoolResponsesInputIsText(input json.RawMessage) bool {
	switch common.GetJsonType(input) {
	case "string":
		var text string
		return common.Unmarshal(input, &text) == nil
	case "array":
		var inputs []json.RawMessage
		if common.Unmarshal(input, &inputs) != nil {
			return false
		}
		for _, rawInput := range inputs {
			if common.GetJsonType(rawInput) != "object" {
				return false
			}
			var item channelFailoverPoolResponsesInputItem
			if common.Unmarshal(rawInput, &item) != nil {
				return false
			}
			switch item.Type {
			case "input_text":
				if item.Text == nil {
					return false
				}
			case "", "message", "easy_input_message":
				if !channelFailoverPoolResponsesContentIsText(item.Content) {
					return false
				}
			default:
				return false
			}
		}
		return true
	default:
		return false
	}
}

func channelFailoverPoolResponsesToolsAreTextOnly(tools json.RawMessage) bool {
	if len(tools) == 0 || common.GetJsonType(tools) == "null" {
		return true
	}
	if common.GetJsonType(tools) != "array" {
		return false
	}
	var configuredTools []struct {
		Type string `json:"type"`
	}
	if common.Unmarshal(tools, &configuredTools) != nil {
		return false
	}
	for _, tool := range configuredTools {
		switch tool.Type {
		case "function", "custom", dto.BuildInToolWebSearchPreview, dto.BuildInToolWebSearch, dto.BuildInToolGoogleSearch:
		default:
			return false
		}
	}
	return true
}

func channelFailoverPoolRerankRequestIsText(request *dto.RerankRequest) bool {
	if request == nil {
		return false
	}
	for _, document := range request.Documents {
		switch document := document.(type) {
		case string:
		case map[string]any:
			text, ok := document["text"].(string)
			if !ok || text == "" {
				return false
			}
		default:
			return false
		}
	}
	return true
}

func channelFailoverPoolGeminiRequestIsText(request *dto.GeminiChatRequest) bool {
	if request == nil || len(request.Requests) > 0 || len(request.Contents) == 0 {
		return false
	}
	for _, content := range request.Contents {
		if !channelFailoverPoolGeminiContentIsText(content) {
			return false
		}
	}
	if request.SystemInstructions != nil && !channelFailoverPoolGeminiContentIsText(*request.SystemInstructions) {
		return false
	}
	if len(request.GenerationConfig.ResponseModalities) > 0 {
		for _, modality := range request.GenerationConfig.ResponseModalities {
			if !strings.EqualFold(modality, "text") {
				return false
			}
		}
	}
	return len(request.GenerationConfig.SpeechConfig) == 0 && len(request.GenerationConfig.ImageConfig) == 0
}

func channelFailoverPoolGeminiContentIsText(content dto.GeminiChatContent) bool {
	if len(content.Parts) == 0 {
		return false
	}
	for _, part := range content.Parts {
		if part.Text == "" || part.InlineData != nil || part.FunctionCall != nil || part.FunctionResponse != nil ||
			part.FileData != nil || part.ExecutableCode != nil || part.CodeExecutionResult != nil ||
			len(part.ThoughtSignature) > 0 || len(part.MediaResolution) > 0 || len(part.VideoMetadata) > 0 {
			return false
		}
	}
	return true
}

// ShouldRetryChannelFailoverPool shares configured retry and auto-disable
// matching without consulting the global auto-disable enable switch.
func ShouldRetryChannelFailoverPool(c *gin.Context, apiErr *types.NewAPIError) bool {
	if !IsChannelFailoverPoolFailoverRequest(c) || apiErr == nil || types.IsSkipRetryError(apiErr) {
		return false
	}
	if errors.Is(apiErr.Err, context.Canceled) {
		return false
	}
	if errors.Is(apiErr.Err, context.DeadlineExceeded) {
		return true
	}
	var networkErr net.Error
	if errors.As(apiErr.Err, &networkErr) {
		return true
	}
	if operation_setting.ShouldDisableByStatusCode(apiErr.StatusCode) {
		return true
	}
	lowerMessage := strings.ToLower(apiErr.Error())
	if matches, _ := AcSearch(lowerMessage, operation_setting.AutomaticDisableKeywords, true); matches {
		return true
	}
	if operation_setting.IsAlwaysSkipRetryCode(apiErr.GetErrorCode()) || operation_setting.IsAlwaysSkipRetryStatusCode(apiErr.StatusCode) {
		return false
	}
	if apiErr.StatusCode < 100 || apiErr.StatusCode > 599 {
		return types.IsChannelError(apiErr)
	}
	return operation_setting.ShouldRetryByStatusCode(apiErr.StatusCode)
}
