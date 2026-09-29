package controller

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func activityLotteryCampaignId(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "invalid activity lottery ID")
		return 0, false
	}
	return id, true
}

func GetActivityLotteryCurrent(c *gin.Context) {
	campaign, err := model.GetCurrentPublishedActivityLotteryCampaign()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if campaign == nil {
		common.ApiSuccess(c, nil)
		return
	}
	view, err := model.GetActivityLotteryPublicView(campaign.Id, c.GetInt("id"), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, view)
}

func GetActivityLotteryRound(c *gin.Context) {
	id, ok := activityLotteryCampaignId(c)
	if !ok {
		return
	}
	view, err := model.GetActivityLotteryPublicView(id, c.GetInt("id"), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, view)
}

func GetActivityLotteryRounds(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.GetPublishedActivityLotteryCampaigns(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func AdminListActivityLotteryCampaigns(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.GetAllActivityLotteryCampaigns(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, campaign := range items {
		if campaign.Status != model.ActivityLotteryStatusOpen {
			continue
		}
		count, _, err := model.GetActivityLotteryParticipation(campaign, 0)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		campaign.ParticipantCount = count
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetActivityLotteryCampaign(c *gin.Context) {
	id, ok := activityLotteryCampaignId(c)
	if !ok {
		return
	}
	campaign, err := model.GetActivityLotteryCampaignById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if campaign.Status == model.ActivityLotteryStatusOpen {
		count, _, err := model.GetActivityLotteryParticipation(campaign, 0)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		campaign.ParticipantCount = count
	}
	common.ApiSuccess(c, campaign)
}

func AdminCreateActivityLotteryCampaign(c *gin.Context) {
	var input model.ActivityLotteryDraftInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	campaign, err := model.CreateActivityLotteryDraft(input, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, campaign)
}

func AdminUpdateActivityLotteryCampaign(c *gin.Context) {
	id, ok := activityLotteryCampaignId(c)
	if !ok {
		return
	}
	var input model.ActivityLotteryDraftInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	campaign, err := model.UpdateActivityLotteryDraft(id, input, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, campaign)
}

func AdminPublishActivityLotteryCampaign(c *gin.Context) {
	id, ok := activityLotteryCampaignId(c)
	if !ok {
		return
	}
	campaign, err := model.PublishActivityLotteryCampaign(id, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, campaign)
}

func AdminCancelActivityLotteryCampaign(c *gin.Context) {
	id, ok := activityLotteryCampaignId(c)
	if !ok {
		return
	}
	campaign, err := model.CancelActivityLotteryCampaign(id, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, campaign)
}

func AdminDrawActivityLotteryCampaign(c *gin.Context) {
	id, ok := activityLotteryCampaignId(c)
	if !ok {
		return
	}
	campaign, err := model.DrawActivityLotteryCampaign(c.Request.Context(), id, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, campaign)
}

func AdminExportActivityLotteryWinners(c *gin.Context) {
	id, ok := activityLotteryCampaignId(c)
	if !ok {
		return
	}
	campaign, err := model.GetActivityLotteryCampaignById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if campaign.Status != model.ActivityLotteryStatusDrawn {
		common.ApiErrorMsg(c, "activity lottery winners are not available")
		return
	}
	winners, err := model.GetActivityLotteryAdminWinners(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=activity-lottery-winners-%d.csv", id))
	c.Status(http.StatusOK)
	// UTF-8 BOM keeps Chinese headers readable in desktop Excel.
	if _, err := c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}); err != nil {
		return
	}
	writer := csv.NewWriter(c.Writer)
	if err := writer.Write([]string{"活动 ID", "获奖记录 ID", "用户 ID", "用户名", "显示名称", "奖项", fmt.Sprintf("奖项金额（%s）", model.ActivityLotteryDisplayCurrencyLabel(campaign)), "发放额度", "发放状态", "发放时间（北京时间）"}); err != nil {
		return
	}
	beijingTime := time.FixedZone("CST", 8*60*60)
	for _, winner := range winners {
		grantedAt := ""
		if winner.GrantedAt > 0 {
			grantedAt = time.Unix(winner.GrantedAt, 0).In(beijingTime).Format(time.RFC3339)
		}
		if err := writer.Write([]string{
			strconv.Itoa(winner.CampaignId), strconv.Itoa(winner.WinnerId), strconv.Itoa(winner.UserId),
			activityLotteryCSVText(winner.Username), activityLotteryCSVText(winner.DisplayName), activityLotteryCSVText(winner.PrizeName),
			model.FormatActivityLotteryAmount(campaign, winner.AmountCents),
			strconv.Itoa(winner.Quota), winner.CreditStatus, grantedAt,
		}); err != nil {
			return
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return
	}
}

func activityLotteryCSVText(value string) string {
	firstNonSpace := strings.TrimLeftFunc(value, unicode.IsSpace)
	if firstNonSpace == "" {
		return value
	}
	switch firstNonSpace[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + value
	default:
		return value
	}
}
