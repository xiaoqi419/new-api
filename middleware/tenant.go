package middleware

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// ResolveTenant 根据请求域名解析代理(租户)ID 并写入上下文；平台主站解析为 0。
// 全局中间件，供白标登录/注册、GetStatus 等按租户区分。
func ResolveTenant() gin.HandlerFunc {
	return func(c *gin.Context) {
		agentId := model.ResolveAgentIdByHost(c.Request.Host)
		common.SetContextKey(c, constant.ContextKeyTenantAgentId, agentId)
		c.Next()
	}
}

// RequireAgentOwner 要求当前登录用户是某个 active 代理的 owner，并把其管理的代理 ID 写入上下文。
// 需挂在 UserAuth() 之后使用（依赖已认证的用户 id）。
func RequireAgentOwner() gin.HandlerFunc {
	return func(c *gin.Context) {
		userId := c.GetInt("id")
		if userId <= 0 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "message": "无权限"})
			return
		}
		agent, err := model.GetAgentByOwnerUserId(userId)
		if err != nil || agent == nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "message": "当前账号不是代理"})
			return
		}
		if agent.Status != model.AgentStatusActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "message": "代理未开通或已停用"})
			return
		}
		common.SetContextKey(c, constant.ContextKeySelfAgentId, agent.Id)
		c.Next()
	}
}
