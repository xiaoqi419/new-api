package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/error_alert_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// logFilterFromQuery reads the log search shared by the log list and the log
// export. Username and channel are read only for administrators.
func logFilterFromQuery(c *gin.Context, admin bool) model.LogFilter {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	filter := model.LogFilter{
		Type:              logType,
		StartTimestamp:    startTimestamp,
		EndTimestamp:      endTimestamp,
		ModelName:         c.Query("model_name"),
		TokenName:         c.Query("token_name"),
		Group:             c.Query("group"),
		RequestId:         c.Query("request_id"),
		UpstreamRequestId: c.Query("upstream_request_id"),
		QuotaStatus:       c.Query("quota_status"),
	}
	if admin {
		filter.Username = c.Query("username")
		filter.Channel, _ = strconv.Atoi(c.Query("channel"))
	}
	return filter
}

// limitLogTimeRange returns the start of a log or dashboard search kept within
// the longest log time range. A missing start reaches back the whole range, and
// time after now does not count toward it.
func limitLogTimeRange(startTimestamp int64, endTimestamp int64) (int64, error) {
	if startTimestamp < 0 || endTimestamp < 0 || (endTimestamp > 0 && endTimestamp < startTimestamp) {
		return 0, common.NewMessage("Invalid parameters")
	}
	maxRange := operation_setting.GetLogSetting().MaxRangeSeconds()
	end := common.GetTimestamp()
	if endTimestamp != 0 {
		end = min(end, endTimestamp)
	}
	if startTimestamp == 0 {
		return end - maxRange, nil
	}
	if end-startTimestamp > maxRange {
		return 0, common.NewMessage("The time range cannot exceed {{days}} days", map[string]any{"days": maxRange / (24 * 60 * 60)})
	}
	return startTimestamp, nil
}

func GetAllLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	logs, total, err := model.GetAllLogs(logFilterFromQuery(c, true), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if c.GetInt("role") < common.RoleRootUser {
		model.FormatAdminLogs(logs)
	} else {
		model.FormatRootLogs(logs)
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

func GetUserLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := logFilterFromQuery(c, false)
	if c.GetInt("role") < common.RoleAdminUser {
		startTimestamp, err := limitLogTimeRange(filter.StartTimestamp, filter.EndTimestamp)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		filter.StartTimestamp = startTimestamp
	}
	logs, total, err := model.GetUserLogs(c.GetInt("id"), filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

// ExportAllLogs streams every user's logs matching the search.
func ExportAllLogs(c *gin.Context) {
	exportLogs(c, true)
}

// ExportUserLogs streams the caller's own logs matching the search.
func ExportUserLogs(c *gin.Context) {
	if c.GetInt("role") < common.RoleAdminUser && !operation_setting.GetLogSetting().UserExportEnabled {
		common.ApiErrorT(c, "Log export is disabled")
		return
	}
	exportLogs(c, false)
}

// exportLogs writes one JSON log per line, newest first, and ends with an API
// response object: success with the log count, or the failure. Each user runs
// one export at a time, and every export stays within the longest log time
// range.
func exportLogs(c *gin.Context, all bool) {
	filter := logFilterFromQuery(c, all)
	startTimestamp, err := limitLogTimeRange(filter.StartTimestamp, filter.EndTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	filter.StartTimestamp = startTimestamp

	userId := c.GetInt("id")
	release, ok, err := service.AcquireLogExportLock(userId)
	if err != nil {
		common.SysError(common.LogText("failed to lock log export: %s", err.Error()))
		common.ApiErrorT(c, "Failed to export logs")
		return
	}
	if !ok {
		common.ApiErrorT(c, "Another log export is running. Try again after it finishes.")
		return
	}
	defer release()

	c.Header("Content-Type", "application/x-ndjson; charset=utf-8")
	c.Header("Cache-Control", "no-store")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	count := 0
	writeLog := func(log *model.Log) error {
		line, err := common.Marshal(log)
		if err != nil {
			return err
		}
		if _, err := c.Writer.Write(append(line, '\n')); err != nil {
			return err
		}
		count++
		return nil
	}
	ctx := c.Request.Context()
	if all {
		err = model.StreamAllLogs(ctx, filter, c.GetInt("role"), writeLog)
	} else {
		err = model.StreamUserLogs(ctx, userId, filter, writeLog)
	}
	if ctx.Err() != nil {
		return
	}
	// The status is already sent, so the result object becomes the last line.
	if err != nil {
		common.SysError(common.LogText("failed to export logs: %s", err.Error()))
		common.ApiErrorT(c, "Failed to export logs")
		return
	}
	common.ApiSuccess(c, gin.H{"count": count})
}

// Deprecated: SearchAllLogs 已废弃，前端未使用该接口。
func SearchAllLogs(c *gin.Context) {
	common.ApiErrorT(c, "This API is deprecated")
}

// Deprecated: SearchUserLogs 已废弃，前端未使用该接口。
func SearchUserLogs(c *gin.Context) {
	common.ApiErrorT(c, "This API is deprecated")
}

func GetLogByKey(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	if tokenId == 0 {
		common.ApiErrorI18n(c, i18n.MsgTokenInvalid)
		return
	}
	logs, err := model.GetLogByTokenId(tokenId)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
}

func GetConsumeUsageStat(c *gin.Context) {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if startTimestamp < 0 || endTimestamp < 0 || (endTimestamp > 0 && endTimestamp < startTimestamp) {
		common.ApiErrorMsg(c, "invalid time range")
		return
	}
	totals, hours, models, err := model.GetConsumeUsageStat(startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"totals": totals,
			"hours":  hours,
			"models": models,
		},
	})
}

func GetLogsStat(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	quotaStatus := c.Query("quota_status")
	stat, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group, quotaStatus)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": stat.Quota,
			"rpm":   stat.Rpm,
			"tpm":   stat.Tpm,
		},
	})
	return
}

func GetLogsSelfStat(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if c.GetInt("role") < common.RoleAdminUser {
		var err error
		if startTimestamp, err = limitLogTimeRange(startTimestamp, endTimestamp); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	quotaStatus := c.Query("quota_status")
	quotaNum, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, "", tokenName, channel, group, quotaStatus, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum.Quota,
			"rpm":   quotaNum.Rpm,
			"tpm":   quotaNum.Tpm,
			//"token": tokenNum,
		},
	})
	return
}

// DeleteHistoryLogs is the legacy synchronous log cleanup endpoint (DELETE /api/log/).
// It deletes directly instead of going through the async system task. It is kept only
// for the classic frontend; the default frontend uses POST /api/system-task/log-cleanup.
// TODO: remove this handler (and its route) once the classic frontend is removed.
func DeleteHistoryLogs(c *gin.Context) {
	targetTimestamp, _ := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if targetTimestamp == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "target timestamp is required",
		})
		return
	}
	count, err := model.DeleteOldLog(c.Request.Context(), targetTimestamp, 100)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
	return
}

// GetErrorStat 错误报告聚合统计：按模型/渠道/错误内容分组的 Top-N 以及数量时间序列。
func GetErrorStat(c *gin.Context) {
	start, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	now := common.GetTimestamp()
	if end <= 0 {
		end = now
	}
	if start <= 0 {
		start = end - 24*3600
	}
	if start > end {
		start, end = end, start
	}

	const limit = 20
	span := end - start
	var bucket int64 = 3600
	switch {
	case span <= 6*3600:
		bucket = 300
	case span <= 3*24*3600:
		bucket = 3600
	default:
		bucket = 24 * 3600
	}

	total, err := model.GetErrorTotal(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	byModel, err := model.GetErrorStatByModel(start, end, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	byChannel, err := model.GetErrorStatByChannel(start, end, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	byContent, err := model.GetErrorStatByContent(start, end, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	trend, err := model.GetErrorTrend(start, end, bucket)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	type channelStat struct {
		Channel int    `json:"channel"`
		Name    string `json:"name"`
		Count   int64  `json:"count"`
	}
	ids := make([]int, 0, len(byChannel))
	for _, r := range byChannel {
		ids = append(ids, r.Channel)
	}
	nameMap := make(map[int]string)
	if len(ids) > 0 {
		var channels []struct {
			Id   int
			Name string
		}
		if err := model.DB.Table("channels").Select("id, name").Where("id IN ?", ids).Find(&channels).Error; err == nil {
			for _, ch := range channels {
				nameMap[ch.Id] = ch.Name
			}
		}
	}
	channelRows := make([]channelStat, 0, len(byChannel))
	for _, r := range byChannel {
		channelRows = append(channelRows, channelStat{Channel: r.Channel, Name: nameMap[r.Channel], Count: r.Count})
	}

	common.ApiSuccess(c, gin.H{
		"total":           total,
		"start_timestamp": start,
		"end_timestamp":   end,
		"bucket_seconds":  bucket,
		"by_model":        byModel,
		"by_channel":      channelRows,
		"by_content":      byContent,
		"trend":           trend,
	})
}

// GetUserStat 单个用户在指定时间范围内的用量汇总、失败请求数，以及按错误内容分组的 Top-N。
// 时间窗由调用方给出而不在服务端算「今天/本月」，因为日/月边界取决于查看者所在时区。
// 用量来自按小时预聚合的 quota_data（只含已计费请求），失败数来自错误日志，两者数据源不同。
func GetUserStat(c *gin.Context) {
	userId, err := strconv.Atoi(c.Query("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "user_id 无效")
		return
	}

	start, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	now := common.GetTimestamp()
	if end <= 0 {
		end = now
	}
	if start <= 0 {
		start = end - 24*3600
	}
	if start > end {
		start, end = end, start
	}

	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	usage, err := model.SumQuotaDataByUserId(userId, start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	failures, err := model.GetUserErrorTotal(userId, start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	byContent, err := model.GetUserErrorStatByContent(userId, start, end, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"quota":           usage.Quota,
		"requests":        usage.Requests,
		"failures":        failures,
		"by_content":      byContent,
		"start_timestamp": start,
		"end_timestamp":   end,
	})
}

// TestErrorAlert 向企业微信群机器人发送一条测试消息，用于验证 Webhook 配置。
// 优先使用请求体中的 webhook_url（便于保存前测试），为空时回退到已保存的设置。
func TestErrorAlert(c *gin.Context) {
	var req struct {
		WebhookUrl string `json:"webhook_url"`
	}
	_ = c.ShouldBindJSON(&req)

	webhookURL := strings.TrimSpace(req.WebhookUrl)
	if webhookURL == "" {
		webhookURL = strings.TrimSpace(error_alert_setting.GetSetting().WecomWebhookUrl)
	}
	if webhookURL == "" {
		common.ApiErrorMsg(c, "请先填写企业微信机器人 Webhook 地址")
		return
	}

	var b strings.Builder
	b.WriteString("**✅ new-api 错误告警测试**\n")
	b.WriteString("时间：" + time.Now().Format("2006-01-02 15:04:05") + "\n\n")
	b.WriteString("这是一条测试消息，若你能收到，说明企业微信机器人配置正确。")

	if err := service.SendWecomBotMarkdown(webhookURL, b.String()); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"message": "sent"})
}
