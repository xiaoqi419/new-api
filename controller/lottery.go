package controller

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/lottery_setting"

	"github.com/gin-gonic/gin"
)

// GetLotteryStatus 返回抽奖开关、保底额度、奖项列表及用户可用摇摇卡数量。
func GetLotteryStatus(c *gin.Context) {
	userId := c.GetInt("id")
	setting := lottery_setting.GetSetting()
	if !setting.Enabled {
		common.ApiSuccess(c, gin.H{"enabled": false})
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 懒触发：按累计消费补发摇摇卡（幂等）。
	if _, err := model.SyncConsumeGrantCards(userId, user.UsedQuota); err != nil {
		common.SysError("lottery consume grant sync failed: " + err.Error())
	}

	available, err := model.CountAvailableLotteryCards(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	cards, err := model.GetUserLotteryCards(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	progress, err := model.GetLotteryProgress(userId, user.UsedQuota)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"enabled":         true,
		"base_quota":      setting.BaseQuota,
		"prizes":          lottery_setting.GetEnabledPrizes(),
		"available_cards": available,
		"cards":           cards,
		"progress":        progress,
	})
}

// DrawLottery 用户抽奖：消耗一张摇摇卡，返回中奖奖项。
func DrawLottery(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		common.ApiErrorMsg(c, "用户未登录")
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	record, err := model.DrawLottery(userId, user.Username)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if record.TotalQuota > 0 {
		model.RecordLog(userId, model.LogTypeSystem,
			fmt.Sprintf("幸运抽奖「%s」，获得额度 %s", record.PrizeName, logger.LogQuota(record.TotalQuota)))
	}
	common.ApiSuccess(c, record)
}

// GetSelfLotteryCards 用户可用摇摇卡列表。
func GetSelfLotteryCards(c *gin.Context) {
	userId := c.GetInt("id")
	cards, err := model.GetUserLotteryCards(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, cards)
}

// GetSelfLotteryRecords 用户抽奖记录（分页）。
func GetSelfLotteryRecords(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	list, total, err := model.GetUserLotteryRecords(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(list)
	common.ApiSuccess(c, pageInfo)
}

// GetAllLotteryRecords 管理员分页查询全部抽奖记录。
func GetAllLotteryRecords(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	list, total, err := model.GetAllLotteryRecords(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(list)
	common.ApiSuccess(c, pageInfo)
}

// GrantLotteryCards 管理员给指定用户发放摇摇卡。
func GrantLotteryCards(c *gin.Context) {
	var req struct {
		UserId int `json:"user_id"`
		Count  int `json:"count"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.UserId <= 0 {
		common.ApiErrorMsg(c, "请填写有效的用户 ID")
		return
	}
	if req.Count <= 0 || req.Count > 1000 {
		common.ApiErrorMsg(c, "发放数量需在 1~1000 之间")
		return
	}
	if _, err := model.GetUserById(req.UserId, false); err != nil {
		common.ApiErrorMsg(c, "用户不存在")
		return
	}
	if err := model.GrantLotteryCards(req.UserId, req.Count, model.LotteryCardSourceManual, 0); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordLog(req.UserId, model.LogTypeSystem, fmt.Sprintf("管理员发放摇摇卡 %d 张", req.Count))
	common.ApiSuccess(c, gin.H{"user_id": req.UserId, "count": req.Count})
}

// GetLotteryConfig 管理员读取抽奖配置。
func GetLotteryConfig(c *gin.Context) {
	common.ApiSuccess(c, lottery_setting.GetSetting())
}

// SaveLotteryConfig 管理员保存抽奖配置，持久化后自动热更新。
func SaveLotteryConfig(c *gin.Context) {
	var req lottery_setting.LotterySetting
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.BaseQuota < 0 {
		req.BaseQuota = 0
	}
	if req.BaseQuota > maxLotteryConfigQuota {
		req.BaseQuota = maxLotteryConfigQuota
	}

	seen := make(map[string]bool)
	for i := range req.Prizes {
		req.Prizes[i].Key = strings.TrimSpace(req.Prizes[i].Key)
		req.Prizes[i].Name = strings.TrimSpace(req.Prizes[i].Name)
		req.Prizes[i].Type = strings.TrimSpace(req.Prizes[i].Type)
		if req.Prizes[i].Key == "" || req.Prizes[i].Name == "" {
			common.ApiErrorMsg(c, "奖项的标识和名称不能为空")
			return
		}
		if seen[req.Prizes[i].Key] {
			common.ApiErrorMsg(c, "奖项标识重复: "+req.Prizes[i].Key)
			return
		}
		seen[req.Prizes[i].Key] = true
		switch req.Prizes[i].Type {
		case lottery_setting.PrizeTypeQuota, lottery_setting.PrizeTypeRedraw, lottery_setting.PrizeTypeEmpty:
		default:
			common.ApiErrorMsg(c, "奖项类型非法: "+req.Prizes[i].Type)
			return
		}
		if req.Prizes[i].Quota < 0 {
			req.Prizes[i].Quota = 0
		}
		if req.Prizes[i].Quota > maxLotteryConfigQuota {
			req.Prizes[i].Quota = maxLotteryConfigQuota
		}
		if req.Prizes[i].Weight < 0 {
			req.Prizes[i].Weight = 0
		}
	}

	for i := range req.GrantRules {
		if req.GrantRules[i].Threshold < 0 {
			req.GrantRules[i].Threshold = 0
		}
		if req.GrantRules[i].Threshold > maxLotteryConfigQuota {
			req.GrantRules[i].Threshold = maxLotteryConfigQuota
		}
		if req.GrantRules[i].CardsPer < 0 {
			req.GrantRules[i].CardsPer = 0
		}
		if req.GrantRules[i].CardsPer > 1000 {
			req.GrantRules[i].CardsPer = 1000
		}
	}

	for i := range req.TopupGrantRules {
		if req.TopupGrantRules[i].Threshold < 0 {
			req.TopupGrantRules[i].Threshold = 0
		}
		if req.TopupGrantRules[i].Threshold > maxLotteryConfigQuota {
			req.TopupGrantRules[i].Threshold = maxLotteryConfigQuota
		}
		if req.TopupGrantRules[i].CardsPer < 0 {
			req.TopupGrantRules[i].CardsPer = 0
		}
		if req.TopupGrantRules[i].CardsPer > 1000 {
			req.TopupGrantRules[i].CardsPer = 1000
		}
		if req.TopupGrantRules[i].CardExpireDays < 0 {
			req.TopupGrantRules[i].CardExpireDays = 0
		}
		if req.TopupGrantRules[i].CardExpireDays > 3650 {
			req.TopupGrantRules[i].CardExpireDays = 3650
		}
	}

	prizesJSON, err := common.Marshal(req.Prizes)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	grantRulesJSON, err := common.Marshal(req.GrantRules)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	topupGrantRulesJSON, err := common.Marshal(req.TopupGrantRules)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("lottery_setting.enabled", strconv.FormatBool(req.Enabled)); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("lottery_setting.base_quota", strconv.Itoa(req.BaseQuota)); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("lottery_setting.prizes", string(prizesJSON)); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("lottery_setting.grant_rules", string(grantRulesJSON)); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("lottery_setting.topup_grant_rules", string(topupGrantRulesJSON)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, lottery_setting.GetSetting())
}

// maxLotteryConfigQuota 后台可配置额度上限（保底/奖项），防止溢出 int32 额度列。
const maxLotteryConfigQuota = 2000000000
