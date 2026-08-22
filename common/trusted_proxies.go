package common

import (
	"os"
	"strings"
)

// defaultTrustedProxies 仅默认信任本机回环地址。
// Gin 默认信任所有来源，会让任意客户端通过伪造 X-Forwarded-For 冒充来源 IP，
// 从而绕过按 ClientIP 计数的限流与污染审计日志。默认收敛为仅信任回环，
// 真实反向代理地址需通过 TRUSTED_PROXIES 显式配置。
var defaultTrustedProxies = []string{"127.0.0.1", "::1"}

// GetTrustedProxies 解析 TRUSTED_PROXIES 环境变量，返回传给 gin.SetTrustedProxies 的列表。
// 返回值语义与 gin 一致：nil 表示信任所有代理。
//   - 未配置：仅信任回环地址。
//   - "*"：信任所有代理（还原 gin 默认，风险自负）。
//   - 逗号分隔的 IP / CIDR 列表：信任这些来源。
func GetTrustedProxies() []string {
	raw := strings.TrimSpace(os.Getenv("TRUSTED_PROXIES"))
	if raw == "" {
		return defaultTrustedProxies
	}
	if raw == "*" {
		return nil
	}

	proxies := make([]string, 0)
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		if item != "" {
			proxies = append(proxies, item)
		}
	}
	if len(proxies) == 0 {
		return defaultTrustedProxies
	}
	return proxies
}
