package zhipu_4v

import (
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

type zhipuImageRequest struct {
	Model            string `json:"model"`
	Prompt           string `json:"prompt"`
	Quality          string `json:"quality,omitempty"`
	Size             string `json:"size,omitempty"`
	WatermarkEnabled *bool  `json:"watermark_enabled,omitempty"`
	UserID           string `json:"user_id,omitempty"`
}

type zhipuImageResponse struct {
	Created       *int64            `json:"created,omitempty"`
	Data          []zhipuImageData  `json:"data,omitempty"`
	ContentFilter any               `json:"content_filter,omitempty"`
	Usage         *dto.Usage        `json:"usage,omitempty"`
	Error         *zhipuImageError  `json:"error,omitempty"`
	RequestID     string            `json:"request_id,omitempty"`
	ExtendParam   map[string]string `json:"extendParam,omitempty"`
}

type zhipuImageError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type zhipuImageData struct {
	Url      string `json:"url,omitempty"`
	ImageUrl string `json:"image_url,omitempty"`
	B64Json  string `json:"b64_json,omitempty"`
	B64Image string `json:"b64_image,omitempty"`
}

type openAIImagePayload struct {
	Created int64             `json:"created"`
	Data    []openAIImageData `json:"data"`
}

type openAIImageData struct {
	B64Json string `json:"b64_json"`
}

func zhipu4vImageHandler(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	service.CloseResponseBodyGracefully(resp)

	var zhipuResp zhipuImageResponse
	if err := common.Unmarshal(responseBody, &zhipuResp); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	if zhipuResp.Error != nil && zhipuResp.Error.Message != "" {
		return nil, types.WithOpenAIError(types.OpenAIError{
			Message: zhipuResp.Error.Message,
			Type:    "zhipu_image_error",
			Code:    zhipuResp.Error.Code,
		}, resp.StatusCode)
	}

	payload := openAIImagePayload{}
	if zhipuResp.Created != nil && *zhipuResp.Created != 0 {
		payload.Created = *zhipuResp.Created
	} else {
		payload.Created = info.StartTime.Unix()
	}
	publicImageSlots := make([]bool, 0, len(zhipuResp.Data))
	for _, data := range zhipuResp.Data {
		url := data.Url
		if url == "" {
			url = data.ImageUrl
		}

		var b64 string
		switch {
		case data.B64Json != "":
			b64 = data.B64Json
		case data.B64Image != "":
			b64 = data.B64Image
		default:
			if url == "" {
				logger.LogWarn(c, "zhipu_image_missing_url")
				publicImageSlots = append(publicImageSlots, false)
				continue
			}
			proxy := ""
			if info != nil && info.ChannelMeta != nil {
				proxy = info.ChannelSetting.Proxy
			}
			downloaded, err := service.ConvertProviderImageURLToBase64WithProxy(url, proxy)
			if err != nil {
				logger.LogWarn(c, "zhipu_image_b64_conversion_failed")
				publicImageSlots = append(publicImageSlots, false)
				continue
			}
			b64 = downloaded
		}

		if b64 == "" {
			logger.LogWarn(c, "zhipu_image_empty_b64")
			publicImageSlots = append(publicImageSlots, false)
			continue
		}

		imageData := openAIImageData{
			B64Json: b64,
		}
		payload.Data = append(payload.Data, imageData)
		publicImageSlots = append(publicImageSlots, true)
	}

	jsonResp, err := common.Marshal(payload)
	if err != nil {
		return nil, types.NewError(err, types.ErrorCodeBadResponseBody)
	}
	if info != nil && info.ChannelMeta != nil {
		service.CaptureImageResultsWithProxy(c, jsonResp, info.ChannelSetting.Proxy)
	} else {
		service.CaptureImageResults(c, jsonResp)
	}
	capturedResults, _ := common.GetContextKeyType[[]taskdto.ImageTaskResult](c, constant.ContextKeyDrawingTaskResults)
	mergedResults := make([]taskdto.ImageTaskResult, 0, len(publicImageSlots))
	capturedIndex := 0
	for _, isPublicImage := range publicImageSlots {
		if !isPublicImage || capturedIndex >= len(capturedResults) {
			mergedResults = append(mergedResults, taskdto.ImageTaskResult{
				Status:    taskdto.ImageTaskResultStatusUnavailable,
				ErrorCode: taskdto.ImageTaskResultErrorCaptureFailed,
			})
			continue
		}
		mergedResults = append(mergedResults, capturedResults[capturedIndex])
		capturedIndex++
	}
	if len(mergedResults) > 0 {
		common.SetContextKey(c, constant.ContextKeyDrawingTaskResults, mergedResults)
	}

	service.IOCopyBytesGracefully(c, resp, jsonResp)

	return &dto.Usage{}, nil
}
