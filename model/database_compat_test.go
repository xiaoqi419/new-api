package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestIs64BitIntegerTypeRecognizesSupportedDialects(t *testing.T) {
	tests := []struct {
		dbType   common.DatabaseType
		typeName string
		want     bool
	}{
		{dbType: common.DatabaseTypeMySQL, typeName: "BIGINT", want: true},
		{dbType: common.DatabaseTypeMySQL, typeName: "bigint unsigned", want: true},
		{dbType: common.DatabaseTypeMySQL, typeName: "INT", want: false},
		{dbType: common.DatabaseTypePostgreSQL, typeName: "int8", want: true},
		{dbType: common.DatabaseTypePostgreSQL, typeName: "bigint", want: true},
		{dbType: common.DatabaseTypePostgreSQL, typeName: "integer", want: false},
	}
	for _, test := range tests {
		t.Run(string(test.dbType)+"/"+test.typeName, func(t *testing.T) {
			assert.Equal(t, test.want, is64BitIntegerType(test.dbType, test.typeName))
		})
	}
}

func TestEnsureUserQuotaColumnsSQLiteSkipsDialectCheck(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}))
	require.NoError(t, ensureUserQuotaColumns(db, common.DatabaseTypeSQLite))
}
