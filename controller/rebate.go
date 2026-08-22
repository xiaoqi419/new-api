package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetRebateRecords 管理员分页查询返现记录，可按状态过滤。
func GetRebateRecords(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status := c.Query("status")

	records, total, err := model.GetRebateRecords(status, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(records)
	common.ApiSuccess(c, pageInfo)
}

type rebateIdRequest struct {
	Id int `json:"id"`
}

// PayRebate 管理员发放一条待返现记录。
func PayRebate(c *gin.Context) {
	var req rebateIdRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.PayRebateRecord(req.Id, c.ClientIP()); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// CancelRebate 管理员作废一条待返现记录。
func CancelRebate(c *gin.Context) {
	var req rebateIdRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.CancelRebateRecord(req.Id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// GetRebateUsers 管理员分页查询有邀请记录的用户及其专属返现比例。
func GetRebateUsers(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	users, total, err := model.GetInviters(pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(users)
	common.ApiSuccess(c, pageInfo)
}

// GetInviteRanking 管理员查询拉新排行榜（按邀请人数倒序，附带返现汇总）。
func GetInviteRanking(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	rows, total, err := model.GetInviteRanking(pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rows)
	common.ApiSuccess(c, pageInfo)
}

type setUserRebateRatioRequest struct {
	UserId      int      `json:"user_id"`
	RebateRatio *float64 `json:"rebate_ratio"`
}

// SetUserRebateRatio 管理员设置某用户的专属返现比例。
func SetUserRebateRatio(c *gin.Context) {
	var req setUserRebateRatioRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.SetUserRebateRatio(req.UserId, req.RebateRatio); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// GetSelfRebate 用户查询自己的返现汇总与记录（个人中心邀请中心使用）。
func GetSelfRebate(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)

	records, total, err := model.GetRebateRecordsByInviter(userId, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pendingQuota, err := model.SumRebateQuotaByInviter(userId, model.RebateStatusPending)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	paidQuota, err := model.SumRebateQuotaByInviter(userId, model.RebateStatusPaid)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"pending_quota": pendingQuota,
		"paid_quota":    paidQuota,
		"records": gin.H{
			"page":      pageInfo.GetPage(),
			"page_size": pageInfo.GetPageSize(),
			"total":     total,
			"items":     records,
		},
	})
}
