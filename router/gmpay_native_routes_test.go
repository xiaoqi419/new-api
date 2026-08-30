package router

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestGMPayNativeCallbackRoutesAcceptOnlyPOST(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	routes := make(map[string]struct{}, len(engine.Routes()))
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = struct{}{}
	}

	_, hasPlatformPOST := routes[http.MethodPost+" /api/user/gmpay/notify"]
	_, hasPlatformGET := routes[http.MethodGet+" /api/user/gmpay/notify"]
	_, hasAgentPOST := routes[http.MethodPost+" /api/agent/:id/gmpay/notify"]
	_, hasAgentGET := routes[http.MethodGet+" /api/agent/:id/gmpay/notify"]
	assert.True(t, hasPlatformPOST)
	assert.False(t, hasPlatformGET)
	assert.True(t, hasAgentPOST)
	assert.False(t, hasAgentGET)
}
