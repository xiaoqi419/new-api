package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestCacheControlByPath(t *testing.T) {
	cases := []struct {
		name   string
		target string
		expect string
	}{
		{
			name:   "index must always revalidate so a new build is picked up",
			target: "/",
			expect: "no-cache",
		},
		{
			name:   "content hashed bundle can be pinned for a year",
			target: "/static/js/index.121e10eeca.js",
			expect: "max-age=31536000, immutable",
		},
		{
			name:   "content hashed stylesheet can be pinned for a year",
			target: "/static/css/index.a774140fe4.css",
			expect: "max-age=31536000, immutable",
		},
		{
			name:   "stable filename keeps revalidating because uploads reuse the URL",
			target: "/logo.png",
			expect: "max-age=604800",
		},
		{
			name:   "query string does not turn a stable filename into an immutable one",
			target: "/logo.png?v=2",
			expect: "max-age=604800",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.Use(Cache())
			router.GET("/*path", func(c *gin.Context) {
				c.Status(http.StatusOK)
			})

			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tc.target, nil))

			assert.Equal(t, tc.expect, response.Header().Get("Cache-Control"))
		})
	}
}
