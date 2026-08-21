package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newMainlandWebAccessTestRouter() *gin.Engine {
	router := gin.New()
	router.Use(MainlandWebAccess())
	router.GET("/index.html", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte("direct document"))
	})
	router.GET("/api/status", func(c *gin.Context) {
		c.String(http.StatusOK, "api")
	})
	router.GET("/v1/models", func(c *gin.Context) {
		c.String(http.StatusOK, "relay")
	})
	router.GET("/assets/app.js", func(c *gin.Context) {
		c.Data(http.StatusOK, "application/javascript", []byte("asset"))
	})
	router.GET("/logo.svg", func(c *gin.Context) {
		c.Data(http.StatusOK, "image/svg+xml", []byte("asset"))
	})
	router.NoRoute(func(c *gin.Context) {
		if BlockMainlandWebAccess(c) {
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte("spa fallback"))
	})
	return router
}

func requestMainlandWebAccess(router http.Handler, target string, remoteAddr string, country string, language string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, target, nil)
	request.RemoteAddr = remoteAddr
	if country != "" {
		request.Header.Set("CF-IPCountry", country)
	}
	if language != "" {
		request.Header.Set("Accept-Language", language)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestMainlandWebAccessBlocksTrustedChinaWebsiteDocuments(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	t.Setenv(mainlandWebAccessCountryHeaderEnv, "CF-IPCountry")
	t.Setenv("TRUSTED_PROXIES", "192.0.2.0/24")
	t.Setenv("THEME", "classic")
	router := newMainlandWebAccessTestRouter()

	for _, target := range []string{"/", "/index.html", "/login", "/register", "/docs/getting-started", "/canvas", "/canvas-app/workspace"} {
		t.Run(target, func(t *testing.T) {
			response := requestMainlandWebAccess(router, target, "192.0.2.10:8443", " cn ", "zh-CN")

			assert.Equal(t, http.StatusUnavailableForLegalReasons, response.Code)
			assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
			assert.Contains(t, response.Header().Get("Content-Security-Policy"), "default-src 'none'")
			assert.Contains(t, response.Header().Get("Content-Type"), "text/html")
			assert.Contains(t, response.Body.String(), "data-theme=\"classic\"")
			assert.Contains(t, response.Body.String(), i18n.Translate(i18n.LangZhCN, i18n.MsgMainlandWebAccessTitle))
			assert.NotContains(t, response.Body.String(), "#ec4899")
		})
	}
}

func TestMainlandWebAccessFailsOpenForUntrustedOrUnknownSignals(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())

	testCases := []struct {
		name           string
		countryHeader  string
		trustedProxies string
		remoteAddr     string
		country        string
	}{
		{name: "non mainland country", countryHeader: "CF-IPCountry", trustedProxies: "192.0.2.0/24", remoteAddr: "192.0.2.10:8443", country: "US"},
		{name: "missing country value", countryHeader: "CF-IPCountry", trustedProxies: "192.0.2.0/24", remoteAddr: "192.0.2.10:8443"},
		{name: "policy disabled", trustedProxies: "192.0.2.0/24", remoteAddr: "192.0.2.10:8443", country: "CN"},
		{name: "untrusted direct peer", countryHeader: "CF-IPCountry", trustedProxies: "192.0.2.0/24", remoteAddr: "198.51.100.10:8443", country: "CN"},
		{name: "implicit trusted proxy defaults", countryHeader: "CF-IPCountry", remoteAddr: "192.168.1.10:8443", country: "CN"},
		{name: "strict trusted proxy none", countryHeader: "CF-IPCountry", trustedProxies: "none", remoteAddr: "192.0.2.10:8443", country: "CN"},
		{name: "wildcard trusted proxy", countryHeader: "CF-IPCountry", trustedProxies: "*", remoteAddr: "192.0.2.10:8443", country: "CN"},
		{name: "malformed trusted proxy", countryHeader: "CF-IPCountry", trustedProxies: "not-an-ip", remoteAddr: "192.0.2.10:8443", country: "CN"},
		{name: "unparsable peer", countryHeader: "CF-IPCountry", trustedProxies: "192.0.2.0/24", remoteAddr: "not-an-address", country: "CN"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Setenv(mainlandWebAccessCountryHeaderEnv, testCase.countryHeader)
			t.Setenv("TRUSTED_PROXIES", testCase.trustedProxies)
			router := newMainlandWebAccessTestRouter()
			response := requestMainlandWebAccess(router, "/login", testCase.remoteAddr, testCase.country, "en")

			assert.Equal(t, http.StatusOK, response.Code)
			assert.Equal(t, "spa fallback", response.Body.String())
		})
	}
}

func TestMainlandWebAccessResponseFollowsCurrentTheme(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, i18n.Init())
	t.Setenv(mainlandWebAccessCountryHeaderEnv, "CF-IPCountry")
	t.Setenv("TRUSTED_PROXIES", "192.0.2.0/24")
	router := newMainlandWebAccessTestRouter()

	for _, testCase := range []struct {
		theme string
	}{
		{theme: ""},
		{theme: "classic"},
	} {
		t.Run(testCase.theme, func(t *testing.T) {
			t.Setenv("THEME", testCase.theme)
			response := requestMainlandWebAccess(router, "/login", "192.0.2.10:8443", "CN", "en")
			expectedTheme := "default"
			if testCase.theme == "classic" {
				expectedTheme = "classic"
			}

			assert.Equal(t, http.StatusUnavailableForLegalReasons, response.Code)
			assert.Contains(t, response.Body.String(), "data-theme=\""+expectedTheme+"\"")
		})
	}
}

func TestMainlandWebAccessLeavesServiceAndStaticPathsUnblocked(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv(mainlandWebAccessCountryHeaderEnv, "CF-IPCountry")
	t.Setenv("TRUSTED_PROXIES", "192.0.2.0/24")
	router := newMainlandWebAccessTestRouter()

	for _, target := range []string{"/api/status", "/v1/models", "/assets/app.js", "/logo.svg", "/health", "/healthz", "/ready", "/readyz", "/live", "/livez", "/metrics"} {
		t.Run(target, func(t *testing.T) {
			response := requestMainlandWebAccess(router, target, "192.0.2.10:8443", "CN", "en")

			assert.Equal(t, http.StatusOK, response.Code)
		})
	}
}

func TestMainlandWebAccessTranslationsResolveInEveryBackendLocale(t *testing.T) {
	require.NoError(t, i18n.Init())

	testCases := []struct {
		language string
		title    string
		message  string
	}{
		{language: i18n.LangEn, title: "This website is unavailable in your region", message: "Access to this website is unavailable from mainland China."},
		{language: i18n.LangZhCN, title: "此网站在您所在地区暂不可访问", message: "中国大陆地区暂不提供此网站访问服务。"},
		{language: i18n.LangZhTW, title: "此網站在您所在區域暫時無法存取", message: "中國大陸地區暫不提供此網站存取服務。"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.language, func(t *testing.T) {
			assert.Equal(t, testCase.title, i18n.Translate(testCase.language, i18n.MsgMainlandWebAccessTitle))
			assert.Equal(t, testCase.message, i18n.Translate(testCase.language, i18n.MsgMainlandWebAccessMessage))
		})
	}
}
