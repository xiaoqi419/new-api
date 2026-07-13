package common

import "testing"

func TestIsValidEmail(t *testing.T) {
	cases := []struct {
		email string
		want  bool
	}{
		{"user@example.com", true},
		{"user.name+tag@sub.example.co", true},
		{"", false},
		{"user@", false},
		{"@example.com", false},
		{"@.", false},
		{"user@localhost", false},          // 无点域名
		{"user@example.", false},           // 点在域名末尾
		{"user@.com", false},               // 点在域名开头
		{"Name <user@example.com>", false}, // 带展示名
		{"user example@example.com", false},
		{"user@exa mple.com", false},
		{"plainaddress", false},
	}
	for _, tc := range cases {
		if got := IsValidEmail(tc.email); got != tc.want {
			t.Errorf("IsValidEmail(%q) = %v, want %v", tc.email, got, tc.want)
		}
	}
}
