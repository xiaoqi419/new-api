package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func useDistributorChannelFailoverPoolDatabase(t *testing.T) {
	t.Helper()
	originalDB, originalLogDB := model.DB, model.LOG_DB
	originalMainDatabaseType, originalLogDatabaseType := common.MainDatabaseType(), common.LogDatabaseType()
	originalSQLitePath := common.SQLitePath
	originalIsMasterNode := common.IsMasterNode
	common.SQLitePath = fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	common.IsMasterNode = false
	require.NoError(t, model.InitDB())
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}))
	t.Cleanup(func() {
		newDB := model.DB
		model.DB, model.LOG_DB = originalDB, originalLogDB
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		common.SQLitePath = originalSQLitePath
		common.IsMasterNode = originalIsMasterNode
		if sqlDB, err := newDB.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
}

func useDistributorChannelFailoverPoolSetting(t *testing.T, pools []operation_setting.ChannelRoutingPool) {
	t.Helper()
	configured, ok := config.GlobalConfig.Get(operation_setting.ChannelRoutingPoolSettingConfigName).(*operation_setting.ChannelRoutingPoolSetting)
	require.True(t, ok)
	original := operation_setting.GetChannelRoutingPoolSetting()
	configured.Pools = pools
	t.Cleanup(func() { configured.Pools = original.Pools })
}

func addDistributorChannelFailoverPoolChannel(t *testing.T, group, modelName, name string, priority int64) *model.Channel {
	t.Helper()
	channel := &model.Channel{
		Name:     name,
		Key:      name + "-key",
		Status:   common.ChannelStatusEnabled,
		Group:    group,
		Models:   modelName,
		Type:     1,
		Priority: &priority,
	}
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, model.DB.Create(&model.Ability{Group: group, Model: modelName, ChannelId: channel.Id, Enabled: true}).Error)
	return channel
}

func TestDistributeUsesChannelFailoverPoolBeforeInitialSelection(t *testing.T) {
	const group = "production"
	const modelName = "gpt-pool-test"
	useDistributorChannelFailoverPoolDatabase(t)
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() { common.MemoryCacheEnabled = originalMemoryCacheEnabled })

	primary := addDistributorChannelFailoverPoolChannel(t, group, modelName, "pool-primary", 20)
	backup := addDistributorChannelFailoverPoolChannel(t, group, modelName, "pool-backup", 10)
	_ = addDistributorChannelFailoverPoolChannel(t, group, modelName, "unlisted-high-priority", 30)
	useDistributorChannelFailoverPoolSetting(t, []operation_setting.ChannelRoutingPool{{
		ID:          "openai-production",
		Name:        "OpenAI production",
		Enabled:     true,
		Group:       group,
		ChannelType: 1,
		ChannelIDs:  []int{primary.Id, backup.Id},
	}})
	model.InitChannelCache()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	var selectedID int
	router.Use(func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
		c.Next()
	})
	router.Use(Distribute())
	router.POST("/v1/chat/completions", func(c *gin.Context) {
		selectedID = common.GetContextKeyInt(c, constant.ContextKeyChannelId)
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-pool-test","messages":[{"role":"user","content":"hello"}]}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	assert.Equal(t, http.StatusNoContent, recorder.Code)
	assert.Equal(t, primary.Id, selectedID)
}

func TestDistributeSpecificChannelBypassesChannelFailoverPool(t *testing.T) {
	const group = "production"
	const modelName = "gpt-pool-test"
	useDistributorChannelFailoverPoolDatabase(t)
	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() { common.MemoryCacheEnabled = originalMemoryCacheEnabled })

	pooled := addDistributorChannelFailoverPoolChannel(t, group, modelName, "pool-primary", 20)
	specific := addDistributorChannelFailoverPoolChannel(t, group, modelName, "specific-unlisted", 10)
	useDistributorChannelFailoverPoolSetting(t, []operation_setting.ChannelRoutingPool{{
		ID:          "openai-production",
		Name:        "OpenAI production",
		Enabled:     true,
		Group:       group,
		ChannelType: 1,
		ChannelIDs:  []int{pooled.Id},
	}})
	model.InitChannelCache()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	var selectedID int
	var managedPool bool
	router.Use(func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
		common.SetContextKey(c, constant.ContextKeyTokenSpecificChannelId, fmt.Sprintf("%d", specific.Id))
		c.Next()
	})
	router.Use(Distribute())
	router.POST("/v1/chat/completions", func(c *gin.Context) {
		selectedID = common.GetContextKeyInt(c, constant.ContextKeyChannelId)
		managedPool = common.GetContextKeyString(c, constant.ContextKeyChannelFailoverPoolID) != ""
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-pool-test","messages":[{"role":"user","content":"hello"}]}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	assert.Equal(t, http.StatusNoContent, recorder.Code)
	assert.Equal(t, specific.Id, selectedID)
	assert.False(t, managedPool)
}
