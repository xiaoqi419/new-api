package common

import (
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTrustedProxyConfiguration(t *testing.T) {
	for _, tc := range []struct{ name, raw, remote, forwarded, want string }{
		{"default ignores public forwarding", "", "203.0.113.5:2345", "198.51.100.8", "203.0.113.5"},
		{"default ignores private forwarding", "", "10.1.2.3:2345", "198.51.100.8", "10.1.2.3"},
		{"explicit proxy", "10.0.0.0/8", "10.1.2.3:2345", "198.51.100.8", "198.51.100.8"},
		{"explicit trust all", "*", "203.0.113.5:2345", "198.51.100.8", "198.51.100.8"},
		{"none", "none", "127.0.0.1:2345", "198.51.100.8", "127.0.0.1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			proxies, _, err := ResolveTrustedProxies(tc.raw)
			require.NoError(t, err)
			r := gin.New()
			require.NoError(t, ConfigureTrustedProxies(r, proxies))
			r.GET("/", func(c *gin.Context) { c.String(http.StatusOK, c.ClientIP()) })
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = tc.remote
			req.Header.Set("X-Forwarded-For", tc.forwarded)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			assert.Equal(t, tc.want, w.Body.String())
		})
	}
}
