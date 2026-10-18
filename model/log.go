package model

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"

	"gorm.io/gorm"
)

func applyExplicitLogTextFilter(tx *gorm.DB, column string, value string) (*gorm.DB, error) {
	if value == "" {
		return tx, nil
	}
	if strings.Contains(value, "%") {
		condition, pattern, err := buildLogLikeCondition(column, value)
		if err != nil {
			return nil, err
		}
		return tx.Where(condition, pattern), nil
	}
	return tx.Where(column+" = ?", value), nil
}

func buildLogLikeCondition(column string, value string) (string, string, error) {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		pattern, err := sanitizeClickHouseLikePattern(value)
		if err != nil {
			return "", "", err
		}
		return column + " LIKE ?", pattern, nil
	}

	pattern, err := sanitizeLikePattern(value)
	if err != nil {
		return "", "", err
	}
	return column + " LIKE ? ESCAPE '!'", pattern, nil
}

func sanitizeClickHouseLikePattern(input string) (string, error) {
	input = strings.ReplaceAll(input, `\`, `\\`)
	input = strings.ReplaceAll(input, `_`, `\_`)

	if err := validateLikePattern(input); err != nil {
		return "", err
	}
	return input, nil
}

type Log struct {
	Id                int    `json:"id" gorm:"index:idx_created_at_id,priority:2;index:idx_user_id_id,priority:2"`
	UserId            int    `json:"user_id" gorm:"index;index:idx_user_id_id,priority:1"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;index:idx_created_at_id,priority:1;index:idx_created_at_type"`
	Type              int    `json:"type" gorm:"index:idx_created_at_type"`
	Content           string `json:"content"`
	Username          string `json:"username" gorm:"index;index:index_username_model_name,priority:2;default:''"`
	TokenName         string `json:"token_name" gorm:"index;default:''"`
	ModelName         string `json:"model_name" gorm:"index;index:index_username_model_name,priority:1;default:''"`
	Quota             int    `json:"quota" gorm:"default:0"`
	PromptTokens      int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens  int    `json:"completion_tokens" gorm:"default:0"`
	UseTime           int    `json:"use_time" gorm:"default:0"`
	FirstTokenMs      int    `json:"first_token_ms" gorm:"default:0"`
	InputTokens       int64  `json:"input_tokens" gorm:"default:0"`
	CacheReadTokens   int64  `json:"cache_read_tokens" gorm:"default:0"`
	CacheWriteTokens  int64  `json:"cache_write_tokens" gorm:"default:0"`
	IsStream          bool   `json:"is_stream"`
	ChannelId         int    `json:"channel" gorm:"index"`
	ChannelName       string `json:"channel_name" gorm:"->"`
	TokenId           int    `json:"token_id" gorm:"default:0;index"`
	Group             string `json:"group" gorm:"index"`
	Ip                string `json:"ip" gorm:"index;default:''"`
	RequestId         string `json:"request_id,omitempty" gorm:"type:varchar(64);index:idx_logs_request_id;default:''"`
	UpstreamRequestId string `json:"upstream_request_id,omitempty" gorm:"type:varchar(128);index:idx_logs_upstream_request_id;default:''"`
	Other             string `json:"other"`
	IsImage           bool   `json:"is_image" gorm:"index"`
	LogMode           string `json:"log_mode" gorm:"type:varchar(32);index;default:''"`
}

// don't use iota, avoid change log type value
const (
	LogTypeUnknown = 0
	LogTypeTopup   = 1
	LogTypeConsume = 2
	LogTypeManage  = 3
	LogTypeSystem  = 4
	LogTypeError   = 5
	LogTypeRefund  = 6
	LogTypeLogin   = 7
)

func ensureLogRequestId(log *Log) {
	if log != nil && log.RequestId == "" {
		log.RequestId = common.NewRequestId()
	}
}

func createLog(log *Log) error {
	ensureLogRequestId(log)
	return LOG_DB.Create(log).Error
}

func clickHouseLogOrder(prefix string) string {
	return prefix + "created_at desc, " + prefix + "request_id desc"
}

func assignDisplayLogIds(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].Id = startIdx + i + 1
	}
}

func formatUserLogs(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].ChannelName = ""
		logs[i].Other = formatLogOtherJSON(logs[i].Other, logOtherVisibilityUser)
	}
	assignDisplayLogIds(logs, startIdx)
}

// FormatAdminLogs strips root-only diagnostics while retaining operational
// admin metadata. Root callers should use FormatRootLogs instead.
func FormatAdminLogs(logs []*Log) {
	for i := range logs {
		logs[i].Other = formatLogOtherJSON(logs[i].Other, logOtherVisibilityAdmin)
	}
}

// FormatRootLogs normalizes legacy metadata while retaining all privileged
// scopes for root users.
func FormatRootLogs(logs []*Log) {
	for i := range logs {
		logs[i].Other = formatLogOtherJSON(logs[i].Other, logOtherVisibilityRoot)
	}
}

func GetLogByTokenId(tokenId int) (logs []*Log, err error) {
	order := "id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("")
	}
	err = LOG_DB.Model(&Log{}).Where("token_id = ?", tokenId).Order(order).Limit(common.MaxRecentItems).Find(&logs).Error
	formatUserLogs(logs, 0)
	return logs, err
}

type UserIpStat struct {
	Ip       string `json:"ip"`
	Count    int64  `json:"count"`
	LastTime int64  `json:"last_time"`
}

// GetUserDistinctIps 聚合某用户在日志中出现过的去重 IP（含登录日志与请求日志），
// 返回每个 IP 的出现次数与最近时间，按最近时间倒序。
func GetUserDistinctIps(userId int, limit int) ([]UserIpStat, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	var stats []UserIpStat
	err := LOG_DB.Model(&Log{}).
		Select("ip, count(*) as count, max(created_at) as last_time").
		Where("user_id = ? and ip <> ''", userId).
		Group("ip").
		Order("last_time desc").
		Limit(limit).
		Scan(&stats).Error
	return stats, err
}

// setContentValue accepts legacy log text and structured console messages at the
// shared logging boundary. Legacy text stays intact; structured messages retain
// their translation keys and parameters in the persisted metadata.
func (o *LogOther) setContentValue(value any) string {
	switch content := value.(type) {
	case nil:
		return ""
	case string:
		return content
	case *common.Message:
		if content == nil {
			return ""
		}
		return o.setContent([]*common.Message{content})
	case []*common.Message:
		parts := make([]*common.Message, 0, len(content))
		for _, part := range content {
			if part != nil {
				parts = append(parts, part)
			}
		}
		return o.setContent(parts)
	default:
		return fmt.Sprint(value)
	}
}

func RecordLog(userId int, logType int, content any) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	other := NewLogOther()
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   other.setContentValue(content),
		Other:     other.JSONString(),
	}
	err := createLog(log)
	if err != nil {
		common.SysLog(common.LogText("failed to record log: %s", err.Error()))
	}
}

// RecordLogWithAdminInfo stores operator metadata under other.admin_info and
// an optional, user-visible operation descriptor under other.op for localization.
func RecordLogWithAdminInfo(userId int, logType int, content string, adminInfo *AuditAdminInfo, operation *AuditOperation, request ...*gin.Context) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	if logType == LogTypeManage {
		var c *gin.Context
		if len(request) > 0 {
			c = request[0]
		}
		actorRole := 0
		if c != nil {
			actorRole = c.GetInt("role")
		}
		RecordAuditLog(c, AuditLog{UserId: userId, Username: username, ActorRole: actorRole, Category: AuditCategoryOperation, Content: content, Other: AuditOther{AdminInfo: adminInfo, Op: operation}, Success: true})
		return
	}
	if len(request) > 0 && request[0] != nil {
		log.RequestId = request[0].GetString(common.RequestIdKey)
	}
	if adminInfo != nil || operation != nil {
		data, err := common.Marshal(AuditOther{AdminInfo: adminInfo, Op: operation})
		if err != nil {
			common.SysError(common.LogText("failed to encode log admin info: %s", err.Error()))
			return
		}
		log.Other = string(data)
	}
	if err := createLog(log); err != nil {
		common.SysLog(common.LogText("failed to record log: %s", err.Error()))
	}
}

// RecordLoginLog writes new login events to the independent audit table.
// username 由调用方传入（登录流程已持有用户对象），避免额外的数据库查询。
// content 为英文兜底文本（用于导出）；action+params 供前端本地化渲染。
// other 包含 login_method、user_agent 等结构化信息。
func RecordLoginLog(userId, actorRole int, username string, content string, ip string, action string, params map[string]any, other AuditOther, request ...*gin.Context) {
	other.Op = &AuditOperation{Action: action, Params: params}
	var c *gin.Context
	if len(request) > 0 {
		c = request[0]
	}
	RecordAuditLog(c, AuditLog{UserId: userId, Username: username, ActorRole: actorRole, Category: AuditCategoryLogin, Action: action, Content: content, Ip: ip, Other: other, Success: true})
}

// RecordOperationAuditLog writes new operation/security events to the audit table.
// logUserId 为日志归属者，管理审计日志应归属实际操作者；目标资源/用户放入
// action params。username 内部按 logUserId 查询。content 为英文兜底文本（供导出使用）。
// action+params 写入 Other.op，供前端本地化渲染（普通用户可见，不含敏感信息）。
// adminInfo 存放操作者身份（写入 Other.admin_info，普通用户查询时剥离）；
// auditInfo 存放路由/方法/结果等中间件兜底信息（写入 Other.audit_info，普通用户查询时剥离）。
func RecordOperationAuditLog(logUserId, actorRole int, content string, ip string, action string, params map[string]any, adminInfo *AuditAdminInfo, auditInfo *AuditRequestInfo, request ...*gin.Context) {
	username, _ := GetUsernameById(logUserId, false)
	other := AuditOther{
		Op:        &AuditOperation{Action: action, Params: params},
		AdminInfo: adminInfo,
		AuditInfo: auditInfo,
	}
	var c *gin.Context
	if len(request) > 0 {
		c = request[0]
	}
	category := AuditCategoryOperation
	if adminInfo == nil {
		category = AuditCategorySecurity
	}
	status, success := 200, true
	if auditInfo != nil {
		status = auditInfo.Status
		success = auditInfo.Success
	}
	RecordAuditLog(c, AuditLog{UserId: logUserId, Username: username, ActorRole: actorRole, Category: category, Action: action, Content: content, Ip: ip, Status: status, Success: success, Other: other})
}

func RecordTopupLog(userId int, content any, callerIp string, paymentMethod string, callbackPaymentMethod string) {
	username, _ := GetUsernameById(userId, false)
	other := NewLogOther()
	other.MergeAdmin(map[string]any{
		"server_ip":               common.GetIp(),
		"node_name":               common.NodeName,
		"caller_ip":               callerIp,
		"payment_method":          paymentMethod,
		"callback_payment_method": callbackPaymentMethod,
		"version":                 common.Version,
	})
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeTopup,
		Content:   other.setContentValue(content),
		Ip:        callerIp,
		Other:     other.JSONString(),
	}
	err := createLog(log)
	if err != nil {
		common.SysLog(common.LogText("failed to record topup log: %s", err.Error()))
	}
}

func RecordErrorLog(c *gin.Context, userId int, channelId int, modelName string, tokenName string, content string, tokenId int, useTimeSeconds int,
	isStream bool, group string, other any) {
	logger.LogInfo(c, common.LogText("record error log: userId=%d, channelId=%d, modelName=%s, tokenName=%s, content=%s", userId, channelId, modelName, tokenName, common.LocalLogPreview(content)))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	upstreamRequestId := c.GetString(common.UpstreamRequestIdKey)
	otherStr := asLogOther(other).JSONString()
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.RecordIpLog {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeError,
		Content:          content,
		PromptTokens:     0,
		CompletionTokens: 0,
		TokenName:        tokenName,
		ModelName:        modelName,
		Quota:            0,
		ChannelId:        channelId,
		TokenId:          tokenId,
		UseTime:          useTimeSeconds,
		IsStream:         isStream,
		Group:            group,
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId:         requestId,
		UpstreamRequestId: upstreamRequestId,
		Other:             otherStr,
	}
	err := createLog(log)
	if err != nil {
		logger.LogError(c, common.LogText("failed to record log: %s", err.Error()))
	}
}

// firstTokenMsFromOther extracts the first-token latency (ms) recorded under
// other["frt"] and clamps it to a sane range, returning 0 when absent or out of
// range. Promoting it to a dedicated column lets the channel monitor average it
// with a portable SUM across SQLite, MySQL and PostgreSQL.

func firstTokenMsFromOther(value any) int {
	other := asLogOtherMap(value)
	if other == nil {
		return 0
	}
	v, ok := other["frt"]
	if !ok {
		return 0
	}
	var ms float64
	switch n := v.(type) {
	case float64:
		ms = n
	case int:
		ms = float64(n)
	case int64:
		ms = float64(n)
	default:
		return 0
	}
	if ms <= 0 || ms > 3600000 {
		return 0
	}
	return int(ms)
}

type RecordConsumeLogParams struct {
	ChannelId        int    `json:"channel_id"`
	PromptTokens     int    `json:"prompt_tokens"`
	CompletionTokens int    `json:"completion_tokens"`
	InputTokens      int64  `json:"input_tokens"`
	CacheReadTokens  int64  `json:"cache_read_tokens"`
	CacheWriteTokens int64  `json:"cache_write_tokens"`
	ModelName        string `json:"model_name"`
	TokenName        string `json:"token_name"`
	Quota            int    `json:"quota"`
	Content          any    `json:"content"`
	TokenId          int    `json:"token_id"`
	UseTimeSeconds   int    `json:"use_time_seconds"`
	IsStream         bool   `json:"is_stream"`
	Group            string `json:"group"`
	Other            any    `json:"other"`
	IsImage          bool   `json:"is_image"`
	LogMode          string `json:"log_mode"`
}

func RecordConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams) {
	createdAt := common.GetTimestamp()
	if params.IsImage {
		if err := recordImageTaskFromConsumeLog(c, &Log{
			UserId:    userId,
			CreatedAt: createdAt,
			ModelName: params.ModelName,
			Quota:     params.Quota,
			ChannelId: params.ChannelId,
			UseTime:   params.UseTimeSeconds,
			Group:     params.Group,
			LogMode:   params.LogMode,
		}); err != nil {
			common.SysError(ImageTaskFailureLogMessage(c.GetString(common.RequestIdKey), "success_materialization"))
		}
	}
	if !common.LogConsumeEnabled {
		return
	}
	logger.LogInfo(c, common.LogText("record consume log: userId=%d, params=%s", userId, common.GetJsonString(params)))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	upstreamRequestId := c.GetString(common.UpstreamRequestIdKey)
	other := asLogOther(params.Other)
	content := other.setContentValue(params.Content)
	otherStr := other.JSONString()
	firstTokenMs := firstTokenMsFromOther(params.Other)
	if params.InputTokens != 0 || params.CacheReadTokens != 0 || params.CacheWriteTokens != 0 {
		if params.InputTokens <= 0 || params.CacheReadTokens < 0 || params.CacheReadTokens > params.InputTokens ||
			params.CacheWriteTokens < 0 || params.CacheWriteTokens > params.InputTokens-params.CacheReadTokens {
			logger.LogWarn(c, common.LogText("discard invalid cache telemetry: input=%d read=%d write=%d", params.InputTokens, params.CacheReadTokens, params.CacheWriteTokens))
			params.InputTokens = 0
			params.CacheReadTokens = 0
			params.CacheWriteTokens = 0
		}
	}
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.RecordIpLog {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        createdAt,
		Type:             LogTypeConsume,
		Content:          content,
		PromptTokens:     params.PromptTokens,
		CompletionTokens: params.CompletionTokens,
		TokenName:        params.TokenName,
		ModelName:        params.ModelName,
		Quota:            params.Quota,
		ChannelId:        params.ChannelId,
		TokenId:          params.TokenId,
		UseTime:          params.UseTimeSeconds,
		FirstTokenMs:     firstTokenMs,
		InputTokens:      params.InputTokens,
		CacheReadTokens:  params.CacheReadTokens,
		CacheWriteTokens: params.CacheWriteTokens,
		IsStream:         params.IsStream,
		Group:            params.Group,
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId:         requestId,
		UpstreamRequestId: upstreamRequestId,
		Other:             otherStr,
		IsImage:           params.IsImage,
		LogMode:           params.LogMode,
	}
	err := createLog(log)
	if err != nil {
		logger.LogError(c, common.LogText("failed to record log: %s", err.Error()))
	}
	if params.IsImage {
		recordImageDrawingLog(c, log)
	}
	if common.DataExportEnabled {
		LogQuotaData(QuotaDataLogParams{
			UserID:    userId,
			Username:  username,
			ModelName: params.ModelName,
			Quota:     params.Quota,
			CreatedAt: createdAt,
			TokenUsed: params.PromptTokens + params.CompletionTokens,
			UseGroup:  params.Group,
			TokenID:   params.TokenId,
			ChannelID: params.ChannelId,
			NodeName:  common.NodeName,
		})
	}
}

type RecordTaskBillingLogParams struct {
	UserId    int
	LogType   int
	Content   any
	ChannelId int
	ModelName string
	Quota     int
	TokenId   int
	Group     string
	Other     any
	NodeName  string // 任务发起节点；为空时回退当前节点
}

func RecordTaskBillingLog(params RecordTaskBillingLogParams) {
	if params.LogType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(params.UserId, false)
	tokenName := ""
	if params.TokenId > 0 {
		if token, err := GetTokenById(params.TokenId); err == nil {
			tokenName = token.Name
		}
	}
	createdAt := common.GetTimestamp()
	other := asLogOther(params.Other)
	log := &Log{
		UserId:    params.UserId,
		Username:  username,
		CreatedAt: createdAt,
		Type:      params.LogType,
		Content:   other.setContentValue(params.Content),
		TokenName: tokenName,
		ModelName: params.ModelName,
		Quota:     params.Quota,
		ChannelId: params.ChannelId,
		TokenId:   params.TokenId,
		Group:     params.Group,
		Other:     other.JSONString(),
	}
	err := createLog(log)
	if err != nil {
		common.SysLog(common.LogText("failed to record task billing log: %s", err.Error()))
	}
	if params.LogType == LogTypeConsume && common.DataExportEnabled {
		nodeName := params.NodeName
		if nodeName == "" {
			nodeName = common.NodeName
		}
		LogQuotaData(QuotaDataLogParams{
			UserID:    params.UserId,
			Username:  username,
			ModelName: params.ModelName,
			Quota:     params.Quota,
			CreatedAt: createdAt,
			UseGroup:  params.Group,
			TokenID:   params.TokenId,
			ChannelID: params.ChannelId,
			NodeName:  nodeName,
		})
	}
}

// LogFilter is the usage-log search shared by the log list and the log export.
// Username and Channel are administrator filters.
type LogFilter struct {
	Type              int
	StartTimestamp    int64
	EndTimestamp      int64
	ModelName         string
	Username          string
	TokenName         string
	Channel           int
	Group             string
	RequestId         string
	UpstreamRequestId string
	QuotaStatus       string
}

func (f LogFilter) apply(tx *gorm.DB) (*gorm.DB, error) {
	var err error
	if f.Type != LogTypeUnknown {
		tx = tx.Where("logs.type = ?", f.Type)
	}
	if tx, err = applyExplicitLogTextFilter(tx, "logs.model_name", f.ModelName); err != nil {
		return nil, err
	}
	if tx, err = applyExplicitLogTextFilter(tx, "logs.username", f.Username); err != nil {
		return nil, err
	}
	if f.TokenName != "" {
		tx = tx.Where("logs.token_name = ?", f.TokenName)
	}
	if f.RequestId != "" {
		tx = tx.Where("logs.request_id = ?", f.RequestId)
	}
	if f.UpstreamRequestId != "" {
		tx = tx.Where("logs.upstream_request_id = ?", f.UpstreamRequestId)
	}
	if f.StartTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", f.StartTimestamp)
	}
	if f.EndTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", f.EndTimestamp)
	}
	if f.Channel != 0 {
		tx = tx.Where("logs.channel_id = ?", f.Channel)
	}
	if f.Group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", f.Group)
	}
	switch f.QuotaStatus {
	case "negative":
		tx = tx.Where("logs.quota < ?", 0)
	case "zero":
		tx = tx.Where("logs.quota = ?", 0)
	case "positive":
		tx = tx.Where("logs.quota > ?", 0)
	}
	return tx, nil
}

func GetAllLogs(filter LogFilter, startIdx int, num int) (logs []*Log, total int64, err error) {
	tx, err := filter.apply(LOG_DB)
	if err != nil {
		return nil, 0, err
	}
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	order := "logs.created_at desc, logs.id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	err = tx.Order(order).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		assignDisplayLogIds(logs, startIdx)
	}

	channelIds := types.NewSet[int]()
	for _, log := range logs {
		if log.ChannelId != 0 {
			channelIds.Add(log.ChannelId)
		}
	}

	if channelIds.Len() > 0 {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if common.MemoryCacheEnabled {
			// Cache get channel
			for _, channelId := range channelIds.Items() {
				if cacheChannel, err := CacheGetChannel(channelId); err == nil {
					channels = append(channels, struct {
						Id   int    `gorm:"column:id"`
						Name string `gorm:"column:name"`
					}{
						Id:   channelId,
						Name: cacheChannel.Name,
					})
				}
			}
		} else {
			// Bulk query channels from DB
			if err = DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
				return logs, total, err
			}
		}
		channelMap := make(map[int]string, len(channels))
		for _, channel := range channels {
			channelMap[channel.Id] = channel.Name
		}
		for i := range logs {
			logs[i].ChannelName = channelMap[logs[i].ChannelId]
		}
	}

	return logs, total, err
}

const logSearchCountLimit = 10000

func GetUserLogs(userId int, filter LogFilter, startIdx int, num int) (logs []*Log, total int64, err error) {
	tx, err := filter.apply(LOG_DB.Where("logs.user_id = ?", userId))
	if err != nil {
		return nil, 0, err
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError(common.LogText("failed to count user logs: %s", err.Error()))
		return nil, 0, common.NewMessage("Failed to query logs")
	}
	order := "logs.id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	err = tx.Order(order).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError(common.LogText("failed to search user logs: %s", err.Error()))
		return nil, 0, common.NewMessage("Failed to query logs")
	}

	formatUserLogs(logs, startIdx)
	return logs, total, err
}

// StreamAllLogs calls fn with each log matching filter, newest first, as an
// administrator with role sees it. Rows are read one at a time, so an export
// never holds the whole result in memory.
func StreamAllLogs(ctx context.Context, filter LogFilter, role int, fn func(*Log) error) error {
	tx, err := filter.apply(LOG_DB.WithContext(ctx))
	if err != nil {
		return err
	}
	visibility := logOtherVisibilityAdmin
	if role >= common.RoleRootUser {
		visibility = logOtherVisibilityRoot
	}
	// The main and log databases can share a one-connection pool, so resolve
	// channel names before a streaming cursor reserves that connection.
	var channels []struct {
		Id   int
		Name string
	}
	if err := DB.WithContext(ctx).Model(&Channel{}).Select("id", "name").Find(&channels).Error; err != nil {
		return err
	}
	channelNames := make(map[int]string, len(channels))
	for _, channel := range channels {
		channelNames[channel.Id] = channel.Name
	}
	return streamLogs(tx, "logs.created_at desc, logs.id desc", func(log *Log) error {
		log.ChannelName = channelNames[log.ChannelId]
		log.Other = formatLogOtherJSON(log.Other, visibility)
		return fn(log)
	})
}

// StreamUserLogs is StreamAllLogs for one user's own logs, shaped like the
// user log list.
func StreamUserLogs(ctx context.Context, userId int, filter LogFilter, fn func(*Log) error) error {
	tx, err := filter.apply(LOG_DB.WithContext(ctx).Where("logs.user_id = ?", userId))
	if err != nil {
		return err
	}
	count := 0
	return streamLogs(tx, "logs.id desc", func(log *Log) error {
		count++
		log.Id = count
		log.ChannelName = ""
		log.Other = formatLogOtherJSON(log.Other, logOtherVisibilityUser)
		return fn(log)
	})
}

func streamLogs(tx *gorm.DB, order string, fn func(*Log) error) error {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	rows, err := tx.Model(&Log{}).Order(order).Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var log Log
		if err := LOG_DB.ScanRows(rows, &log); err != nil {
			return err
		}
		if err := fn(&log); err != nil {
			return err
		}
	}
	return rows.Err()
}

type Stat struct {
	Quota int `json:"quota"`
	Rpm   int `json:"rpm"`
	Tpm   int `json:"tpm"`
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, channel int, group string, quotaStatus string, userIds ...int) (stat Stat, err error) {
	tx := LOG_DB.Table("logs").Select("COALESCE(sum(quota), 0) quota")

	// 为rpm和tpm创建单独的查询
	rpmTpmQuery := LOG_DB.Table("logs").Select("count(*) rpm, COALESCE(sum(prompt_tokens), 0) + COALESCE(sum(completion_tokens), 0) tpm")
	if len(userIds) > 0 {
		tx = tx.Where("user_id = ?", userIds[0])
		rpmTpmQuery = rpmTpmQuery.Where("user_id = ?", userIds[0])
	}

	if tx, err = applyExplicitLogTextFilter(tx, "username", username); err != nil {
		return stat, err
	}
	if rpmTpmQuery, err = applyExplicitLogTextFilter(rpmTpmQuery, "username", username); err != nil {
		return stat, err
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
		rpmTpmQuery = rpmTpmQuery.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if tx, err = applyExplicitLogTextFilter(tx, "model_name", modelName); err != nil {
		return stat, err
	}
	if rpmTpmQuery, err = applyExplicitLogTextFilter(rpmTpmQuery, "model_name", modelName); err != nil {
		return stat, err
	}
	if channel != 0 {
		tx = tx.Where("channel_id = ?", channel)
		rpmTpmQuery = rpmTpmQuery.Where("channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where(logGroupCol+" = ?", group)
		rpmTpmQuery = rpmTpmQuery.Where(logGroupCol+" = ?", group)
	}
	switch quotaStatus {
	case "negative":
		tx = tx.Where("quota < ?", 0)
		rpmTpmQuery = rpmTpmQuery.Where("quota < ?", 0)
	case "zero":
		tx = tx.Where("quota = ?", 0)
		rpmTpmQuery = rpmTpmQuery.Where("quota = ?", 0)
	case "positive":
		tx = tx.Where("quota > ?", 0)
		rpmTpmQuery = rpmTpmQuery.Where("quota > ?", 0)
	}

	tx = tx.Where("type = ?", LogTypeConsume)
	rpmTpmQuery = rpmTpmQuery.Where("type = ?", LogTypeConsume)

	// 只统计最近60秒的rpm和tpm
	rpmTpmQuery = rpmTpmQuery.Where("created_at >= ?", time.Now().Add(-60*time.Second).Unix())

	// 执行查询
	if err := tx.Scan(&stat).Error; err != nil {
		common.SysError(common.LogText("failed to query log stat: %s", err.Error()))
		return stat, common.NewMessage("Failed to query statistics")
	}
	var rateStat struct {
		Rpm int
		Tpm int
	}
	if err := rpmTpmQuery.Scan(&rateStat).Error; err != nil {
		common.SysError(common.LogText("failed to query rpm/tpm stat: %s", err.Error()))
		return stat, common.NewMessage("Failed to query statistics")
	}
	stat.Rpm = rateStat.Rpm
	stat.Tpm = rateStat.Tpm

	return stat, nil
}

type ConsumeUsageTotals struct {
	Count     int64 `json:"count"`
	Quota     int64 `json:"quota"`
	TokenUsed int64 `json:"token_used"`
}

type ConsumeUsageRow struct {
	ModelName string `json:"model_name"`
	CreatedAt int64  `json:"created_at"`
	Count     int64  `json:"count"`
	Quota     int64  `json:"quota"`
	TokenUsed int64  `json:"token_used"`
}

func quotaUsageBase(startTimestamp int64, endTimestamp int64) *gorm.DB {
	query := DB.Table("quota_data")
	if startTimestamp > 0 {
		query = query.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp > 0 {
		query = query.Where("created_at <= ?", endTimestamp)
	}
	return query
}

func quotaUsageSelect(extra string) string {
	return extra + "COALESCE(sum(count), 0) as count, COALESCE(sum(quota), 0) as quota, COALESCE(sum(token_used), 0) as token_used"
}

func GetConsumeUsageStat(startTimestamp int64, endTimestamp int64) (ConsumeUsageTotals, []ConsumeUsageRow, []ConsumeUsageRow, error) {
	var totals ConsumeUsageTotals
	if err := quotaUsageBase(startTimestamp, endTimestamp).
		Select(quotaUsageSelect("")).
		Scan(&totals).Error; err != nil {
		return ConsumeUsageTotals{}, nil, nil, err
	}

	var hours []ConsumeUsageRow
	if err := quotaUsageBase(startTimestamp, endTimestamp).
		Select(quotaUsageSelect("created_at, ")).
		Group("created_at").
		Order("created_at").
		Scan(&hours).Error; err != nil {
		return ConsumeUsageTotals{}, nil, nil, err
	}

	var models []ConsumeUsageRow
	if err := quotaUsageBase(startTimestamp, endTimestamp).
		Select(quotaUsageSelect("model_name, ")).
		Group("model_name").
		Order("sum(quota) desc").
		Scan(&models).Error; err != nil {
		return ConsumeUsageTotals{}, nil, nil, err
	}
	return totals, hours, models, nil
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) (token int) {
	tx := LOG_DB.Table("logs").Select("COALESCE(sum(prompt_tokens), 0) + COALESCE(sum(completion_tokens), 0)")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
	}
	tx.Where("type = ?", LogTypeConsume).Scan(&token)
	return token
}

func CountOldLog(ctx context.Context, targetTimestamp int64) (int64, error) {
	var total int64
	if err := LOG_DB.WithContext(ctx).Model(&Log{}).Where("created_at < ?", targetTimestamp).Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func DeleteOldLogBatch(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	if limit <= 0 {
		limit = 100
	}
	if nil != ctx.Err() {
		return 0, ctx.Err()
	}

	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		// ClickHouse DELETE is a heavy mutation that rewrites data parts, so
		// per-batch mutations would be pathologically slow. Remove all matching
		// rows in a single synchronous mutation regardless of limit; the reported
		// count lets the caller's progress loop complete in one pass.
		total, err := CountOldLog(ctx, targetTimestamp)
		if err != nil {
			return 0, err
		}
		if total == 0 {
			return 0, nil
		}
		if err := LOG_DB.WithContext(ctx).Exec(
			"ALTER TABLE logs DELETE WHERE created_at < ? SETTINGS mutations_sync = 1",
			targetTimestamp,
		).Error; err != nil {
			return 0, err
		}
		return total, nil
	}

	result := LOG_DB.WithContext(ctx).Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&Log{})
	if nil != result.Error {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func DeleteOldLog(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	if limit <= 0 {
		limit = 100
	}

	var total int64 = 0

	for {
		if nil != ctx.Err() {
			return total, ctx.Err()
		}

		rowsAffected, err := DeleteOldLogBatch(ctx, targetTimestamp, limit)
		if nil != err {
			return total, err
		}

		total += rowsAffected

		if rowsAffected < int64(limit) {
			break
		}
	}

	return total, nil
}

// GetErrorLogsSince 返回 id 大于 afterId 的错误日志(type=5)，按 id 升序，
// 供站点级错误告警任务做增量扫描。
func GetErrorLogsSince(afterId int, limit int) ([]*Log, error) {
	if limit <= 0 {
		limit = 1000
	}
	var logs []*Log
	err := LOG_DB.Model(&Log{}).
		Where("type = ? AND id > ?", LogTypeError, afterId).
		Order("id asc").
		Limit(limit).
		Find(&logs).Error
	return logs, err
}

// GetMaxErrorLogId 返回当前最大的错误日志(type=5) id，用于告警首轮建立基线。
func GetMaxErrorLogId() (int, error) {
	var maxId int
	err := LOG_DB.Model(&Log{}).
		Where("type = ?", LogTypeError).
		Select("COALESCE(MAX(id), 0)").
		Scan(&maxId).Error
	return maxId, err
}

// ErrorStatRow 错误聚合统计的通用行（按名称维度分组）。
type ErrorStatRow struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

// ErrorStatChannelRow 按渠道 id 聚合的错误统计。
type ErrorStatChannelRow struct {
	Channel int   `json:"channel"`
	Count   int64 `json:"count"`
}

// ErrorTrendPoint 错误数量时间序列的一个桶。
type ErrorTrendPoint struct {
	Bucket int64 `json:"bucket"` // 桶起始 unix 秒
	Count  int64 `json:"count"`
}

func errorStatBaseQuery(start, end int64) *gorm.DB {
	return LOG_DB.Model(&Log{}).
		Where("type = ? AND created_at >= ? AND created_at <= ?", LogTypeError, start, end)
}

// GetErrorTotal 返回时间范围内错误日志(type=5)总数。
func GetErrorTotal(start, end int64) (int64, error) {
	var total int64
	err := errorStatBaseQuery(start, end).Count(&total).Error
	return total, err
}

// GetErrorStatByModel 按模型名聚合错误数量，倒序取前 limit 项。
func GetErrorStatByModel(start, end int64, limit int) ([]ErrorStatRow, error) {
	if limit <= 0 {
		limit = 20
	}
	var rows []ErrorStatRow
	err := errorStatBaseQuery(start, end).
		Select("model_name as name, count(*) as count").
		Group("model_name").
		Order("count desc").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

// GetErrorStatByChannel 按渠道 id 聚合错误数量，倒序取前 limit 项。
func GetErrorStatByChannel(start, end int64, limit int) ([]ErrorStatChannelRow, error) {
	if limit <= 0 {
		limit = 20
	}
	var rows []ErrorStatChannelRow
	err := errorStatBaseQuery(start, end).
		Select("channel_id as channel, count(*) as count").
		Group("channel_id").
		Order("count desc").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

// GetErrorStatByContent 按错误内容聚合（近似错误类型），倒序取前 limit 项。
func GetErrorStatByContent(start, end int64, limit int) ([]ErrorStatRow, error) {
	if limit <= 0 {
		limit = 20
	}
	var rows []ErrorStatRow
	err := errorStatBaseQuery(start, end).
		Select("content as name, count(*) as count").
		Group("content").
		Order("count desc").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

// GetUserErrorTotal 返回某个用户在时间范围内的失败请求数。
func GetUserErrorTotal(userId int, start, end int64) (int64, error) {
	var total int64
	err := errorStatBaseQuery(start, end).Where("user_id = ?", userId).Count(&total).Error
	return total, err
}

// GetUserErrorStatByContent 按错误内容聚合某个用户的失败请求，倒序取前 limit 项。
// 分组直接用 content 原文：错误文本里可能带请求 id 等变量，同一类错误会被拆成多行，
// 这里先保留原文以免归一化规则误合并语义不同的错误。
func GetUserErrorStatByContent(userId int, start, end int64, limit int) ([]ErrorStatRow, error) {
	if limit <= 0 {
		limit = 20
	}
	var rows []ErrorStatRow
	err := errorStatBaseQuery(start, end).
		Where("user_id = ?", userId).
		Select("content as name, count(*) as count").
		Group("content").
		Order("count desc").
		Limit(limit).
		Scan(&rows).Error
	return rows, err
}

func errorTrendBucketExpr(bucketSeconds int64) string {
	if common.UsingLogDatabase(common.DatabaseTypeMySQL) {
		return fmt.Sprintf("(created_at DIV %d) * %d", bucketSeconds, bucketSeconds)
	}
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return fmt.Sprintf("intDiv(created_at, %d) * %d", bucketSeconds, bucketSeconds)
	}
	// SQLite / PostgreSQL: 整数列的 / 即整数除法
	return fmt.Sprintf("(created_at / %d) * %d", bucketSeconds, bucketSeconds)
}

// GetErrorTrend 返回时间范围内错误数量的时间序列，按 bucketSeconds 分桶。
func GetErrorTrend(start, end, bucketSeconds int64) ([]ErrorTrendPoint, error) {
	if bucketSeconds < 1 {
		bucketSeconds = 3600
	}
	expr := errorTrendBucketExpr(bucketSeconds)
	var points []ErrorTrendPoint
	err := errorStatBaseQuery(start, end).
		Select(expr + " as bucket, count(*) as count").
		Group(expr).
		Order("bucket asc").
		Scan(&points).Error
	return points, err
}

// RecordOperationAuditLogWithError keeps synchronous audit durability for fork
// operations while storing new events in the independent audit table.
func RecordOperationAuditLogWithError(logUserId int, content, ip, action string, params, adminInfo, auditInfo map[string]any) error {
	raw, err := common.Marshal(map[string]any{"admin_info": adminInfo, "audit_info": auditInfo})
	if err != nil {
		return err
	}
	var other AuditOther
	if err := common.Unmarshal(raw, &other); err != nil {
		return err
	}
	other.Op = &AuditOperation{Action: action, Params: params}
	actorRole := 0
	if other.AdminInfo != nil {
		actorRole = other.AdminInfo.AdminRole
	}
	category := AuditCategoryOperation
	if other.AdminInfo == nil {
		category = AuditCategorySecurity
	}
	status, success := 200, true
	if other.AuditInfo != nil {
		status, success = other.AuditInfo.Status, other.AuditInfo.Success
	}
	return RecordAuditLogWithError(nil, AuditLog{UserId: logUserId, ActorRole: actorRole, Category: category, Action: action, Content: content, Ip: ip, Status: status, Success: success, Other: other})
}

func RecordLegacyOperationAuditLog(logUserId int, content, ip, action string, params, adminInfo, auditInfo map[string]any) {
	if err := RecordOperationAuditLogWithError(logUserId, content, ip, action, params, adminInfo, auditInfo); err != nil {
		common.SysError(err.Error())
	}
}

func RecordLegacyLoginLog(userId int, username, content, ip, action string, params, extra map[string]any) {
	raw, err := common.Marshal(extra)
	if err != nil {
		common.SysError(err.Error())
		return
	}
	var other AuditOther
	if err := common.Unmarshal(raw, &other); err != nil {
		common.SysError(err.Error())
		return
	}
	// A legacy caller did not capture the actor role. Preserve that uncertainty;
	// looking up a later role could incorrectly expose an earlier privileged event.
	RecordLoginLog(userId, 0, username, content, ip, action, params, other)
}
