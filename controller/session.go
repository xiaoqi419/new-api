package controller

import (
	"strconv"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

// getSessionUserID 安全解析会话中的用户 ID。
// gob cookie session 存的是 int，但 JSON / Redis 等 session 后端会把数值
// 反序列化为 float64 或字符串，直接 id.(int) 断言会 panic。这里统一兼容
// int / int64 / float64 / 字符串形式，缺失或非法时返回 ok=false。
func getSessionUserID(c *gin.Context) (int, bool) {
	raw := sessions.Default(c).Get("id")
	if raw == nil {
		return 0, false
	}
	switch v := raw.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case string:
		id, err := strconv.Atoi(v)
		if err != nil {
			return 0, false
		}
		return id, true
	default:
		return 0, false
	}
}
