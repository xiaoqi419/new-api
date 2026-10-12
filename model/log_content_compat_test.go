package model

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLogWritersPreserveLegacyAndStructuredContent(t *testing.T) {
	previousRedis := common.RedisEnabled
	previousConsume := common.LogConsumeEnabled
	previousExport := common.DataExportEnabled
	common.RedisEnabled = false
	common.LogConsumeEnabled = true
	common.DataExportEnabled = false
	t.Cleanup(func() {
		common.RedisEnabled = previousRedis
		common.LogConsumeEnabled = previousConsume
		common.DataExportEnabled = previousExport
	})

	writers := []struct {
		name  string
		write func(*gin.Context, *User, *Token, any)
	}{
		{"system", func(_ *gin.Context, user *User, _ *Token, content any) {
			RecordLog(user.Id, LogTypeSystem, content)
		}},
		{"topup", func(_ *gin.Context, user *User, _ *Token, content any) {
			RecordTopupLog(user.Id, content, "192.0.2.1", "alipay", "epay")
		}},
		{"consume", func(c *gin.Context, user *User, token *Token, content any) {
			RecordConsumeLog(c, user.Id, RecordConsumeLogParams{
				Content: content, TokenId: token.Id, TokenName: token.Name, ModelName: "model-a",
				InputTokens: 100, CacheReadTokens: 30, CacheWriteTokens: 20,
				Other: map[string]any{"frt": 125, "channel_id": 42, "request_path": "/v1/responses"},
			})
		}},
		{"task", func(_ *gin.Context, user *User, token *Token, content any) {
			RecordTaskBillingLog(RecordTaskBillingLogParams{
				UserId: user.Id, LogType: LogTypeRefund, Content: content, TokenId: token.Id,
				Other: map[string]any{"channel_id": 42, "request_path": "/v1/responses"},
			})
		}},
	}
	contents := []struct {
		name       string
		value      any
		wantText   string
		structured bool
	}{
		{"legacy", "充值赠金到账：$0.05", "充值赠金到账：$0.05", false},
		{"message", common.NewMessage("Amount added: {{quota}}", map[string]any{"quota": "$0.05"}), "Amount added: $0.05", true},
		{"parts", []*common.Message{
			common.NewMessage("Amount added: {{quota}}", map[string]any{"quota": "$0.05"}),
			common.NewMessage("Payment method: {{method}}", map[string]any{"method": "alipay"}),
		}, "Amount added: $0.05, Payment method: alipay", true},
	}

	for _, writer := range writers {
		for _, content := range contents {
			t.Run(writer.name+"/"+content.name, func(t *testing.T) {
				truncateTables(t)
				user := &User{Username: "log-content-user", Status: common.UserStatusEnabled}
				require.NoError(t, DB.Create(user).Error)
				token := &Token{UserId: user.Id, Name: "fork-task-token", Key: "log-content-token"}
				require.NoError(t, DB.Create(token).Error)
				c, _ := gin.CreateTestContext(httptest.NewRecorder())
				c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
				c.Set("username", user.Username)
				c.Set(common.RequestIdKey, "request-log-content")

				writer.write(c, user, token, content.value)

				var stored Log
				require.NoError(t, LOG_DB.Where("user_id = ?", user.Id).First(&stored).Error)
				assert.Equal(t, content.wantText, stored.Content)
				assert.Equal(t, user.Username, stored.Username)
				metadata, err := common.StrToMap(stored.Other)
				require.NoError(t, err)
				if content.structured {
					wantParts := content.value
					if message, ok := wantParts.(*common.Message); ok {
						wantParts = []*common.Message{message}
					}
					encodedParts, err := common.Marshal(metadata["content_parts"])
					require.NoError(t, err)
					wantJSON, err := common.Marshal(wantParts)
					require.NoError(t, err)
					assert.JSONEq(t, string(wantJSON), string(encodedParts))
				} else {
					assert.NotContains(t, metadata, "content_parts")
				}

				if writer.name == "topup" {
					admin, ok := metadata["admin_info"].(map[string]any)
					require.True(t, ok)
					assert.Equal(t, "alipay", admin["payment_method"])
					assert.Equal(t, "epay", admin["callback_payment_method"])
				}
				if writer.name == "consume" || writer.name == "task" {
					assert.Equal(t, token.Name, stored.TokenName)
					assert.Equal(t, token.Id, stored.TokenId)
					admin, ok := metadata["admin_info"].(map[string]any)
					require.True(t, ok)
					assert.EqualValues(t, 42, admin["channel_id"])
					logs, err := GetLogByTokenId(token.Id)
					require.NoError(t, err)
					require.Len(t, logs, 1)
					projected, err := common.StrToMap(logs[0].Other)
					require.NoError(t, err)
					assert.NotContains(t, projected, "admin_info")
					assert.Equal(t, "/v1/responses", projected["request_path"])
					assert.Equal(t, metadata["content_parts"], projected["content_parts"])
				}
				if writer.name == "consume" {
					assert.Equal(t, 125, stored.FirstTokenMs)
					assert.EqualValues(t, 100, stored.InputTokens)
					assert.EqualValues(t, 30, stored.CacheReadTokens)
					assert.EqualValues(t, 20, stored.CacheWriteTokens)
				}
			})
		}
	}
}
