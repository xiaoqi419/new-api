package zhipu_4v

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURLResponses(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:   relayconstant.RelayModeResponses,
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://open.bigmodel.cn"},
	}

	got, err := (&Adaptor{}).GetRequestURL(info)
	require.NoError(t, err)
	require.Equal(t, "https://open.bigmodel.cn/api/v1/responses", got)
}

func TestConvertOpenAIResponsesRequestPassthrough(t *testing.T) {
	stream := true
	request := dto.OpenAIResponsesRequest{Model: "glm-4", Stream: &stream}
	got, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(nil, &relaycommon.RelayInfo{}, request)
	require.NoError(t, err)
	require.Equal(t, request, got)
}
