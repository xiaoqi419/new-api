package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetPelicanMonitor(c *gin.Context) {
	window := c.Query("range")
	if window != "3d" {
		window = "24h"
	}
	role := c.GetInt("role")
	if !service.PelicanMonitorActive() && role < common.RoleRootUser {
		common.ApiSuccess(c, service.EmptyPelicanDashboard(window, time.Now()))
		return
	}
	dashboard, err := service.LoadPelicanDashboard(window, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if role >= common.RoleRootUser {
		settings := service.PelicanSettingsView()
		dashboard.Settings = &settings
	}
	common.ApiSuccess(c, dashboard)
}

func GetPelicanProbeDetail(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "invalid probe id")
		return
	}
	role := c.GetInt("role")
	if !service.PelicanMonitorActive() && role < common.RoleRootUser {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "probe not found"})
		return
	}
	detail, err := service.LoadPelicanProbeDetail(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if detail == nil || (role < common.RoleRootUser && !service.PelicanGroupMonitored(detail.GroupName)) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "probe not found"})
		return
	}
	common.ApiSuccess(c, detail)
}
