package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestFindPelicanTokenUsesOnlyRoot(t *testing.T) {
	previousDB, previousLogDB := DB, LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousGroupCol := commonGroupCol
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	commonGroupCol = "`group`"
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	DB, LOG_DB = db, db
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}))
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		commonGroupCol = previousGroupCol
		sqlDB, closeErr := db.DB()
		if closeErr == nil {
			_ = sqlDB.Close()
		}
	})

	root := User{Username: "root", Password: "root123456", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "root-aff"}
	user := User{Username: "alice", Password: "alice123456", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "vip", AffCode: "alice-aff"}
	require.NoError(t, db.Create(&root).Error)
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, db.Create(&Token{UserId: root.Id, Key: "root-key", Status: common.TokenStatusEnabled, Name: "root", ExpiredTime: -1, UnlimitedQuota: true, Group: "vip"}).Error)
	require.NoError(t, db.Create(&Token{UserId: user.Id, Key: "user-key", Status: common.TokenStatusEnabled, Name: "user", ExpiredTime: -1, UnlimitedQuota: true, Group: "vip"}).Error)

	got, err := FindPelicanToken("vip", 1)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "root-key", got.Key)

	require.NoError(t, db.Create(&Token{UserId: root.Id, Key: "inherit", Status: common.TokenStatusEnabled, Name: "inherit", ExpiredTime: -1, UnlimitedQuota: true, Group: ""}).Error)
	got, err = FindPelicanToken("default", 1)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "inherit", got.Key)

	got, err = FindPelicanToken("missing", 1)
	require.NoError(t, err)
	assert.Nil(t, got)
}
