package model

import (
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
)

func TestOptionPrimaryKeyMigrationRejectsConflictingValuesWithoutChangingRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec("CREATE TABLE options (key TEXT, value TEXT)").Error)
	rows := []Option{{Key: "ModelPrice", Value: `{"custom":1}`}, {Key: "ModelPrice", Value: `{"custom":2}`}}
	require.NoError(t, db.Create(&rows).Error)
	err = migrateOptionPrimaryKey(db)
	require.ErrorContains(t, err, "conflicting duplicate values")
	require.ErrorContains(t, err, "ModelPrice")
	var got []Option
	require.NoError(t, db.Find(&got).Error)
	assert.ElementsMatch(t, rows, got)
	assert.False(t, db.Migrator().HasTable(optionPrimaryKeyTmpTable))
}

func TestOptionPrimaryKeyMigrationPreservesIdenticalDuplicatesAndTierOptions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec("CREATE TABLE options (key TEXT, value TEXT)").Error)
	rows := []Option{{Key: "ModelPrice", Value: `{"custom":1}`}, {Key: "ModelPrice", Value: `{"custom":1}`}, {Key: "ImagePriceTiers", Value: `{"custom":[]}`}, {Key: "VideoPriceTiers", Value: `{"video":[]}`}}
	require.NoError(t, db.Create(&rows).Error)
	require.NoError(t, migrateOptionPrimaryKey(db))
	var got []Option
	require.NoError(t, db.Find(&got).Error)
	assert.ElementsMatch(t, []Option{rows[0], rows[2], rows[3]}, got)
	unique, err := optionsKeyIsUnique(db)
	require.NoError(t, err)
	assert.True(t, unique)
	require.NoError(t, migrateOptionPrimaryKey(db))
}
