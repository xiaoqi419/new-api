package model

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupTopUpQueryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB, previousLogDB := DB, LOG_DB
	previousMainDatabaseType, previousLogDatabaseType := common.MainDatabaseType(), common.LogDatabaseType()
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	DB, LOG_DB = db, db
	require.NoError(t, db.AutoMigrate(&TopUp{}))

	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestGetAllTopUpsByUserFiltersAndPaginatesCompleteHistory(t *testing.T) {
	db := setupTopUpQueryTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, db.Create(&[]TopUp{
		{Id: 1, UserId: 1, CreateTime: now - 60*24*60*60, TradeNo: "u1-old"},
		{Id: 2, UserId: 1, CreateTime: now - 2*24*60*60, TradeNo: "u1-middle"},
		{Id: 3, UserId: 1, CreateTime: now - 24*60*60, TradeNo: "u1-new"},
		{Id: 4, UserId: 2, CreateTime: now - 12*60*60, TradeNo: "u2-new"},
	}).Error)

	pageOne := &common.PageInfo{Page: 1, PageSize: 2}
	items, total, err := GetAllTopUpsByUser(1, pageOne)
	require.NoError(t, err)
	assert.EqualValues(t, 3, total)
	require.Len(t, items, 2)
	assert.Equal(t, []string{"u1-new", "u1-middle"}, []string{items[0].TradeNo, items[1].TradeNo})

	pageTwo := &common.PageInfo{Page: 2, PageSize: 2}
	items, total, err = GetAllTopUpsByUser(1, pageTwo)
	require.NoError(t, err)
	assert.EqualValues(t, 3, total)
	require.Len(t, items, 1)
	assert.Equal(t, "u1-old", items[0].TradeNo)
}
