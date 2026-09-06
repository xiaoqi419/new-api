package model

import (
	"os"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestMigratePrefillGroupUniquenessSQLiteIsNoOp(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&PrefillGroup{}))
	require.NoError(t, migratePrefillGroupUniqueness(db))

	group := &PrefillGroup{Name: "same", Type: "model", Items: JSONValue(`[]`)}
	require.NoError(t, db.Create(group).Error)
	// SQLite uses the model's partial unique index and permits reuse after a
	// soft delete; the PostgreSQL catalog migration is intentionally a no-op.
	require.NoError(t, db.Delete(group).Error)
	require.NoError(t, db.Create(&PrefillGroup{Name: "same", Type: "model", Items: JSONValue(`[]`)}).Error)
	assert.True(t, db.Migrator().HasIndex(&PrefillGroup{}, prefillGroupNameIndex))
}

func TestPrefillGroupMigrationRejectsUnknownUniqueObjects(t *testing.T) {
	err := (conflictingPrefillGroupUniqueness{
		constraints: []string{legacyPrefillGroupNameUnique, "unexpected_constraint"},
	}).validateAutomaticMigrationScope()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unexpected_constraint")

	require.NoError(t, (conflictingPrefillGroupUniqueness{
		indexes: []string{legacyPrefillGroupNameUnique},
	}).validateAutomaticMigrationScope())
}

func TestMigratePrefillGroupUniquenessMySQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_MYSQL_DSN"))
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, migratePrefillGroupUniqueness(db))
}

func TestMigratePrefillGroupUniquenessPostgreSQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, migratePrefillGroupUniqueness(db))
}
