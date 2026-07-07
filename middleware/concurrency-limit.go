package middleware

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// ConcurrencyLimit 限制用户级与令牌级的同时在途请求数。
// 在 c.Next() 前获取槽位、之后释放，从而以请求生命周期统计真实并发。
// 超出上限时会等待空闲槽位至超时，超时返回 429。
func ConcurrencyLimit() func(c *gin.Context) {
	return func(c *gin.Context) {
		userId := c.GetInt("id")

		userMax := 0
		if v, ok := c.Get("user_max_concurrency"); ok {
			if iv, ok2 := v.(int); ok2 {
				userMax = iv
			}
		} else if userId > 0 {
			if uc, err := model.GetUserCache(userId); err == nil {
				userMax = uc.MaxConcurrency
			}
		}

		tokenId := c.GetInt("token_id")
		tokenMax := c.GetInt("token_max_concurrency")

		var releases []func()
		releaseAll := func() {
			for i := len(releases) - 1; i >= 0; i-- {
				releases[i]()
			}
		}

		if userMax > 0 && userId > 0 {
			rel, ok := service.AcquireConcurrency("user", userId, userMax)
			if !ok {
				abortConcurrencyLimit(c, userMax)
				return
			}
			releases = append(releases, rel)
		}

		if tokenMax > 0 && tokenId > 0 {
			rel, ok := service.AcquireConcurrency("token", tokenId, tokenMax)
			if !ok {
				releaseAll()
				abortConcurrencyLimit(c, tokenMax)
				return
			}
			releases = append(releases, rel)
		}

		defer releaseAll()
		c.Next()
	}
}

func abortConcurrencyLimit(c *gin.Context, max int) {
	abortWithOpenAiMessage(c, http.StatusTooManyRequests,
		fmt.Sprintf("已达到最大并发数限制（%d），请稍后重试", max))
}
