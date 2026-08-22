package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetAnnouncements 公开：查询已发布公告列表（?type= 分类过滤，?limit= 数量上限）。
func GetAnnouncements(c *gin.Context) {
	annType := c.Query("type")
	limit := 200
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 && v <= 500 {
		limit = v
	}
	list, err := model.GetPublishedAnnouncements(annType, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, list)
}

// GetAnnouncement 公开：查询单条已发布公告详情。
func GetAnnouncement(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	ann, err := model.GetAnnouncementById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !ann.Published {
		common.ApiErrorMsg(c, "公告不存在")
		return
	}
	common.ApiSuccess(c, ann)
}

// AdminListAnnouncements 管理端：分页查询全部公告（含草稿）。
func AdminListAnnouncements(c *gin.Context) {
	annType := c.Query("type")
	pageInfo := common.GetPageQuery(c)
	list, total, err := model.GetAllAnnouncements(annType, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(list)
	common.ApiSuccess(c, pageInfo)
}

// AdminGetAnnouncement 管理端：查询单条公告（含草稿）。
func AdminGetAnnouncement(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	ann, err := model.GetAnnouncementById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, ann)
}

func AdminCreateAnnouncement(c *gin.Context) {
	var ann model.Announcement
	if err := c.ShouldBindJSON(&ann); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	ann.Id = 0
	if err := ann.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, ann)
}

func AdminUpdateAnnouncement(c *gin.Context) {
	var ann model.Announcement
	if err := c.ShouldBindJSON(&ann); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if ann.Id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if _, err := model.GetAnnouncementById(ann.Id); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := ann.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, ann)
}

func AdminDeleteAnnouncement(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.DeleteAnnouncementById(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": id})
}
