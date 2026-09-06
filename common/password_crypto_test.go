package common

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPasswordEncryptionDecryptRoundTrip(t *testing.T) {
	previousEnabled := PasswordLoginEncryptionEnabled
	passwordEncryptionState.RLock()
	previousPrivateKey := passwordEncryptionState.privateKey
	previousPublicKey := passwordEncryptionState.publicKey
	previousKeyID := passwordEncryptionState.keyID
	passwordEncryptionState.RUnlock()
	t.Cleanup(func() {
		PasswordLoginEncryptionEnabled = previousEnabled
		passwordEncryptionState.Lock()
		passwordEncryptionState.privateKey = previousPrivateKey
		passwordEncryptionState.publicKey = previousPublicKey
		passwordEncryptionState.keyID = previousKeyID
		passwordEncryptionState.Unlock()
	})

	PasswordLoginEncryptionEnabled = true
	privateKeyPEM, err := GeneratePasswordEncryptionPrivateKey()
	require.NoError(t, err)
	require.NoError(t, LoadPasswordEncryptionPrivateKey(privateKeyPEM))

	keyID, publicKeyPEM := PasswordEncryptionPublicKey()
	require.NotEmpty(t, keyID)
	block, rest := pem.Decode([]byte(publicKeyPEM))
	require.NotNil(t, block)
	require.Empty(t, rest)
	require.Equal(t, "PUBLIC KEY", block.Type)
	parsedPublicKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	require.NoError(t, err)
	publicKey, ok := parsedPublicKey.(*rsa.PublicKey)
	require.True(t, ok)

	plaintext := "correct horse battery staple"
	ciphertext, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, publicKey, []byte(plaintext), nil)
	require.NoError(t, err)
	ciphertextBase64 := base64.StdEncoding.EncodeToString(ciphertext)

	decrypted, err := DecryptPassword(ciphertextBase64, keyID)
	require.NoError(t, err)
	assert.Equal(t, plaintext, decrypted)

	_, err = DecryptPassword(ciphertextBase64, keyID+"-mismatch")
	require.ErrorIs(t, err, ErrPasswordEncryptionInvalid)

	malformedCiphertexts := []string{
		"not-base64",
		base64.StdEncoding.EncodeToString([]byte("too short")),
		base64.StdEncoding.EncodeToString(make([]byte, publicKey.Size())),
	}
	for _, malformed := range malformedCiphertexts {
		_, err = DecryptPassword(malformed, keyID)
		require.ErrorIs(t, err, ErrPasswordEncryptionInvalid)
	}
}
