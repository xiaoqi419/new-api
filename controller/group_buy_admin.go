package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// AdminListGroupBuyPackages 管理员获取全部拼团套餐。
func AdminListGroupBuyPackages(c *gin.Context) {
	packages, err := model.GetGroupBuyPackages(false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, packages)
}

// AdminCreateGroupBuyPackage 新建拼团套餐。
func AdminCreateGroupBuyPackage(c *gin.Context) {
	var pkg model.GroupBuyPackage
	if err := c.ShouldBindJSON(&pkg); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	pkg.Id = 0
	if err := pkg.ValidateForSave(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if err := pkg.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, pkg)
}

// AdminUpdateGroupBuyPackage 更新拼团套餐。
func AdminUpdateGroupBuyPackage(c *gin.Context) {
	var pkg model.GroupBuyPackage
	if err := c.ShouldBindJSON(&pkg); err != nil || pkg.Id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := pkg.ValidateForSave(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if _, err := model.GetGroupBuyPackageById(pkg.Id); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pkg.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, pkg)
}

// AdminDeleteGroupBuyPackage 删除拼团套餐。
func AdminDeleteGroupBuyPackage(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.DeleteGroupBuyPackage(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminListGroupBuys 管理员分页查询拼团订单，可按状态过滤。
func AdminListGroupBuys(c *gin.Context) {
	status := c.Query("status")
	pageInfo := common.GetPageQuery(c)
	groupBuys, total, err := model.GetAllGroupBuys(status, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(groupBuys)
	common.ApiSuccess(c, pageInfo)
}

// AdminGetGroupBuy 管理员获取单个拼团详情及参团记录。
func AdminGetGroupBuy(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	groupBuy, participants, err := model.GetGroupBuyById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"group_buy": groupBuy, "participants": participants})
}

// AdminCancelGroupBuy 管理员作废进行中的拼团并触发退款。
func AdminCancelGroupBuy(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	failGroupBuyAndRefund(id)
	common.ApiSuccess(c, nil)
}

// AdminListGroupBuyRefundPending 管理员查询待人工退款的参团记录。
func AdminListGroupBuyRefundPending(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	participants, total, err := model.GetRefundPendingParticipants(pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(participants)
	common.ApiSuccess(c, pageInfo)
}

// AdminMarkGroupBuyRefunded 管理员手动标记某参团记录已退款。
func AdminMarkGroupBuyRefunded(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.MarkParticipantRefunded(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
