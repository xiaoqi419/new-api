package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestInitPasswordEncryptionPersistsAndReloadsKey(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))

	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	require.NoError(t, InitPasswordEncryption())
	var stored Option
	require.NoError(t, db.Where("key = ?", passwordEncryptionOptionKey).First(&stored).Error)
	assert.NotEmpty(t, stored.Value)
	firstValue := stored.Value

	// A second initialization must reuse the internal row rather than create a
	// second key, which is the behavior expected after AutoMigrate on restart.
	require.NoError(t, InitPasswordEncryption())
	var count int64
	require.NoError(t, db.Model(&Option{}).Where("key = ?", passwordEncryptionOptionKey).Count(&count).Error)
	assert.Equal(t, int64(1), count)
	require.NoError(t, db.Where("key = ?", passwordEncryptionOptionKey).First(&stored).Error)
	assert.Equal(t, firstValue, stored.Value)
}
