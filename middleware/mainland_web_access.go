package middleware

import (
	"fmt"
	"html"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
)

const mainlandWebAccessCountryHeaderEnv = "MAINLAND_WEB_ACCESS_COUNTRY_HEADER"

// MainlandWebAccess blocks direct requests for website HTML documents before
// static middleware can serve them. SPA fallbacks use BlockMainlandWebAccess
// directly because their route shape is determined after static lookup.
func MainlandWebAccess() gin.HandlerFunc {
	return func(c *gin.Context) {
		if isDirectWebsiteDocumentRequest(c.Request) && BlockMainlandWebAccess(c) {
			return
		}
		c.Next()
	}
}

// BlockMainlandWebAccess renders the policy response when a website HTML
// fallback is reached by a trusted mainland-China request.
func BlockMainlandWebAccess(c *gin.Context) bool {
	if isMainlandWebAccessExemptPath(c.Request.URL.Path) || !isTrustedMainlandChinaRequest(c.Request) {
		return false
	}

	pageTheme := common.GetTheme()
	background := "#071521"
	panel := "#0d2434"
	border := "#1d4963"
	accent := "#38bdf8"
	foreground := "#e0f2fe"
	muted := "#9ec5d8"
	if pageTheme == "classic" {
		background = "#101820"
		panel = "#172733"
		border = "#365367"
		accent = "#60a5fa"
		foreground = "#e5edf5"
		muted = "#b5c5d3"
	}

	status := html.EscapeString(i18n.T(c, i18n.MsgMainlandWebAccessStatus))
	title := html.EscapeString(i18n.T(c, i18n.MsgMainlandWebAccessTitle))
	message := html.EscapeString(i18n.T(c, i18n.MsgMainlandWebAccessMessage))
	language := html.EscapeString(i18n.GetLangFromContext(c))
	page := fmt.Sprintf(`<!doctype html>
<html lang="%s" data-theme="%s">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>%s</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:%s;color:%s;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(100%%,560px);border:1px solid %s;background:%s;padding:36px;box-shadow:0 24px 64px rgba(0,0,0,.28)}.status{margin:0 0 16px;color:%s;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font-size:28px;line-height:1.25}p{margin:16px 0 0;color:%s;font-size:16px;line-height:1.6}@media (max-width:360px){body{padding:16px}main{padding:24px}h1{font-size:24px}}</style></head>
<body><main><p class="status">%s</p><h1>%s</h1><p>%s</p></main></body></html>`, language, pageTheme, status, background, foreground, border, panel, accent, muted, status, title, message)

	c.Header("Cache-Control", "no-store")
	c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Language", language)
	c.Data(http.StatusUnavailableForLegalReasons, "text/html; charset=utf-8", []byte(page))
	c.Abort()
	return true
}

func isDirectWebsiteDocumentRequest(request *http.Request) bool {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		return false
	}
	path := strings.ToLower(request.URL.Path)
	return path == "/" || strings.HasSuffix(path, ".html")
}

func isMainlandWebAccessExemptPath(path string) bool {
	if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/v1") || strings.HasPrefix(path, "/assets") {
		return true
	}
	for _, healthPath := range []string{"/health", "/healthz", "/ready", "/readyz", "/live", "/livez", "/metrics"} {
		if path == healthPath || strings.HasPrefix(path, healthPath+"/") {
			return true
		}
	}
	return false
}

func isTrustedMainlandChinaRequest(request *http.Request) bool {
	countryHeader := strings.TrimSpace(os.Getenv(mainlandWebAccessCountryHeaderEnv))
	if countryHeader == "" || !strings.EqualFold(strings.TrimSpace(request.Header.Get(countryHeader)), "CN") {
		return false
	}

	trustedProxyPrefixes, ok := explicitTrustedProxyPrefixes()
	if !ok {
		return false
	}
	peer, ok := remoteAddr(request.RemoteAddr)
	if !ok {
		return false
	}
	for _, trustedProxyPrefix := range trustedProxyPrefixes {
		if trustedProxyPrefix.Contains(peer) {
			return true
		}
	}
	return false
}

func explicitTrustedProxyPrefixes() ([]netip.Prefix, bool) {
	rawTrustedProxies := strings.TrimSpace(os.Getenv("TRUSTED_PROXIES"))
	if rawTrustedProxies == "" || strings.EqualFold(rawTrustedProxies, "none") {
		return nil, false
	}

	parts := strings.Split(rawTrustedProxies, ",")
	prefixes := make([]netip.Prefix, 0, len(parts))
	for _, part := range parts {
		entry := strings.TrimSpace(part)
		if entry == "" || entry == "*" || strings.EqualFold(entry, "none") {
			return nil, false
		}
		if address, err := netip.ParseAddr(entry); err == nil {
			prefixes = append(prefixes, netip.PrefixFrom(address, address.BitLen()))
			continue
		}
		prefix, err := netip.ParsePrefix(entry)
		if err != nil {
			return nil, false
		}
		prefixes = append(prefixes, prefix.Masked())
	}
	return prefixes, len(prefixes) > 0
}

func remoteAddr(rawRemoteAddr string) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(rawRemoteAddr)
	if err == nil {
		rawRemoteAddr = host
	}
	address, err := netip.ParseAddr(strings.Trim(rawRemoteAddr, "[]"))
	if err != nil {
		return netip.Addr{}, false
	}
	return address, true
}
