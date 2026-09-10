package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetDailyUsage returns the authenticated user's consumption totals for one
// browser-local day. The client supplies the local-day bounds because the
// server cannot infer the viewer's timezone reliably.
func GetDailyUsage(c *gin.Context) {
	start, startErr := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	end, endErr := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	now := time.Now().Unix()
	userID := c.GetInt("id")
	if startErr != nil || endErr != nil || userID <= 0 || start <= 0 || end <= start || now < start || now >= end || end-start < 23*60*60 || end-start > 25*60*60 {
		common.ApiErrorMsg(c, "invalid daily usage range")
		return
	}

	summary, err := model.GetUserDailyUsageSummary(userID, start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    summary,
	})
}
