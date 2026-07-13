package common

import "testing"

func TestVerifyAndConsumeCodeWithKey(t *testing.T) {
	const key = "user@example.com"
	const code = "abc123"

	RegisterVerificationCodeWithKey(key, code, PasswordResetPurpose)

	// 首次校验成功并消费。
	if !VerifyAndConsumeCodeWithKey(key, code, PasswordResetPurpose) {
		t.Fatal("first consume should succeed")
	}
	// 二次校验必须失败（已被一次性消费），防止并发复用。
	if VerifyAndConsumeCodeWithKey(key, code, PasswordResetPurpose) {
		t.Fatal("second consume must fail after code is consumed")
	}

	// 错误验证码不消费也不通过。
	RegisterVerificationCodeWithKey(key, code, PasswordResetPurpose)
	if VerifyAndConsumeCodeWithKey(key, "wrong", PasswordResetPurpose) {
		t.Fatal("wrong code must not pass")
	}
	if !VerifyAndConsumeCodeWithKey(key, code, PasswordResetPurpose) {
		t.Fatal("correct code should still be consumable after a wrong attempt")
	}
}
