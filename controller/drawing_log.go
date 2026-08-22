package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func buildDrawingLogQuery(c *gin.Context, pageInfo *common.PageInfo) model.DrawingLogQuery {
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	channel, _ := strconv.Atoi(c.Query("channel"))
	return model.DrawingLogQuery{
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
		ModelName:      c.Query("model_name"),
		Source:         c.Query("source"),
		LogMode:        c.Query("log_mode"),
		Status:         c.Query("status"),
		ChannelId:      channel,
		StartIdx:       pageInfo.GetStartIdx(),
		Num:            pageInfo.GetPageSize(),
	}
}

func GetAllDrawingLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	q := buildDrawingLogQuery(c, pageInfo)
	q.Username = c.Query("username")
	logs, total, err := model.GetDrawingLogs(q, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

func GetUserDrawingLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	q := buildDrawingLogQuery(c, pageInfo)
	q.UserId = c.GetInt("id")
	logs, total, err := model.GetDrawingLogs(q, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

// ServeDrawingImage streams a stored thumbnail by its unguessable key. Served
// without auth (like the Midjourney image proxy); the 32-char random key is the
// capability.
func ServeDrawingImage(c *gin.Context) {
	key := c.Param("key")
	path, ok := service.DrawingImageFilePath(key)
	if !ok {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "public, max-age=86400")
	c.File(path)
}
