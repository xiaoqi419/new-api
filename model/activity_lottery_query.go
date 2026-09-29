package model

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

func GetCurrentPublishedActivityLotteryCampaign() (*ActivityLotteryCampaign, error) {
	var campaign ActivityLotteryCampaign
	query := DB.Preload("Prizes", func(tx *gorm.DB) *gorm.DB { return tx.Order("position asc") })
	err := query.Where("status = ?", ActivityLotteryStatusOpen).Order("published_at desc, id desc").First(&campaign).Error
	if err == nil {
		normalizeActivityLotteryCampaignCurrency(&campaign)
		return &campaign, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	err = DB.Preload("Prizes", func(tx *gorm.DB) *gorm.DB { return tx.Order("position asc") }).
		Where("published_at > 0 AND status IN ?", []string{ActivityLotteryStatusDrawn, ActivityLotteryStatusExpired, ActivityLotteryStatusCanceled}).
		Order("published_at desc, id desc").First(&campaign).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	normalizeActivityLotteryCampaignCurrency(&campaign)
	return &campaign, nil
}

func GetAllActivityLotteryCampaigns(startIdx int, num int) ([]*ActivityLotteryCampaign, int64, error) {
	return listActivityLotteryCampaigns(false, startIdx, num)
}

func GetPublishedActivityLotteryCampaigns(startIdx int, num int) ([]*ActivityLotteryCampaign, int64, error) {
	return listActivityLotteryCampaigns(true, startIdx, num)
}

func listActivityLotteryCampaigns(publishedOnly bool, startIdx int, num int) ([]*ActivityLotteryCampaign, int64, error) {
	if startIdx < 0 {
		startIdx = 0
	}
	if num <= 0 || num > 100 {
		num = 20
	}
	query := DB.Model(&ActivityLotteryCampaign{})
	orderBy := "created_at desc, id desc"
	if publishedOnly {
		query = query.Where("published_at > 0")
		orderBy = "published_at desc, id desc"
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var campaigns []*ActivityLotteryCampaign
	err := query.Preload("Prizes", func(tx *gorm.DB) *gorm.DB { return tx.Order("position asc") }).
		Order(orderBy).Offset(startIdx).Limit(num).Find(&campaigns).Error
	for _, campaign := range campaigns {
		normalizeActivityLotteryCampaignCurrency(campaign)
	}
	return campaigns, total, err
}

type ActivityLotteryPublicWinner struct {
	Id          int    `json:"id"`
	MaskedName  string `json:"masked_name"`
	Name        string `json:"name"`
	AmountCents int64  `json:"amount_cents"`
}

type ActivityLotteryMyPrize struct {
	Name        string `json:"name"`
	AmountCents int64  `json:"amount_cents"`
	Quota       int    `json:"quota"`
	GrantedAt   int64  `json:"granted_at"`
	Granted     bool   `json:"granted"`
}

type ActivityLotteryAdminWinner struct {
	CampaignId   int    `json:"campaign_id"`
	WinnerId     int    `json:"winner_id"`
	UserId       int    `json:"user_id"`
	Username     string `json:"username"`
	DisplayName  string `json:"display_name"`
	PrizeName    string `json:"prize_name"`
	AmountCents  int64  `json:"amount_cents"`
	Quota        int    `json:"quota"`
	CreditStatus string `json:"credit_status"`
	GrantedAt    int64  `json:"granted_at"`
}

func GetActivityLotteryAdminWinners(campaignId int) ([]ActivityLotteryAdminWinner, error) {
	if campaignId <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	var winners []ActivityLotteryAdminWinner
	err := DB.Table("activity_lottery_winners AS winners").
		Select("winners.campaign_id, winners.id AS winner_id, winners.user_id, users.username, users.display_name, winners.prize_name, winners.amount_cents, winners.quota, winners.credit_status, winners.granted_at").
		Joins("LEFT JOIN users ON users.id = winners.user_id").
		Where("winners.campaign_id = ?", campaignId).
		Order("winners.prize_id asc, winners.id asc").
		Scan(&winners).Error
	return winners, err
}

type ActivityLotteryPublicView struct {
	Campaign         *ActivityLotteryCampaign      `json:"campaign"`
	ParticipantCount int64                         `json:"participant_count"`
	Joined           bool                          `json:"joined"`
	Winners          []ActivityLotteryPublicWinner `json:"winners"`
	MyPrize          *ActivityLotteryMyPrize       `json:"my_prize,omitempty"`
	ServerTime       int64                         `json:"server_time"`
}

func maskActivityLotteryName(name string) string {
	runes := []rune(strings.TrimSpace(name))
	if len(runes) == 0 {
		return "参与用户"
	}
	if len(runes) == 1 {
		return string(runes[0]) + "*"
	}
	if len(runes) == 2 {
		return string(runes[0]) + "*"
	}
	return string(runes[0]) + "***" + string(runes[len(runes)-1])
}

func GetActivityLotteryPublicView(campaignId int, userId int, now time.Time) (*ActivityLotteryPublicView, error) {
	campaign, err := GetActivityLotteryCampaignById(campaignId)
	if err != nil {
		return nil, err
	}
	if campaign.Status == ActivityLotteryStatusDraft || campaign.PublishedAt == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	currentCount, joined, err := GetActivityLotteryParticipation(campaign, userId)
	if err != nil {
		return nil, err
	}
	count := currentCount
	if campaign.Status == ActivityLotteryStatusDrawn || campaign.Status == ActivityLotteryStatusExpired || campaign.Status == ActivityLotteryStatusCanceled {
		count = campaign.ParticipantCount
	}
	view := &ActivityLotteryPublicView{
		Campaign: campaign, ParticipantCount: count, Joined: joined,
		Winners: []ActivityLotteryPublicWinner{}, ServerTime: now.Unix(),
	}
	if campaign.Status != ActivityLotteryStatusDrawn {
		return view, nil
	}

	var winners []ActivityLotteryWinner
	if err := DB.Where("campaign_id = ?", campaignId).Order("prize_id asc, id asc").Find(&winners).Error; err != nil {
		return nil, err
	}
	userIds := make([]int, 0, len(winners))
	for _, winner := range winners {
		userIds = append(userIds, winner.UserId)
	}
	usersById := make(map[int]string, len(userIds))
	if len(userIds) > 0 {
		var users []User
		if err := DB.Select("id", "username", "display_name").Where("id IN ?", userIds).Find(&users).Error; err != nil {
			return nil, err
		}
		for _, user := range users {
			name := user.DisplayName
			if name == "" {
				name = user.Username
			}
			usersById[user.Id] = maskActivityLotteryName(name)
		}
	}
	for _, winner := range winners {
		name := usersById[winner.UserId]
		if name == "" {
			name = "参与用户"
		}
		view.Winners = append(view.Winners, ActivityLotteryPublicWinner{
			Id: winner.Id, MaskedName: name, Name: winner.PrizeName, AmountCents: winner.AmountCents,
		})
		if userId <= 0 || winner.UserId != userId {
			continue
		}
		view.MyPrize = &ActivityLotteryMyPrize{
			Name: winner.PrizeName, AmountCents: winner.AmountCents,
			Quota: winner.Quota, GrantedAt: winner.GrantedAt,
			Granted: winner.CreditStatus == ActivityLotteryGrantStatusGranted,
		}
	}
	return view, nil
}

func HasDueActivityLotteryCampaign(now time.Time) (bool, error) {
	var count int64
	err := DB.Model(&ActivityLotteryCampaign{}).
		Where("status = ? AND draw_at <= ?", ActivityLotteryStatusOpen, now.Unix()).
		Count(&count).Error
	return count > 0, err
}

func ListDueActivityLotteryCampaignIds(now time.Time, limit int) ([]int, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	ids := make([]int, 0, limit)
	err := DB.Model(&ActivityLotteryCampaign{}).
		Where("status = ? AND draw_at <= ?", ActivityLotteryStatusOpen, now.Unix()).
		Order("draw_at asc, id asc").
		Limit(limit).
		Pluck("id", &ids).Error
	return ids, err
}
