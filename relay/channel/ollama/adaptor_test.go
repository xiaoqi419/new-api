package ollama

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURLResponses(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:   relayconstant.RelayModeResponses,
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "http://ollama.example"},
	}

	got, err := (&Adaptor{}).GetRequestURL(info)
	require.NoError(t, err)
	require.Equal(t, "http://ollama.example/v1/responses", got)
}

func TestGetRequestURLClaudeUsesMessagesEndpoint(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatClaude,
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "http://ollama.example"},
	}

	got, err := (&Adaptor{}).GetRequestURL(info)
	require.NoError(t, err)
	require.Equal(t, "http://ollama.example/v1/messages", got)
}

func TestConvertOpenAIResponsesRequestDelegatesToOpenAI(t *testing.T) {
	stream := true
	request := dto.OpenAIResponsesRequest{Model: "gpt-5", Stream: &stream}
	got, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(nil, &relaycommon.RelayInfo{}, request)
	require.NoError(t, err)
	require.Equal(t, request, got)
}
