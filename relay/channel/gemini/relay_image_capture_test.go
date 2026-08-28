package gemini

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type geminiImageDeliveryObserver struct {
	header      http.Header
	body        bytes.Buffer
	status      int
	context     *gin.Context
	results     []taskdto.ImageTaskResult
	assetsReady bool
}

func (w *geminiImageDeliveryObserver) Header() http.Header {
	return w.header
}

func (w *geminiImageDeliveryObserver) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	results, ok := common.GetContextKeyType[[]taskdto.ImageTaskResult](w.context, constant.ContextKeyDrawingTaskResults)
	if !ok {
		return
	}
	w.results = results
	w.assetsReady = len(results) > 0
	for _, result := range results {
		_, originalOK := service.DrawingImageOriginalFilePath(result.Key)
		_, thumbnailOK := service.DrawingImageFilePath(result.Key)
		w.assetsReady = w.assetsReady && originalOK && thumbnailOK
	}
}

func (w *geminiImageDeliveryObserver) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.body.Write(data)
}

func TestGeminiImageHandlerCapturesBase64ResultsBeforeVertexDelivery(t *testing.T) {
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeVertexAi,
			UpstreamModelName: "imagen-4.0-generate-001",
		},
	}

	assertGeminiImageHandlerCapture(t, info, 2)
}

func TestGeminiImageHandlerCapturesBase64ResultsWithoutChannelMetadata(t *testing.T) {
	assertGeminiImageHandlerCapture(t, nil, 1)
}

func assertGeminiImageHandlerCapture(t *testing.T, info *relaycommon.RelayInfo, imageCount int) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	t.Setenv("DRAWING_IMAGE_PATH", t.TempDir())
	base64Images := make([]string, imageCount)
	originalImages := make([][]byte, imageCount)
	for i := range base64Images {
		imageData := image.NewRGBA(image.Rect(0, 0, 1, 1))
		imageData.SetRGBA(0, 0, color.RGBA{R: uint8(i * 127), G: uint8(255 - i*127), B: 31, A: 255})
		var encoded bytes.Buffer
		require.NoError(t, png.Encode(&encoded, imageData))
		originalImages[i] = encoded.Bytes()
		base64Images[i] = base64.StdEncoding.EncodeToString(originalImages[i])
	}

	writer := &geminiImageDeliveryObserver{header: make(http.Header)}
	c, _ := gin.CreateTestContext(writer)
	writer.context = c
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)

	predictions := make([]dto.GeminiImagePrediction, imageCount)
	for i := range predictions {
		predictions[i] = dto.GeminiImagePrediction{
			MimeType:           "image/png",
			BytesBase64Encoded: base64Images[i],
		}
	}
	upstreamBody, err := common.Marshal(dto.GeminiImageResponse{Predictions: predictions})
	require.NoError(t, err)

	usage, newAPIError := GeminiImageHandler(c, info, &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(bytes.NewReader(upstreamBody)),
	})

	require.Nil(t, newAPIError)
	require.Equal(t, imageCount*258, usage.PromptTokens)
	require.Equal(t, 0, usage.CompletionTokens)
	require.Equal(t, imageCount*258, usage.TotalTokens)
	require.Equal(t, http.StatusOK, writer.status)
	require.Equal(t, "application/json", writer.Header().Get("Content-Type"))
	require.True(t, writer.assetsReady, "original and thumbnail must exist before response delivery")
	require.Len(t, writer.results, imageCount)

	keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys)
	require.Len(t, keys, imageCount)
	for i, result := range writer.results {
		require.Equal(t, taskdto.ImageTaskResult{
			Status:       taskdto.ImageTaskResultStatusAvailable,
			Key:          keys[i],
			ThumbnailURL: service.DrawingImageURL(keys[i], false),
			OriginalURL:  service.DrawingImageURL(keys[i], true),
		}, result)
		original, originalOK := service.DrawingImageOriginalFilePath(keys[i])
		thumbnail, thumbnailOK := service.DrawingImageFilePath(keys[i])
		require.True(t, originalOK)
		require.True(t, thumbnailOK)
		originalBytes, readErr := os.ReadFile(original)
		require.NoError(t, readErr)
		require.Equal(t, originalImages[i], originalBytes)
		thumbnailBytes, readErr := os.ReadFile(thumbnail)
		require.NoError(t, readErr)
		require.NotEmpty(t, thumbnailBytes)
	}

	var delivered dto.ImageResponse
	require.NoError(t, common.Unmarshal(writer.body.Bytes(), &delivered))
	require.Len(t, delivered.Data, imageCount)
	for i, image := range delivered.Data {
		require.Equal(t, base64Images[i], image.B64Json)
	}
	expectedResponse, err := common.Marshal(dto.ImageResponse{
		Created: delivered.Created,
		Data:    delivered.Data,
	})
	require.NoError(t, err)
	require.Equal(t, string(expectedResponse), writer.body.String())

	metadata, err := common.Marshal(writer.results)
	require.NoError(t, err)
	for _, encoded := range base64Images {
		require.NotContains(t, string(metadata), encoded)
	}
}
