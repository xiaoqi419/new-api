package service

import (
	"bytes"
	"fmt"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

// wecomMarkdownPayload 企业微信群机器人 markdown 消息体
type wecomMarkdownPayload struct {
	MsgType  string `json:"msgtype"`
	Markdown struct {
		Content string `json:"content"`
	} `json:"markdown"`
}

// wecomResponse 企业微信机器人返回体
type wecomResponse struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

// SendWecomBotMarkdown 向企业微信群机器人发送 markdown 消息。
// content 为企业微信 markdown 语法文本（上限约 4096 字节，调用方需自行截断）。
func SendWecomBotMarkdown(webhookURL string, content string) error {
	if webhookURL == "" {
		return fmt.Errorf("wecom webhook url is empty")
	}

	payload := wecomMarkdownPayload{MsgType: "markdown"}
	payload.Markdown.Content = content

	payloadBytes, err := common.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal wecom payload: %v", err)
	}

	var respBody []byte

	if system_setting.EnableWorker() {
		workerReq := &WorkerRequest{
			URL:     webhookURL,
			Key:     system_setting.WorkerValidKey,
			Method:  http.MethodPost,
			Headers: map[string]string{"Content-Type": "application/json"},
			Body:    payloadBytes,
		}
		resp, err := DoWorkerRequest(workerReq)
		if err != nil {
			return fmt.Errorf("failed to send wecom request through worker: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return fmt.Errorf("wecom request failed with status code: %d", resp.StatusCode)
		}
		respBody, _ = io.ReadAll(resp.Body)
	} else {
		if err := ValidateSSRFProtectedFetchURL(webhookURL); err != nil {
			return fmt.Errorf("request reject: %v", err)
		}
		req, err := http.NewRequest(http.MethodPost, webhookURL, bytes.NewBuffer(payloadBytes))
		if err != nil {
			return fmt.Errorf("failed to create wecom request: %v", err)
		}
		req.Header.Set("Content-Type", "application/json")
		client := GetSSRFProtectedHTTPClient()
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("failed to send wecom request: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return fmt.Errorf("wecom request failed with status code: %d", resp.StatusCode)
		}
		respBody, _ = io.ReadAll(resp.Body)
	}

	var r wecomResponse
	if err := common.Unmarshal(respBody, &r); err != nil {
		return fmt.Errorf("failed to parse wecom response: %v", err)
	}
	if r.ErrCode != 0 {
		return fmt.Errorf("wecom api error: errcode=%d errmsg=%s", r.ErrCode, r.ErrMsg)
	}
	return nil
}
