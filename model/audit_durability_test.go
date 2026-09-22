package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
)

func TestOperationAuditReportsPersistenceFailureAndPreservesActor(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	previous := LOG_DB
	LOG_DB = db
	t.Cleanup(func() { LOG_DB = previous })
	admin := map[string]any{"admin_id": 7, "admin_role": common.RoleRootUser}
	// A missing audit table must fail a caller that requires durable auditing.
	require.Error(t, RecordOperationAuditLogWithError(7, "updated", "127.0.0.1", "settings.update", nil, admin, nil))
	require.NoError(t, db.AutoMigrate(&AuditLog{}))
	require.NoError(t, RecordOperationAuditLogWithError(7, "updated", "127.0.0.1", "settings.update", nil, admin, nil))
	var log AuditLog
	require.NoError(t, db.First(&log).Error)
	assert.Equal(t, common.RoleRootUser, log.ActorRole)
	assert.Equal(t, "settings.update", log.Action)
	require.NotNil(t, log.Other.AdminInfo)
	assert.Equal(t, 7, log.Other.AdminInfo.AdminID)
	assert.NotEmpty(t, log.EventId)
}
