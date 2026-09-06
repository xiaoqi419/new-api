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

func TestMigrateTokenKeyUniquenessSQLiteIsNoOp(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Token{}))
	require.NoError(t, migrateTokenKeyUniqueness(db))
	require.True(t, db.Migrator().HasIndex(&Token{}, tokenKeyIndex))
}

func TestValidateTokenKeyUniqueConstraints(t *testing.T) {
	valid := []tokenKeyUniqueConstraint{{
		Name: "tokens_key_key", Definition: "UNIQUE (key)", Validated: true,
	}}
	require.NoError(t, validateTokenKeyUniqueConstraints(valid))

	for _, test := range []struct {
		name       string
		constraint tokenKeyUniqueConstraint
		contains   string
	}{
		{name: "unknown name", constraint: tokenKeyUniqueConstraint{Name: "custom_key_unique", Definition: "UNIQUE (key)", Validated: true}, contains: "custom_key_unique"},
		{name: "deferrable", constraint: tokenKeyUniqueConstraint{Name: tokenKeyIndex, Definition: "UNIQUE (key)", Deferrable: true, Validated: true}, contains: "unsupported definition"},
		{name: "not validated", constraint: tokenKeyUniqueConstraint{Name: tokenKeyIndex, Definition: "UNIQUE (key)", Validated: false}, contains: "unsupported definition"},
		{name: "nulls not distinct", constraint: tokenKeyUniqueConstraint{Name: tokenKeyIndex, Definition: "UNIQUE NULLS NOT DISTINCT (key)", Validated: true}, contains: "unsupported definition"},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := validateTokenKeyUniqueConstraints([]tokenKeyUniqueConstraint{test.constraint})
			require.Error(t, err)
			assert.Contains(t, err.Error(), test.contains)
		})
	}
}

func TestMigrateTokenKeyUniquenessMySQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_MYSQL_DSN"))
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, migrateTokenKeyUniqueness(db))
}

func TestMigrateTokenKeyUniquenessPostgreSQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, migrateTokenKeyUniqueness(db))
}
