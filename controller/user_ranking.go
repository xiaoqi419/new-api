package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetUserRanking 管理员查询用户消耗排行（多维度 + 时间段筛选）。
// dimension: quota / tokens / requests / ip_count / ip_per_minute。
func GetUserRanking(c *gin.Context) {
	dimension := c.DefaultQuery("dimension", "quota")
	start, _ := strconv.ParseInt(c.Query("start"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end"), 10, 64)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	now := time.Now().Unix()
	// 未指定时间范围时给出安全默认，避免对超大日志表做无界聚合。
	if dimension == "ip_per_minute" {
		if start <= 0 {
			start = now - 60*60 // 默认最近 1 小时
		}
	} else if start <= 0 {
		start = now - 7*24*60*60 // 默认最近 7 天
	}

	var rows []model.UserRankingRow
	var err error
	switch dimension {
	case "quota", "tokens", "requests", "ip_count":
		rows, err = model.GetUserConsumeRanking(dimension, start, end, limit)
	case "ip_per_minute":
		rows, err = model.GetUserIpPerMinuteRanking(start, end, limit)
	default:
		common.ApiErrorMsg(c, "无效的排行维度")
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"dimension": dimension,
		"start":     start,
		"end":       end,
		"items":     rows,
	})
}
