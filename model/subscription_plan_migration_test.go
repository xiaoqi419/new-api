package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useSubscriptionPlanMigrationDB(t *testing.T) *gorm.DB {
	t.Helper()

	previousDB, previousLogDB := DB, LOG_DB
	previousMainDatabaseType := common.MainDatabaseType()
	previousLogDatabaseType := common.LogDatabaseType()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB, LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		_ = sqlDB.Close()
	})

	return db
}

func TestEnsureSubscriptionPlanTableSQLiteCreatesScopeGroup(t *testing.T) {
	db := useSubscriptionPlanMigrationDB(t)

	require.NoError(t, ensureSubscriptionPlanTableSQLite())
	assert.True(t, db.Migrator().HasColumn(&SubscriptionPlan{}, "scope_group"))

	plan := SubscriptionPlan{
		Title:            "Codex Plan",
		PriceAmount:      12.5,
		Currency:         "USD",
		DurationUnit:     "month",
		DurationValue:    1,
		ScopeGroup:       "codex",
		TotalAmount:      1000,
		QuotaResetPeriod: "never",
	}
	require.NoError(t, db.Create(&plan).Error)
	require.NotZero(t, plan.Id)

	var stored SubscriptionPlan
	require.NoError(t, db.First(&stored, plan.Id).Error)
	assert.Equal(t, "codex", stored.ScopeGroup)
}

func TestEnsureSubscriptionPlanTableSQLiteUpgradesLegacyTableIdempotently(t *testing.T) {
	db := useSubscriptionPlanMigrationDB(t)

	legacyDDL := `CREATE TABLE subscription_plans (
		id integer PRIMARY KEY,
		title varchar(128) NOT NULL,
		subtitle varchar(255) DEFAULT '',
		price_amount decimal(10,6) NOT NULL,
		currency varchar(8) NOT NULL DEFAULT 'USD',
		duration_unit varchar(16) NOT NULL DEFAULT 'month',
		duration_value integer NOT NULL DEFAULT 1,
		custom_seconds bigint NOT NULL DEFAULT 0,
		enabled numeric DEFAULT 1,
		sort_order integer DEFAULT 0,
		allow_balance_pay numeric DEFAULT 1,
		allow_wallet_overflow numeric DEFAULT 1,
		stripe_price_id varchar(128) DEFAULT '',
		creem_product_id varchar(128) DEFAULT '',
		waffo_pancake_product_id varchar(128) DEFAULT '',
		max_purchase_per_user integer DEFAULT 0,
		upgrade_group varchar(64) DEFAULT '',
		downgrade_group varchar(64) DEFAULT '',
		total_amount bigint NOT NULL DEFAULT 0,
		quota_reset_period varchar(16) DEFAULT 'never',
		quota_reset_custom_seconds bigint DEFAULT 0,
		created_at bigint,
		updated_at bigint
	)`
	require.NoError(t, db.Exec(legacyDDL).Error)
	require.NoError(t, db.Exec(`
		INSERT INTO subscription_plans
			(id, title, subtitle, price_amount, upgrade_group, downgrade_group, total_amount)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, 41, "Legacy Plan", "preserve me", 8.75, "pro", "default", 750).Error)

	require.NoError(t, ensureSubscriptionPlanTableSQLite())
	assert.True(t, db.Migrator().HasColumn(&SubscriptionPlan{}, "scope_group"))

	var legacy SubscriptionPlan
	require.NoError(t, db.First(&legacy, 41).Error)
	assert.Equal(t, "Legacy Plan", legacy.Title)
	assert.Equal(t, "preserve me", legacy.Subtitle)
	assert.Equal(t, 8.75, legacy.PriceAmount)
	assert.Equal(t, "pro", legacy.UpgradeGroup)
	assert.Equal(t, "default", legacy.DowngradeGroup)
	assert.Empty(t, legacy.ScopeGroup)
	assert.EqualValues(t, 750, legacy.TotalAmount)

	plan := SubscriptionPlan{
		Title:            "Codex Plan",
		PriceAmount:      16,
		Currency:         "USD",
		DurationUnit:     "month",
		DurationValue:    1,
		ScopeGroup:       "codex",
		TotalAmount:      1600,
		QuotaResetPeriod: "never",
	}
	require.NoError(t, db.Create(&plan).Error)
	require.NoError(t, ensureSubscriptionPlanTableSQLite())

	var stored SubscriptionPlan
	require.NoError(t, db.First(&stored, plan.Id).Error)
	assert.Equal(t, "codex", stored.ScopeGroup)

	var columns []struct {
		Name string `gorm:"column:name"`
	}
	require.NoError(t, db.Raw("PRAGMA table_info(`subscription_plans`)").Scan(&columns).Error)
	scopeGroupColumns := 0
	for _, column := range columns {
		if column.Name == "scope_group" {
			scopeGroupColumns++
		}
	}
	assert.Equal(t, 1, scopeGroupColumns)
}
