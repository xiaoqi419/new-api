package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestPaymentGatewayModeRoutesRequireRootAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	for _, route := range []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/option/payment_gateway_mode/status"},
		{method: http.MethodPost, path: "/api/option/payment_gateway_mode/apply"},
	} {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(route.method, route.path, nil)
			engine.ServeHTTP(recorder, request)

			assert.Equal(t, http.StatusUnauthorized, recorder.Code)
		})
	}
}
