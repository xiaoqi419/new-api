package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAesEncryptDecryptRoundTrip(t *testing.T) {
	plaintext := `{"api_secret":"sk_test_123","webhook_secret":"whsec_abc"}`
	enc, err := AesEncryptString(plaintext)
	require.NoError(t, err)
	require.NotEmpty(t, enc)
	// 密文不得泄露明文凭据
	assert.NotContains(t, enc, "sk_test_123")

	dec, err := AesDecryptString(enc)
	require.NoError(t, err)
	assert.Equal(t, plaintext, dec)
}

func TestAesEncryptNonceRandomized(t *testing.T) {
	enc1, err := AesEncryptString("same-plaintext")
	require.NoError(t, err)
	enc2, err := AesEncryptString("same-plaintext")
	require.NoError(t, err)
	// 每次随机 nonce → 相同明文产生不同密文
	assert.NotEqual(t, enc1, enc2)
}

func TestAesDecryptEmptyAndTampered(t *testing.T) {
	got, err := AesDecryptString("")
	require.NoError(t, err)
	assert.Equal(t, "", got)

	_, err = AesDecryptString("not-hex!!")
	assert.Error(t, err)

	enc, err := AesEncryptString("payload")
	require.NoError(t, err)
	b := []byte(enc)
	if b[len(b)-1] == '0' {
		b[len(b)-1] = '1'
	} else {
		b[len(b)-1] = '0'
	}
	// 篡改密文 → GCM 认证失败
	_, err = AesDecryptString(string(b))
	assert.Error(t, err)
}
