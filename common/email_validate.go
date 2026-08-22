package common

import (
	"net/mail"
	"strings"
)

// IsValidEmail 校验是否为纯邮箱地址（不含展示名），且域名合法（含点、无空白）。
// 仅检查 "@" 会放过 "a@"、"@b"、"@." 和 "Name <a@b>" 等非法输入。
func IsValidEmail(email string) bool {
	email = strings.TrimSpace(email)
	if email == "" {
		return false
	}
	addr, err := mail.ParseAddress(email)
	if err != nil {
		// 拒绝带展示名的地址（如 "Name <user@example.com>"）。
		return false
	}
	if addr.Name != "" || addr.Address != email {
		return false
	}
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 {
		return false
	}
	local, domain := email[:at], email[at+1:]
	if local == "" || domain == "" {
		return false
	}
	if strings.ContainsAny(email, " \t\r\n") {
		return false
	}
	// 域名必须包含点，且点不在首尾。
	dot := strings.Index(domain, ".")
	if dot <= 0 || dot == len(domain)-1 {
		return false
	}
	return true
}
