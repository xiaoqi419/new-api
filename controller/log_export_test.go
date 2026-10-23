package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// callLogHandler runs a log handler as the given user and returns the JSON
// lines of the response.
func callLogHandler(t *testing.T, handler gin.HandlerFunc, userId int, role int, query string) []map[string]any {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/log?"+query, nil)
	ctx.Set("id", userId)
	ctx.Set("role", role)
	handler(ctx)
	var lines []map[string]any
	for line := range strings.SplitSeq(strings.TrimSpace(recorder.Body.String()), "\n") {
		var value map[string]any
		require.NoError(t, common.UnmarshalJsonStr(line, &value))
		lines = append(lines, value)
	}
	return lines
}

func exportedRequestIds(lines []map[string]any) []any {
	ids := make([]any, 0, len(lines))
	for _, line := range lines[:len(lines)-1] {
		ids = append(ids, line["request_id"])
	}
	return ids
}

// seedExportLogs stores logs of two users: three in the last hour and one
// from 400 days ago.
func seedExportLogs(t *testing.T, mainDB *gorm.DB, logDB *gorm.DB, now int64) {
	t.Helper()
	require.NoError(t, mainDB.Create(&model.Channel{Id: 9, Name: "primary"}).Error)
	logs := []model.Log{
		{UserId: 1, Username: "alice", CreatedAt: now - 3600, Type: model.LogTypeConsume, ModelName: "gpt-a", ChannelId: 9, Quota: 10, RequestId: "a-1", Other: `{"admin_info":{"use_channel":["9"]}}`},
		{UserId: 2, Username: "bob", CreatedAt: now - 1800, Type: model.LogTypeConsume, ModelName: "gpt-b", ChannelId: 9, Quota: 20, RequestId: "b-1"},
		{UserId: 1, Username: "alice", CreatedAt: now - 60, Type: model.LogTypeError, ModelName: "gpt-a", RequestId: "a-2"},
		{UserId: 1, Username: "alice", CreatedAt: now - 400*24*3600, Type: model.LogTypeConsume, ModelName: "gpt-a", RequestId: "a-old"},
	}
	for i := range logs {
		require.NoError(t, logDB.Create(&logs[i]).Error)
	}
}

func useLogExportDatabases(t *testing.T, mainDB *gorm.DB, logDB *gorm.DB, mainType common.DatabaseType, logType common.DatabaseType) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis, previousMemory := common.RedisEnabled, common.MemoryCacheEnabled
	model.DB, model.LOG_DB = mainDB, logDB
	common.SetDatabaseTypes(mainType, logType)
	common.RedisEnabled, common.MemoryCacheEnabled = false, false
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.RedisEnabled, common.MemoryCacheEnabled = previousRedis, previousMemory
	})
}

func TestLogExportDatabaseMatrix(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousMaster := common.IsMasterNode
	common.IsMasterNode = true
	t.Cleanup(func() { common.IsMasterNode = previousMaster })
	for _, tc := range []struct {
		kind, env string
		typ       common.DatabaseType
	}{
		{"sqlite", "", common.DatabaseTypeSQLite},
		{"mysql", "AUDIT_MYSQL_DSN", common.DatabaseTypeMySQL},
		{"postgres", "AUDIT_POSTGRES_DSN", common.DatabaseTypePostgreSQL},
		{"clickhouse", "AUDIT_CLICKHOUSE_DSN", common.DatabaseTypeClickHouse},
	} {
		t.Run(tc.kind, func(t *testing.T) {
			dsn := os.Getenv(tc.env)
			if tc.env != "" && dsn == "" {
				t.Skip(tc.env + " is not configured")
			}
			db, isolatedDSN := newAuditTestDatabase(t, tc.kind, dsn)
			mainDB, mainType := db, tc.typ
			if tc.kind == "clickhouse" {
				mainDB, _ = newAuditTestDatabase(t, "sqlite", "")
				mainType = common.DatabaseTypeSQLite
			}
			useLogExportDatabases(t, mainDB, db, mainType, tc.typ)
			require.NoError(t, mainDB.AutoMigrate(&model.Channel{}))
			if tc.kind == "clickhouse" {
				t.Setenv("LOG_SQL_DSN", isolatedDSN)
				require.NoError(t, model.InitLogDB())
			} else {
				require.NoError(t, db.AutoMigrate(&model.Log{}))
			}
			versionSQL := "SELECT version()"
			if tc.kind == "sqlite" {
				versionSQL = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, model.LOG_DB.Raw(versionSQL).Scan(&version).Error)
			t.Logf("log database: %s %s", tc.kind, version)
			now := time.Now().Unix()
			seedExportLogs(t, mainDB, model.LOG_DB, now)
			query := fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", now-2*24*3600, now+3600)

			listed := callLogHandler(t, GetUserLogs, 1, common.RoleCommonUser, query)[0]
			require.Equal(t, true, listed["success"])
			assert.EqualValues(t, 2, listed["data"].(map[string]any)["total"])
			listed = callLogHandler(t, GetAllLogs, 3, common.RoleAdminUser, query+"&username=alice")[0]
			require.Equal(t, true, listed["success"])
			assert.EqualValues(t, 2, listed["data"].(map[string]any)["total"])

			own := callLogHandler(t, ExportUserLogs, 1, common.RoleCommonUser, query)
			require.Len(t, own, 3)
			assert.Equal(t, []any{"a-2", "a-1"}, exportedRequestIds(own))
			assert.Equal(t, map[string]any{"success": true, "message": "", "data": map[string]any{"count": float64(2)}}, own[2])
			assert.Equal(t, float64(1), own[0]["id"], "user exports carry list positions, not row ids")
			assert.Empty(t, own[1]["channel_name"])
			assert.NotContains(t, own[1]["other"], "admin_info")

			all := callLogHandler(t, ExportAllLogs, 3, common.RoleAdminUser, query+"&model_name=gpt-%25")
			require.Len(t, all, 4)
			assert.Equal(t, []any{"a-2", "b-1", "a-1"}, exportedRequestIds(all))
			assert.Equal(t, "primary", all[2]["channel_name"])
			assert.Contains(t, all[2]["other"], "admin_info")
			assert.Equal(t, true, all[3]["success"])
		})
	}
}

func TestLogExportRules(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	useLogExportDatabases(t, db, db, common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Log{}, &model.QuotaData{}))
	now := time.Now().Unix()
	seedExportLogs(t, db, db, now)
	logSetting := operation_setting.GetLogSetting()
	previousSetting := *logSetting
	t.Cleanup(func() { *logSetting = previousSetting })
	recent := fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", now-2*24*3600, now)
	tooLong := fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", now-366*24*3600, now)

	t.Run("time range", func(t *testing.T) {
		rejected := callLogHandler(t, ExportAllLogs, 3, common.RoleAdminUser, tooLong)
		require.Len(t, rejected, 1)
		assert.Equal(t, false, rejected[0]["success"])
		assert.Equal(t, "The time range cannot exceed {{days}} days", rejected[0]["message_key"])
		assert.Equal(t, map[string]any{"days": float64(365)}, rejected[0]["message_params"])

		assert.Equal(t, false, callLogHandler(t, GetUserLogs, 1, common.RoleCommonUser, tooLong)[0]["success"])
		assert.Equal(t, false, callLogHandler(t, GetLogsSelfStat, 1, common.RoleCommonUser, tooLong)[0]["success"])
		assert.Equal(t, true, callLogHandler(t, GetUserLogs, 3, common.RoleAdminUser, tooLong)[0]["success"], "administrators search their own logs without a limit")

		// The dashboard follows the same range instead of its old one-month limit.
		fortyDays := fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", now-40*24*3600, now)
		for _, handler := range []gin.HandlerFunc{GetUserQuotaDates, GetUserFlowQuotaDates} {
			assert.Equal(t, "The time range cannot exceed {{days}} days", callLogHandler(t, handler, 1, common.RoleCommonUser, tooLong)[0]["message_key"])
			assert.Equal(t, true, callLogHandler(t, handler, 1, common.RoleCommonUser, fortyDays)[0]["success"])
		}

		// Without a start, a user's search reaches back the whole range.
		listed := callLogHandler(t, GetUserLogs, 1, common.RoleCommonUser, "")[0]
		assert.Equal(t, true, listed["success"])
		assert.EqualValues(t, 2, listed["data"].(map[string]any)["total"])

		logSetting.MaxRangeDays = 400
		assert.Equal(t, true, callLogHandler(t, GetUserLogs, 1, common.RoleCommonUser, tooLong)[0]["success"])
		logSetting.MaxRangeDays = previousSetting.MaxRangeDays

		for _, query := range []string{
			"start_timestamp=-9223372036854775808",
			"end_timestamp=-1",
			fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", now, now-1),
		} {
			for _, handler := range []gin.HandlerFunc{GetUserLogs, GetLogsSelfStat, ExportUserLogs, ExportAllLogs} {
				response := callLogHandler(t, handler, 1, common.RoleCommonUser, query)
				require.Len(t, response, 1)
				assert.Equal(t, false, response[0]["success"], query)
				assert.Equal(t, "Invalid parameters", response[0]["message_key"], query)
			}
		}
	})

	t.Run("user export switch", func(t *testing.T) {
		logSetting.UserExportEnabled = false
		t.Cleanup(func() { logSetting.UserExportEnabled = previousSetting.UserExportEnabled })
		disabled := callLogHandler(t, ExportUserLogs, 1, common.RoleCommonUser, recent)
		require.Len(t, disabled, 1)
		assert.Equal(t, "Log export is disabled", disabled[0]["message_key"])
		assert.Equal(t, true, callLogHandler(t, ExportUserLogs, 3, common.RoleAdminUser, recent)[0]["success"], "administrators export their own logs even when users cannot")
	})

	t.Run("one export per user", func(t *testing.T) {
		release, ok, err := service.AcquireLogExportLock(1)
		require.NoError(t, err)
		require.True(t, ok)
		busy := callLogHandler(t, ExportUserLogs, 1, common.RoleCommonUser, recent)
		require.Len(t, busy, 1)
		assert.Equal(t, "Another log export is running. Try again after it finishes.", busy[0]["message_key"])
		other := callLogHandler(t, ExportUserLogs, 2, common.RoleCommonUser, recent)
		assert.Equal(t, true, other[len(other)-1]["success"], "other users are not blocked")
		release()
		assert.Len(t, callLogHandler(t, ExportUserLogs, 1, common.RoleCommonUser, recent), 3)
	})
}

func TestAcquireLogExportLock(t *testing.T) {
	for _, useRedis := range []bool{false, true} {
		t.Run(fmt.Sprintf("redis=%v", useRedis), func(t *testing.T) {
			previousRedis, previousClient := common.RedisEnabled, common.RDB
			common.RedisEnabled = useRedis
			if useRedis {
				server := miniredis.RunT(t)
				common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
				require.NoError(t, common.RDB.Ping(context.Background()).Err())
			}
			t.Cleanup(func() { common.RedisEnabled, common.RDB = previousRedis, previousClient })

			release, ok, err := service.AcquireLogExportLock(1)
			require.NoError(t, err)
			require.True(t, ok)
			_, ok, err = service.AcquireLogExportLock(1)
			require.NoError(t, err)
			assert.False(t, ok, "a second export of the same user must wait")
			releaseOther, ok, err := service.AcquireLogExportLock(2)
			require.NoError(t, err)
			assert.True(t, ok)
			releaseOther()
			release()
			releaseAgain, ok, err := service.AcquireLogExportLock(1)
			require.NoError(t, err)
			assert.True(t, ok, "a finished export frees the user")
			releaseAgain()
		})
	}
}

func TestLogExportPreservesForkFieldsAndRoleVisibility(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	useLogExportDatabases(t, db, db, common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Log{}))
	require.NoError(t, db.Create(&model.Channel{Id: 9, Name: "private-channel"}).Error)
	setting := operation_setting.GetLogSetting()
	previousSetting := *setting
	setting.UserExportEnabled = true
	t.Cleanup(func() { *setting = previousSetting })

	now := common.GetTimestamp()
	const quota = 1<<40 + 123
	logs := []model.Log{
		{
			UserId: 1, Username: "shared-name", CreatedAt: now - 10, Type: model.LogTypeConsume,
			RequestId: "owned-image", UpstreamRequestId: "upstream-owned", TokenName: "image-token", TokenId: 42,
			ModelName: "image-model", Quota: quota, ChannelId: 9, InputTokens: 100, CacheReadTokens: 25, CacheWriteTokens: 10,
			FirstTokenMs: 125, IsImage: true, LogMode: "images", Group: "default",
			Other: `{"cached_tokens":25,"input_image_tokens":30,"task_id":"owned-task","precise":9007199254740993,"admin_info":{"routing":"admin-only"},"root_info":{"trace":"root-only"},"audit_info":{"actor":"admin-actor"},"channel_name":"legacy-private"}`,
		},
		{UserId: 2, Username: "shared-name", CreatedAt: now - 9, Type: model.LogTypeConsume, RequestId: "foreign", Quota: quota, TokenName: "image-token"},
		{UserId: 1, Username: "shared-name", CreatedAt: now - 8, Type: model.LogTypeConsume, RequestId: "owned-negative", Quota: -quota},
		{UserId: 1, Username: "shared-name", CreatedAt: now - 7, Type: model.LogTypeConsume, RequestId: "owned-zero"},
	}
	require.NoError(t, db.Create(&logs).Error)
	query := fmt.Sprintf("start_timestamp=%d&end_timestamp=%d&quota_status=positive&token_name=image-token", now-60, now)

	for _, tc := range []struct {
		name         string
		handler      gin.HandlerFunc
		role         int
		adminVisible bool
		rootVisible  bool
		channelName  string
	}{
		{name: "user", handler: ExportUserLogs, role: common.RoleCommonUser},
		{name: "admin self remains user projected", handler: ExportUserLogs, role: common.RoleAdminUser},
		{name: "administrator", handler: ExportAllLogs, role: common.RoleAdminUser, adminVisible: true, channelName: "private-channel"},
		{name: "root", handler: ExportAllLogs, role: common.RoleRootUser, adminVisible: true, rootVisible: true, channelName: "private-channel"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			username := "ignored-by-self"
			if tc.adminVisible {
				username = "shared-name"
			}
			lines := callLogHandler(t, tc.handler, 1, tc.role, query+"&request_id=owned-image&username="+username+"&channel=9")
			require.Len(t, lines, 2)
			row := lines[0]
			assert.EqualValues(t, quota, row["quota"])
			assert.EqualValues(t, 100, row["input_tokens"])
			assert.EqualValues(t, 25, row["cache_read_tokens"])
			assert.EqualValues(t, 10, row["cache_write_tokens"])
			assert.EqualValues(t, 125, row["first_token_ms"])
			assert.EqualValues(t, 42, row["token_id"])
			assert.Equal(t, "image-token", row["token_name"])
			assert.Equal(t, true, row["is_image"])
			assert.Equal(t, "images", row["log_mode"])
			assert.Equal(t, "upstream-owned", row["upstream_request_id"])
			assert.Equal(t, tc.channelName, row["channel_name"])
			other := row["other"].(string)
			assert.Contains(t, other, `"precise":9007199254740993`)
			assert.Contains(t, other, `"task_id":"owned-task"`)
			assert.Contains(t, other, `"input_image_tokens":30`)
			assert.Equal(t, tc.adminVisible, strings.Contains(other, "admin-only"))
			assert.Equal(t, tc.adminVisible, strings.Contains(other, "admin-actor"))
			assert.Equal(t, tc.rootVisible, strings.Contains(other, "root-only"))
			if !tc.adminVisible {
				assert.NotContains(t, other, "legacy-private")
			}
		})
	}

	for _, tc := range []struct{ status, requestID string }{
		{status: "positive", requestID: "owned-image"},
		{status: "negative", requestID: "owned-negative"},
		{status: "zero", requestID: "owned-zero"},
	} {
		t.Run(tc.status, func(t *testing.T) {
			query := fmt.Sprintf("start_timestamp=%d&end_timestamp=%d&quota_status=%s", now-60, now, tc.status)
			lines := callLogHandler(t, ExportUserLogs, 1, common.RoleCommonUser, query)
			require.Len(t, lines, 2)
			assert.Equal(t, tc.requestID, lines[0]["request_id"])
			listed := callLogHandler(t, GetUserLogs, 1, common.RoleCommonUser, query)
			data := listed[0]["data"].(map[string]any)
			assert.EqualValues(t, 1, data["total"])
			rows := data["items"].([]any)
			require.Len(t, rows, 1)
			assert.Equal(t, tc.requestID, rows[0].(map[string]any)["request_id"])
		})
	}
}

func TestLogsSelfStatScopesSharedUsernamesToUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	useLogExportDatabases(t, db, db, common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	now := common.GetTimestamp()
	for _, entry := range []model.Log{
		{UserId: 1, Username: "shared-name", CreatedAt: now - 10, Type: model.LogTypeConsume, Quota: 1<<40 + 123, PromptTokens: 10, CompletionTokens: 5},
		{UserId: 2, Username: "shared-name", CreatedAt: now - 10, Type: model.LogTypeConsume, Quota: 999, PromptTokens: 100, CompletionTokens: 50},
	} {
		require.NoError(t, db.Create(&entry).Error)
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/log/self/stat?start_timestamp=%d&end_timestamp=%d", now-60, now), nil)
	c.Set("id", 1)
	c.Set("username", "shared-name")
	c.Set("role", common.RoleCommonUser)
	GetLogsSelfStat(c)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Quota int64 `json:"quota"`
			RPM   int   `json:"rpm"`
			TPM   int   `json:"tpm"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success, recorder.Body.String())
	assert.Equal(t, int64(1<<40+123), response.Data.Quota)
	assert.Equal(t, 1, response.Data.RPM)
	assert.Equal(t, 15, response.Data.TPM)
}

func TestLogExportCompletesWithOneSharedDatabaseConnection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	useLogExportDatabases(t, db, db, common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Log{}))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.Create(&model.Channel{Id: 9, Name: "single-connection-channel"}).Error)
	now := common.GetTimestamp()
	require.NoError(t, db.Create(&model.Log{UserId: 1, CreatedAt: now - 1, RequestId: "single-connection", Type: model.LogTypeConsume, ChannelId: 9}).Error)

	cursorOpened := false
	require.NoError(t, db.Callback().Row().After("gorm:row").Register("test:export_cursor_opened", func(tx *gorm.DB) {
		if tx.Statement.Table == "logs" {
			cursorOpened = true
		}
	}))
	// Reject a nested lookup before it can wait forever for the cursor's connection.
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("test:reject_nested_channel_lookup", func(tx *gorm.DB) {
		if cursorOpened && tx.Statement.Table == "channels" {
			tx.AddError(errors.New("channel lookup attempted while the log cursor is open"))
		}
	}))

	lines := callLogHandler(t, ExportAllLogs, 1, common.RoleAdminUser, fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", now-60, now))
	require.Len(t, lines, 2)
	assert.Equal(t, "single-connection-channel", lines[0]["channel_name"])
	assert.Equal(t, true, lines[1]["success"])
	assert.Equal(t, map[string]any{"count": float64(1)}, lines[1]["data"])

	cursorOpened = false
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err = model.StreamAllLogs(ctx, model.LogFilter{}, common.RoleAdminUser, func(*model.Log) error {
		t.Error("a canceled export must not deliver any row")
		return nil
	})
	assert.ErrorIs(t, err, context.Canceled)
	var count int64
	require.NoError(t, db.Model(&model.Log{}).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

func TestLogExportReadsChannelNamesFromSeparateMainDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mainDB, _ := newAuditTestDatabase(t, "sqlite", "")
	logDB, _ := newAuditTestDatabase(t, "sqlite", "")
	useLogExportDatabases(t, mainDB, logDB, common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, mainDB.AutoMigrate(&model.Channel{}))
	require.NoError(t, logDB.AutoMigrate(&model.Log{}))
	require.NoError(t, mainDB.Create(&model.Channel{Id: 9, Name: "main-database-channel"}).Error)
	now := common.GetTimestamp()
	require.NoError(t, logDB.Create(&model.Log{UserId: 1, CreatedAt: now - 1, RequestId: "separate-log-database", Type: model.LogTypeConsume, ChannelId: 9}).Error)
	query := fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", now-60, now)
	admin := callLogHandler(t, ExportAllLogs, 1, common.RoleAdminUser, query)
	require.Len(t, admin, 2)
	assert.Equal(t, "main-database-channel", admin[0]["channel_name"])
	assert.Equal(t, true, admin[1]["success"])
	user := callLogHandler(t, ExportUserLogs, 1, common.RoleAdminUser, query)
	require.Len(t, user, 2)
	assert.Empty(t, user[0]["channel_name"])
	assert.Equal(t, true, user[1]["success"])
}
