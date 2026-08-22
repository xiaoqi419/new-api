package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// DrawingLog is an async materialized view that unifies image-generation
// activity into a single, index-friendly table for the "Drawing Logs" page:
//   - Source "image": synchronous image consume logs (/v1/images/generations,
//     /v1/images/edits) and chat/responses image output, double-written from
//     RecordConsumeLog.
//   - Source "mj": Midjourney tasks, double-written from the midjourney model.
//
// It lives in the MAIN database (like midjourneys) so a single table can be
// paginated/indexed even when logs live in a separate or ClickHouse LOG_DB.
type DrawingLog struct {
	Id          int    `json:"id"`
	UserId      int    `json:"user_id" gorm:"index:idx_dl_user_created,priority:1"`
	Username    string `json:"username" gorm:"index;default:''"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;index:idx_dl_created;index:idx_dl_user_created,priority:2"`
	Source      string `json:"source" gorm:"type:varchar(20);uniqueIndex:idx_dl_source_sid,priority:1"`
	SourceId    string `json:"source_id" gorm:"type:varchar(80);uniqueIndex:idx_dl_source_sid,priority:2"`
	LogMode     string `json:"log_mode" gorm:"type:varchar(32);index;default:''"`
	ModelName   string `json:"model_name" gorm:"index;default:''"`
	ChannelId   int    `json:"channel_id" gorm:"default:0"`
	ChannelName string `json:"channel_name" gorm:"-"`
	Quota       int    `json:"quota" gorm:"default:0"`
	Status      string `json:"status" gorm:"type:varchar(20);index;default:''"`
	Prompt      string `json:"prompt"`
	ResultUrls  string `json:"result_urls" gorm:"type:text"`
	Progress    string `json:"progress" gorm:"type:varchar(30);default:''"`
	UserGroup   string `json:"group" gorm:"column:user_group;index;default:''"`
	TokenName   string `json:"token_name" gorm:"default:''"`
	Content     string `json:"content"`
	Other       string `json:"other"`
}

const (
	DrawingSourceImage = "image"
	DrawingSourceMj    = "mj"

	DrawingStatusSuccess = "success"
	DrawingStatusFailed  = "failed"
)

// UpsertDrawingLog inserts or updates a drawing_logs row keyed by
// (source, source_id) so double-writes and backfills stay idempotent.
func UpsertDrawingLog(dl *DrawingLog) error {
	if dl == nil || dl.Source == "" || dl.SourceId == "" {
		return nil
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "source"}, {Name: "source_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"user_id", "username", "created_at", "log_mode", "model_name",
			"channel_id", "quota", "status", "prompt", "result_urls",
			"progress", "user_group", "token_name", "content", "other",
		}),
	}).Create(dl).Error
}

// DrawingLogQuery holds the shared filters for the drawing-log listing.
type DrawingLogQuery struct {
	UserId         int
	StartTimestamp int64
	EndTimestamp   int64
	ModelName      string
	Username       string
	Source         string
	LogMode        string
	Status         string
	ChannelId      int
	StartIdx       int
	Num            int
}

func buildDrawingLogTx(q DrawingLogQuery, restrictUser bool) *gorm.DB {
	tx := DB.Model(&DrawingLog{})
	if restrictUser {
		tx = tx.Where("user_id = ?", q.UserId)
	}
	if q.ModelName != "" {
		tx = tx.Where("model_name = ?", q.ModelName)
	}
	if !restrictUser && q.Username != "" {
		tx = tx.Where("username = ?", q.Username)
	}
	if q.Source != "" {
		tx = tx.Where("source = ?", q.Source)
	}
	if q.LogMode != "" {
		tx = tx.Where("log_mode = ?", q.LogMode)
	}
	if q.Status != "" {
		tx = tx.Where("status = ?", q.Status)
	}
	if q.ChannelId != 0 {
		tx = tx.Where("channel_id = ?", q.ChannelId)
	}
	if q.StartTimestamp != 0 {
		tx = tx.Where("created_at >= ?", q.StartTimestamp)
	}
	if q.EndTimestamp != 0 {
		tx = tx.Where("created_at <= ?", q.EndTimestamp)
	}
	return tx
}

// GetDrawingLogs returns a page of drawing logs plus the total count. When
// restrictUser is true the query is scoped to q.UserId (the /self endpoint).
func GetDrawingLogs(q DrawingLogQuery, restrictUser bool) (logs []*DrawingLog, total int64, err error) {
	if q.Num <= 0 {
		q.Num = 20
	}
	if err = buildDrawingLogTx(q, restrictUser).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = buildDrawingLogTx(q, restrictUser).
		Order("created_at desc, id desc").
		Limit(q.Num).Offset(q.StartIdx).
		Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}
	fillDrawingLogChannelNames(logs)
	return logs, total, nil
}

func fillDrawingLogChannelNames(logs []*DrawingLog) {
	channelIds := types.NewSet[int]()
	for _, log := range logs {
		if log.ChannelId != 0 {
			channelIds.Add(log.ChannelId)
		}
	}
	if channelIds.Len() == 0 {
		return
	}
	channelMap := make(map[int]string, channelIds.Len())
	if common.MemoryCacheEnabled {
		for _, id := range channelIds.Items() {
			if ch, err := CacheGetChannel(id); err == nil {
				channelMap[id] = ch.Name
			}
		}
	} else {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if err := DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err == nil {
			for _, ch := range channels {
				channelMap[ch.Id] = ch.Name
			}
		}
	}
	for i := range logs {
		logs[i].ChannelName = channelMap[logs[i].ChannelId]
	}
}

// ---------------------------------------------------------------------------
// Midjourney double-write
// ---------------------------------------------------------------------------

func drawingStatusFromMj(status string) string {
	switch strings.ToUpper(status) {
	case "SUCCESS":
		return DrawingStatusSuccess
	case "FAILURE":
		return DrawingStatusFailed
	case "":
		return ""
	default:
		return strings.ToLower(status)
	}
}

func mjToDrawingLog(m *Midjourney) *DrawingLog {
	createdAt := m.SubmitTime
	if createdAt == 0 {
		createdAt = m.StartTime
	}
	// Midjourney stores timestamps in milliseconds; drawing_logs uses seconds.
	if createdAt > 1_000_000_000_000 {
		createdAt /= 1000
	}
	if createdAt == 0 {
		createdAt = common.GetTimestamp()
	}
	resultUrls := ""
	if m.ImageUrl != "" {
		if b, err := common.Marshal([]string{m.ImageUrl}); err == nil {
			resultUrls = string(b)
		}
	}
	username, _ := GetUsernameById(m.UserId, false)
	action := strings.ToLower(strings.TrimSpace(m.Action))
	logMode := "mj"
	if action != "" {
		logMode = "mj_" + action
	}
	return &DrawingLog{
		UserId:     m.UserId,
		Username:   username,
		CreatedAt:  createdAt,
		Source:     DrawingSourceMj,
		SourceId:   m.MjId,
		LogMode:    logMode,
		ModelName:  "midjourney",
		ChannelId:  m.ChannelId,
		Quota:      m.Quota,
		Status:     drawingStatusFromMj(m.Status),
		Prompt:     m.Prompt,
		ResultUrls: resultUrls,
		Progress:   m.Progress,
	}
}

// recordImageDrawingLog materializes a synchronous image consume log into
// drawing_logs, attaching the stored thumbnail keys and prompt captured on the
// image relay path. Runs the DB write off the request goroutine.
func recordImageDrawingLog(c *gin.Context, l *Log) {
	if l == nil {
		return
	}
	dl := imageLogToDrawingLog(l)
	dl.Prompt = common.GetContextKeyString(c, constant.ContextKeyDrawingPrompt)
	if keys := common.GetContextKeyStringSlice(c, constant.ContextKeyDrawingResultKeys); len(keys) > 0 {
		if b, err := common.Marshal(keys); err == nil {
			dl.ResultUrls = string(b)
		}
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysError(fmt.Sprintf("panic in recordImageDrawingLog: %v", r))
			}
		}()
		if err := UpsertDrawingLog(dl); err != nil {
			common.SysError("failed to upsert image drawing log: " + err.Error())
		}
	}()
}

// AsyncUpsertDrawingLogFromMj materializes a Midjourney task into drawing_logs
// off the request/poll path. Idempotent by (source, mj_id).
func AsyncUpsertDrawingLogFromMj(m *Midjourney) {
	if m == nil || m.MjId == "" {
		return
	}
	snapshot := *m
	go func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysError(fmt.Sprintf("panic in AsyncUpsertDrawingLogFromMj: %v", r))
			}
		}()
		if err := UpsertDrawingLog(mjToDrawingLog(&snapshot)); err != nil {
			common.SysError("failed to upsert mj drawing log: " + err.Error())
		}
	}()
}

// ---------------------------------------------------------------------------
// One-time backfill of historical data
// ---------------------------------------------------------------------------

const drawingBackfillOptionKey = "DrawingLogsBackfilled"

// imageModelKeywords is a conservative substring list used only to backfill
// HISTORICAL classic image-generation logs (which carry no reliable marker).
// Going forward, is_image/log_mode are set at write time, so this heuristic is
// never relied upon for new rows.
var imageModelKeywords = []string{
	"dall-e", "gpt-image", "flux", "seedream", "stable-diffusion",
	"sd3", "kolors", "ideogram", "recraft", "cogview", "hunyuan-image",
}

func drawingLogsBackfilled() bool {
	var opt Option
	if err := DB.Where(&Option{Key: drawingBackfillOptionKey}).First(&opt).Error; err != nil {
		return false
	}
	return opt.Value == "true"
}

func imageLogToDrawingLog(l *Log) *DrawingLog {
	sourceId := l.RequestId
	if sourceId == "" {
		sourceId = fmt.Sprintf("log:%d", l.Id)
	}
	logMode := l.LogMode
	if logMode == "" {
		switch {
		case strings.Contains(l.Other, `"image_generation_call":true`):
			logMode = "image_generation_call"
		case strings.Contains(l.Other, `"image":true`):
			logMode = "chat_image"
		default:
			logMode = "images_generation"
		}
	}
	return &DrawingLog{
		UserId:    l.UserId,
		Username:  l.Username,
		CreatedAt: l.CreatedAt,
		Source:    DrawingSourceImage,
		SourceId:  sourceId,
		LogMode:   logMode,
		ModelName: l.ModelName,
		ChannelId: l.ChannelId,
		Quota:     l.Quota,
		Status:    DrawingStatusSuccess,
		UserGroup: l.Group,
		TokenName: l.TokenName,
		Content:   l.Content,
		Other:     l.Other,
	}
}

// BackfillDrawingLogsOnce populates drawing_logs from existing midjourneys and
// image consume logs. Idempotent (OnConflict upsert) and guarded by an option
// flag so the full scan runs at most once. Master-only.
func BackfillDrawingLogsOnce() {
	if !common.IsMasterNode || drawingLogsBackfilled() {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("panic in BackfillDrawingLogsOnce: %v", r))
		}
	}()
	common.SysLog("drawing_logs backfill started")

	mjCount := 0
	lastMjId := 0
	for {
		var batch []*Midjourney
		if err := DB.Where("id > ?", lastMjId).Order("id asc").Limit(500).Find(&batch).Error; err != nil {
			common.SysError("drawing_logs mj backfill query failed: " + err.Error())
			break
		}
		if len(batch) == 0 {
			break
		}
		for _, m := range batch {
			lastMjId = m.Id
			if m.MjId == "" {
				continue
			}
			if err := UpsertDrawingLog(mjToDrawingLog(m)); err != nil {
				common.SysError("drawing_logs mj backfill upsert failed: " + err.Error())
			}
			mjCount++
		}
	}

	imgCount := 0
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		common.SysLog("drawing_logs image backfill skipped on ClickHouse log database")
	} else {
		imgCount = backfillImageDrawingLogs()
	}

	if err := UpdateOption(drawingBackfillOptionKey, "true"); err != nil {
		common.SysError("failed to persist drawing_logs backfill flag: " + err.Error())
	}
	common.SysLog(fmt.Sprintf("drawing_logs backfill done: mj=%d image=%d", mjCount, imgCount))
}

func backfillImageDrawingLogs() int {
	count := 0
	lastId := 0
	for {
		group := LOG_DB.Where("is_image = ?", true).
			Or("other LIKE ?", `%"image":true%`).
			Or("other LIKE ?", `%"image_generation_call":true%`)
		for _, kw := range imageModelKeywords {
			group = group.Or("model_name LIKE ?", "%"+kw+"%")
		}
		var batch []*Log
		err := LOG_DB.Model(&Log{}).
			Where("type = ?", LogTypeConsume).
			Where("id > ?", lastId).
			Where(group).
			Order("id asc").Limit(1000).Find(&batch).Error
		if err != nil {
			common.SysError("drawing_logs image backfill query failed: " + err.Error())
			break
		}
		if len(batch) == 0 {
			break
		}
		for _, l := range batch {
			lastId = l.Id
			if err := UpsertDrawingLog(imageLogToDrawingLog(l)); err != nil {
				common.SysError("drawing_logs image backfill upsert failed: " + err.Error())
			}
			count++
		}
	}
	return count
}
