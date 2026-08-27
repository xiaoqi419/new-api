package service

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func useChannelFailoverPoolSelectionDatabase(t *testing.T) {
	t.Helper()
	originalDB, originalLogDB := model.DB, model.LOG_DB
	originalMainDatabaseType, originalLogDatabaseType := common.MainDatabaseType(), common.LogDatabaseType()
	originalSQLitePath := common.SQLitePath
	originalIsMasterNode := common.IsMasterNode
	common.SQLitePath = fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	common.IsMasterNode = false
	require.NoError(t, model.InitDB())
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}))
	t.Cleanup(func() {
		newDB := model.DB
		model.DB, model.LOG_DB = originalDB, originalLogDB
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		common.SQLitePath = originalSQLitePath
		common.IsMasterNode = originalIsMasterNode
		if sqlDB, err := newDB.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
}

func useChannelFailoverPoolSettingForSelection(t *testing.T, pools []operation_setting.ChannelRoutingPool) {
	t.Helper()
	configured, ok := config.GlobalConfig.Get(operation_setting.ChannelRoutingPoolSettingConfigName).(*operation_setting.ChannelRoutingPoolSetting)
	require.True(t, ok)
	original := operation_setting.GetChannelRoutingPoolSetting()
	configured.Pools = pools
	t.Cleanup(func() { configured.Pools = original.Pools })
}

func addChannelFailoverPoolSelectionChannel(t *testing.T, group, modelName, name string, channelType int, priority int64) *model.Channel {
	t.Helper()
	channel := &model.Channel{
		Name:     name,
		Key:      name + "-key",
		Status:   common.ChannelStatusEnabled,
		Group:    group,
		Models:   modelName,
		Type:     channelType,
		Priority: &priority,
	}
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, model.DB.Create(&model.Ability{Group: group, Model: modelName, ChannelId: channel.Id, Enabled: true}).Error)
	return channel
}

func newChannelFailoverPoolSelectionContext(group string) *gin.Context {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	common.SetContextKey(ctx, constant.ContextKeyChannelFailoverPoolTextRequest, true)
	common.SetContextKey(ctx, constant.ContextKeyGroupSwitchIndex, 7)
	return ctx
}

func TestCacheGetRandomSatisfiedChannelLocksFailoverPoolAndExcludesFailedMember(t *testing.T) {
	const group = "production"
	const modelName = "gpt-pool-test"
	useChannelFailoverPoolSelectionDatabase(t)
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() { common.MemoryCacheEnabled = originalMemoryCacheEnabled })

	primary := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-primary", 1, 20)
	backup := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-backup", 1, 10)
	_ = addChannelFailoverPoolSelectionChannel(t, group, modelName, "unlisted", 1, 30)
	_ = addChannelFailoverPoolSelectionChannel(t, group, modelName, "different-type", 2, 40)
	useChannelFailoverPoolSettingForSelection(t, []operation_setting.ChannelRoutingPool{{
		ID:          "openai-production",
		Name:        "OpenAI production",
		Enabled:     true,
		Group:       group,
		ChannelType: 1,
		ChannelIDs:  []int{primary.Id, backup.Id},
	}})
	model.InitChannelCache()

	ctx := newChannelFailoverPoolSelectionContext(group)
	param := &RetryParam{Ctx: ctx, TokenGroup: group, ModelName: modelName, RequestPath: "/v1/chat/completions", Retry: common.GetPointer(0)}
	first, selectedGroup, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, group, selectedGroup)
	assert.Equal(t, primary.Id, first.Id)
	assert.Equal(t, "openai-production", common.GetContextKeyString(ctx, constant.ContextKeyChannelFailoverPoolID))
	assert.Equal(t, 7, common.GetContextKeyInt(ctx, constant.ContextKeyGroupSwitchIndex))

	RecordChannelFailoverPoolFailure(ctx, first.Id)
	second, selectedGroup, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.NotNil(t, second)
	assert.Equal(t, group, selectedGroup)
	assert.Equal(t, backup.Id, second.Id)
}

func TestCacheGetRandomSatisfiedChannelFailsClosedWhenManagedPoolHasNoEligibleMember(t *testing.T) {
	const group = "production"
	const modelName = "gpt-pool-test"
	useChannelFailoverPoolSelectionDatabase(t)
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() { common.MemoryCacheEnabled = originalMemoryCacheEnabled })

	first := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-disabled-a", 1, 20)
	second := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-disabled-b", 1, 10)
	_ = addChannelFailoverPoolSelectionChannel(t, group, modelName, "unlisted-live", 1, 30)
	useChannelFailoverPoolSettingForSelection(t, []operation_setting.ChannelRoutingPool{{
		ID:          "openai-production",
		Name:        "OpenAI production",
		Enabled:     true,
		Group:       group,
		ChannelType: 1,
		ChannelIDs:  []int{first.Id, second.Id},
	}})
	require.True(t, model.UpdateChannelStatus(first.Id, "", common.ChannelStatusManuallyDisabled, "test"))
	require.True(t, model.UpdateChannelStatus(second.Id, "", common.ChannelStatusManuallyDisabled, "test"))
	model.InitChannelCache()

	ctx := newChannelFailoverPoolSelectionContext(group)
	param := &RetryParam{Ctx: ctx, TokenGroup: group, ModelName: modelName, RequestPath: "/v1/chat/completions", Retry: common.GetPointer(0)}
	channel, selectedGroup, err := CacheGetRandomSatisfiedChannel(param)

	require.Error(t, err)
	assert.Nil(t, channel)
	assert.Equal(t, group, selectedGroup)
}

func TestCacheGetRandomSatisfiedChannelSkipsAutoDisabledPoolMemberUntilRecovery(t *testing.T) {
	const group = "production"
	const modelName = "gpt-pool-test"
	useChannelFailoverPoolSelectionDatabase(t)
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() { common.MemoryCacheEnabled = originalMemoryCacheEnabled })

	primary := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-primary", 1, 20)
	backup := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-backup", 1, 10)
	useChannelFailoverPoolSettingForSelection(t, []operation_setting.ChannelRoutingPool{{
		ID:          "openai-production",
		Name:        "OpenAI production",
		Enabled:     true,
		Group:       group,
		ChannelType: 1,
		ChannelIDs:  []int{primary.Id, backup.Id},
	}})
	model.InitChannelCache()
	require.True(t, model.UpdateChannelStatus(primary.Id, "", common.ChannelStatusAutoDisabled, "test"))

	disabledCtx := newChannelFailoverPoolSelectionContext(group)
	disabledParam := &RetryParam{Ctx: disabledCtx, TokenGroup: group, ModelName: modelName, RequestPath: "/v1/chat/completions", Retry: common.GetPointer(0)}
	selectedWhileDisabled, _, err := CacheGetRandomSatisfiedChannel(disabledParam)
	require.NoError(t, err)
	require.NotNil(t, selectedWhileDisabled)
	assert.Equal(t, backup.Id, selectedWhileDisabled.Id)

	require.True(t, model.UpdateChannelStatus(primary.Id, "", common.ChannelStatusEnabled, "test recovery"))
	recoveredCtx := newChannelFailoverPoolSelectionContext(group)
	recoveredParam := &RetryParam{Ctx: recoveredCtx, TokenGroup: group, ModelName: modelName, RequestPath: "/v1/chat/completions", Retry: common.GetPointer(0)}
	selectedAfterRecovery, _, err := CacheGetRandomSatisfiedChannel(recoveredParam)
	require.NoError(t, err)
	require.NotNil(t, selectedAfterRecovery)
	assert.Equal(t, primary.Id, selectedAfterRecovery.Id)
}

func TestSetChannelFailoverPoolTextRequestEligibility(t *testing.T) {
	tests := []struct {
		name string
		path string
		body string
		want bool
	}{
		{
			name: "chat completions text",
			path: "/v1/chat/completions",
			body: `{"model":"gpt-pool-test","messages":[{"role":"user","content":"hello"}]}`,
			want: true,
		},
		{
			name: "completions text",
			path: "/v1/completions",
			body: `{"model":"gpt-pool-test","prompt":"hello"}`,
			want: true,
		},
		{
			name: "claude messages text",
			path: "/v1/messages",
			body: `{"model":"claude-pool-test","messages":[{"role":"user","content":"hello"}]}`,
			want: true,
		},
		{
			name: "gemini generate content text",
			path: "/v1beta/models/gemini-pool-test:generateContent",
			body: `{"contents":[{"parts":[{"text":"hello"}]}]}`,
			want: true,
		},
		{
			name: "gemini stream generate content text",
			path: "/v1beta/models/gemini-pool-test:streamGenerateContent",
			body: `{"contents":[{"parts":[{"text":"hello"}]}]}`,
			want: true,
		},
		{
			name: "responses text",
			path: "/v1/responses",
			body: `{"model":"gpt-pool-test","input":"hello"}`,
			want: true,
		},
		{
			name: "responses compact text",
			path: "/v1/responses/compact",
			body: `{"model":"gpt-pool-test","input":"hello"}`,
			want: true,
		},
		{
			name: "embeddings text",
			path: "/v1/embeddings",
			body: `{"model":"text-embedding-pool-test","input":["hello","world"]}`,
			want: true,
		},
		{
			name: "gemini embedding text",
			path: "/v1beta/models/gemini-pool-test:embedContent",
			body: `{"content":{"parts":[{"text":"hello"}]}}`,
			want: true,
		},
		{
			name: "rerank text",
			path: "/v1/rerank",
			body: `{"model":"rerank-pool-test","query":"query","documents":["document"]}`,
			want: true,
		},
		{
			name: "moderations text",
			path: "/v1/moderations",
			body: `{"model":"omni-moderation-latest","input":"hello"}`,
			want: true,
		},
		{
			name: "chat image input",
			path: "/v1/chat/completions",
			body: `{"model":"gpt-pool-test","messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"https://example.test/image.png"}}]}]}`,
			want: false,
		},
		{
			name: "claude image input",
			path: "/v1/messages",
			body: `{"model":"claude-pool-test","messages":[{"role":"user","content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"abc"}}]}]}`,
			want: false,
		},
		{
			name: "gemini inline data",
			path: "/v1beta/models/gemini-pool-test:generateContent",
			body: `{"contents":[{"parts":[{"inlineData":{"mimeType":"image/png","data":"abc"}}]}]}`,
			want: false,
		},
		{
			name: "background request",
			path: "/v1/responses",
			body: `{"model":"gpt-pool-test","input":"hello","background":true}`,
			want: false,
		},
		{
			name: "async request",
			path: "/v1/responses",
			body: `{"model":"gpt-pool-test","input":"hello","async":true}`,
			want: false,
		},
		{
			name: "batch request",
			path: "/v1/responses",
			body: `{"model":"gpt-pool-test","input":"hello","batch":true}`,
			want: false,
		},
		{
			name: "gemini batch request",
			path: "/v1beta/models/gemini-pool-test:generateContent",
			body: `{"requests":[{"contents":[{"parts":[{"text":"hello"}]}]}]}`,
			want: false,
		},
		{
			name: "gemini empty batch request",
			path: "/v1beta/models/gemini-pool-test:generateContent",
			body: `{"requests":[],"contents":[{"parts":[{"text":"hello"}]}]}`,
			want: false,
		},
		{
			name: "gemini batch embed request",
			path: "/v1beta/models/gemini-pool-test:batchEmbedContents",
			body: `{"requests":[{"content":{"parts":[{"text":"hello"}]}}]}`,
			want: false,
		},
		{
			name: "audio request",
			path: "/v1/audio/speech",
			body: `{"model":"tts-1","input":"hello"}`,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Request = httptest.NewRequest(http.MethodPost, tt.path, strings.NewReader(tt.body))
			ctx.Request.Header.Set("Content-Type", "application/json")

			SetChannelFailoverPoolTextRequestEligibility(ctx)

			assert.Equal(t, tt.want, IsChannelFailoverPoolTextRequest(ctx))
		})
	}
}

func TestLockChannelFailoverPoolForSelectedChannelRejectsUnlistedAffinityChannel(t *testing.T) {
	const group = "production"
	const modelName = "gpt-pool-test"
	useChannelFailoverPoolSelectionDatabase(t)

	primary := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-primary", 1, 20)
	unlisted := addChannelFailoverPoolSelectionChannel(t, group, modelName, "unlisted-affinity", 1, 30)
	useChannelFailoverPoolSettingForSelection(t, []operation_setting.ChannelRoutingPool{{
		ID:          "openai-production",
		Name:        "OpenAI production",
		Enabled:     true,
		Group:       group,
		ChannelType: 1,
		ChannelIDs:  []int{primary.Id},
	}})

	ctx := newChannelFailoverPoolSelectionContext(group)
	managed, locked := LockChannelFailoverPoolForSelectedChannel(ctx, group, unlisted)

	assert.True(t, managed)
	assert.False(t, locked)
	assert.Empty(t, common.GetContextKeyString(ctx, constant.ContextKeyChannelFailoverPoolID))
}

func TestLockChannelFailoverPoolForSelectedChannelLocksListedAffinityChannel(t *testing.T) {
	const group = "production"
	const modelName = "gpt-pool-test"
	useChannelFailoverPoolSelectionDatabase(t)

	primary := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-primary", 1, 20)
	backup := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-backup", 1, 10)
	useChannelFailoverPoolSettingForSelection(t, []operation_setting.ChannelRoutingPool{{
		ID:          "openai-production",
		Name:        "OpenAI production",
		Enabled:     true,
		Group:       group,
		ChannelType: 1,
		ChannelIDs:  []int{primary.Id, backup.Id},
	}})

	ctx := newChannelFailoverPoolSelectionContext(group)
	managed, locked := LockChannelFailoverPoolForSelectedChannel(ctx, group, primary)

	assert.True(t, managed)
	assert.True(t, locked)
	assert.Equal(t, "openai-production", common.GetContextKeyString(ctx, constant.ContextKeyChannelFailoverPoolID))
	assert.Equal(t, 1, common.GetContextKeyInt(ctx, constant.ContextKeyChannelFailoverPoolType))
	allowed, ok := common.GetContextKey(ctx, constant.ContextKeyChannelFailoverPoolAllowedIDs)
	require.True(t, ok)
	assert.Equal(t, map[int]struct{}{primary.Id: {}, backup.Id: {}}, allowed)
}

func TestLockChannelFailoverPoolForSelectedChannelPreservesAffinityStop(t *testing.T) {
	const group = "production"
	const modelName = "gpt-pool-test"
	useChannelFailoverPoolSelectionDatabase(t)

	primary := addChannelFailoverPoolSelectionChannel(t, group, modelName, "pool-primary", 1, 20)
	useChannelFailoverPoolSettingForSelection(t, []operation_setting.ChannelRoutingPool{{
		ID:          "openai-production",
		Name:        "OpenAI production",
		Enabled:     true,
		Group:       group,
		ChannelType: 1,
		ChannelIDs:  []int{primary.Id},
	}})

	ctx := newChannelFailoverPoolSelectionContext(group)
	setChannelAffinityContext(ctx, channelAffinityMeta{SkipRetry: true})
	managed, locked := LockChannelFailoverPoolForSelectedChannel(ctx, group, primary)
	MarkChannelAffinityUsed(ctx, group, primary.Id)

	assert.True(t, managed)
	assert.True(t, locked)
	assert.True(t, ShouldSkipRetryAfterChannelAffinityFailure(ctx))
}
