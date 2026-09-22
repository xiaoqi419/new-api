package model

import (
	"github.com/QuantumNous/new-api/common"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestInitPasswordEncryptionPersistsAndReloadsKey(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}, &LoginEncryptionKey{}))

	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	require.NoError(t, InitPasswordEncryption())
	var stored LoginEncryptionKey
	require.NoError(t, db.Where("slot = ?", activeLoginEncryptionKeySlot).First(&stored).Error)
	assert.NotEmpty(t, stored.PrivateKeyPEM)
	firstValue := stored.PrivateKeyPEM

	// A second initialization must reuse the internal row rather than create a
	// second key, which is the behavior expected after AutoMigrate on restart.
	require.NoError(t, InitPasswordEncryption())
	var count int64
	require.NoError(t, db.Model(&LoginEncryptionKey{}).Where("slot = ?", activeLoginEncryptionKeySlot).Count(&count).Error)
	assert.Equal(t, int64(1), count)
	require.NoError(t, db.Where("slot = ?", activeLoginEncryptionKeySlot).First(&stored).Error)
	assert.Equal(t, firstValue, stored.PrivateKeyPEM)
}

func TestInitPasswordEncryptionPreservesLegacyKey(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}, &LoginEncryptionKey{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	key, err := common.GeneratePasswordEncryptionPrivateKey()
	require.NoError(t, err)
	require.NoError(t, db.Create(&Option{Key: passwordEncryptionOptionKey, Value: key}).Error)
	require.NoError(t, InitPasswordEncryption())
	var stored LoginEncryptionKey
	require.NoError(t, db.Where("slot = ?", activeLoginEncryptionKeySlot).First(&stored).Error)
	assert.Equal(t, key, stored.PrivateKeyPEM)
}
