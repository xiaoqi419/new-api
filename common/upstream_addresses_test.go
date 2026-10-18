package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestUpstreamAddressesIncludesPrivateFallbackForPublicPrimary(t *testing.T) {
	c, _ := gin.CreateTestContext(nil)
	SetContextKey(c, constant.ContextKeyChannelBaseUrl, "https://api.openai.com")
	SetContextKey(c, constant.ContextKeyChannelType, constant.ChannelTypeOpenAI)
	SetContextKey(c, constant.ContextKeyChannelSetting, dto.ChannelSettings{
		FallbackUpstream: &dto.ChannelFallbackUpstream{Enabled: true, BaseURL: "https://private-fallback.example/v1"},
	})
	addresses := UpstreamAddresses(c)
	assert.Contains(t, addresses, "https://private-fallback.example/v1")
	assert.NotContains(t, addresses, "https://api.openai.com")
}
