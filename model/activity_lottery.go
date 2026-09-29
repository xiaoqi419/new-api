package model

import (
	"context"
	cryptorand "crypto/rand"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	ActivityLotteryStatusDraft    = "draft"
	ActivityLotteryStatusOpen     = "open"
	ActivityLotteryStatusDrawn    = "drawn"
	ActivityLotteryStatusExpired  = "expired"
	ActivityLotteryStatusCanceled = "canceled"
)

const ActivityLotteryGrantStatusGranted = "granted"

type ActivityLotteryCampaign struct {
	Id                   int                    `json:"id" gorm:"primaryKey"`
	Title                string                 `json:"title" gorm:"type:varchar(128);not null"`
	Description          string                 `json:"description" gorm:"type:text"`
	Status               string                 `json:"status" gorm:"type:varchar(16);index;not null"`
	ActiveKey            *string                `json:"-" gorm:"type:varchar(16);uniqueIndex:idx_activity_lottery_active_key"`
	PublishedAt          int64                  `json:"published_at" gorm:"bigint"`
	QualificationStartAt int64                  `json:"qualification_start_at" gorm:"bigint"`
	QualificationEndAt   int64                  `json:"qualification_end_at" gorm:"bigint"`
	DrawAt               int64                  `json:"draw_at" gorm:"bigint;index"`
	MinParticipants      int                    `json:"min_participants"`
	ParticipantCount     int64                  `json:"participant_count" gorm:"bigint"`
	USDExchangeRate      float64                `json:"usd_exchange_rate"`
	QuotaPerUnit         float64                `json:"quota_per_unit"`
	DrawnAt              int64                  `json:"drawn_at" gorm:"bigint"`
	LastError            string                 `json:"-" gorm:"type:text"`
	CreatedAt            int64                  `json:"created_at" gorm:"bigint"`
	UpdatedAt            int64                  `json:"updated_at" gorm:"bigint"`
	Prizes               []ActivityLotteryPrize `json:"prizes" gorm:"foreignKey:CampaignId"`
}

type ActivityLotteryPrize struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	CampaignId  int    `json:"campaign_id" gorm:"uniqueIndex:idx_activity_lottery_prize_position,priority:1;index"`
	Position    int    `json:"position" gorm:"uniqueIndex:idx_activity_lottery_prize_position,priority:2"`
	Name        string `json:"name" gorm:"type:varchar(64);not null"`
	Count       int    `json:"count"`
	AmountCents int64  `json:"amount_cents" gorm:"bigint"`
	Quota       int    `json:"quota" gorm:"bigint"`
}

type ActivityLotteryWinner struct {
	Id           int    `json:"id" gorm:"primaryKey"`
	CampaignId   int    `json:"campaign_id" gorm:"uniqueIndex:idx_activity_lottery_winner,priority:1;index"`
	UserId       int    `json:"user_id" gorm:"uniqueIndex:idx_activity_lottery_winner,priority:2;index"`
	PrizeId      int    `json:"prize_id"`
	PrizeName    string `json:"prize_name" gorm:"type:varchar(64)"`
	AmountCents  int64  `json:"amount_cents" gorm:"bigint"`
	Quota        int    `json:"quota" gorm:"bigint"`
	RedemptionId int    `json:"-"` // legacy field retained for database compatibility; new draws credit directly.
	CreditStatus string `json:"credit_status" gorm:"type:varchar(16)"`
	GrantedAt    int64  `json:"granted_at" gorm:"bigint"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint"`
}

type ActivityLotteryPrizeInput struct {
	Name        string `json:"name"`
	Count       int    `json:"count"`
	AmountCents int64  `json:"amount_cents"`
}

type ActivityLotteryDraftInput struct {
	Title                string                      `json:"title"`
	Description          string                      `json:"description"`
	QualificationStartAt int64                       `json:"qualification_start_at"`
	DrawAt               int64                       `json:"draw_at"`
	MinParticipants      int                         `json:"min_participants"`
	Prizes               []ActivityLotteryPrizeInput `json:"prizes"`
}

func (ActivityLotteryCampaign) TableName() string {
	return "activity_lottery_campaigns"
}

func (ActivityLotteryPrize) TableName() string {
	return "activity_lottery_prizes"
}

func (ActivityLotteryWinner) TableName() string {
	return "activity_lottery_winners"
}

func validateActivityLotteryStart(startAt, drawAt int64) error {
	if startAt <= 0 || startAt >= drawAt {
		return errors.New("activity lottery start date must be Beijing midnight before draw time")
	}
	start := time.Unix(startAt, 0).In(time.FixedZone("CST", 8*60*60))
	if start.Hour() != 0 || start.Minute() != 0 || start.Second() != 0 {
		return errors.New("activity lottery start date must be Beijing midnight before draw time")
	}
	return nil
}

func beijingDayStart(now time.Time) int64 {
	shanghai := time.FixedZone("CST", 8*60*60)
	localNow := now.In(shanghai)
	return time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, shanghai).Unix()
}

func validateActivityLotteryDraft(input *ActivityLotteryDraftInput, now time.Time) error {
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	if input.QualificationStartAt == 0 {
		// Drafts created by the previous API shape used the publication day implicitly.
		input.QualificationStartAt = beijingDayStart(now)
	}
	if input.QualificationStartAt > beijingDayStart(now) {
		return errors.New("activity lottery start date cannot be in the future")
	}
	if input.Title == "" || utf8.RuneCountInString(input.Title) > 128 {
		return errors.New("activity lottery title must be 1–128 characters")
	}
	if utf8.RuneCountInString(input.Description) > 1000 {
		return errors.New("activity lottery description is too long")
	}
	if input.DrawAt <= now.Unix() {
		return errors.New("activity lottery draw time must be in the future")
	}
	if err := validateActivityLotteryStart(input.QualificationStartAt, input.DrawAt); err != nil {
		return err
	}
	if len(input.Prizes) == 0 || len(input.Prizes) > 10 {
		return errors.New("activity lottery requires 1–10 prize tiers")
	}
	var totalSlots int
	var poolCents int64
	for i := range input.Prizes {
		prize := &input.Prizes[i]
		prize.Name = strings.TrimSpace(prize.Name)
		if prize.Name == "" || utf8.RuneCountInString(prize.Name) > 64 {
			return errors.New("prize tier name must be 1–64 characters")
		}
		if prize.Count < 1 || prize.Count > 1000 || prize.AmountCents < 1 || prize.AmountCents > 10_000_000 {
			return errors.New("invalid prize tier count or CNY amount")
		}
		totalSlots += prize.Count
		poolCents += int64(prize.Count) * prize.AmountCents
	}
	if totalSlots > 1000 || poolCents > 100_000_000 {
		return errors.New("activity lottery prize pool exceeds the allowed limit")
	}
	if input.MinParticipants == 0 {
		input.MinParticipants = totalSlots
	}
	if input.MinParticipants < totalSlots || input.MinParticipants > 1_000_000 {
		return errors.New("minimum participants must cover every prize slot")
	}
	return nil
}

func GetActivityLotteryCampaignById(id int) (*ActivityLotteryCampaign, error) {
	if id <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	var campaign ActivityLotteryCampaign
	err := DB.Preload("Prizes", func(tx *gorm.DB) *gorm.DB { return tx.Order("position asc") }).First(&campaign, id).Error
	if err != nil {
		return nil, err
	}
	return &campaign, nil
}

func insertActivityLotteryPrizes(tx *gorm.DB, campaignId int, items []ActivityLotteryPrizeInput) error {
	for position, item := range items {
		prize := &ActivityLotteryPrize{
			CampaignId:  campaignId,
			Position:    position + 1,
			Name:        item.Name,
			Count:       item.Count,
			AmountCents: item.AmountCents,
		}
		if err := tx.Create(prize).Error; err != nil {
			return err
		}
	}
	return nil
}

func CreateActivityLotteryDraft(input ActivityLotteryDraftInput, now time.Time) (*ActivityLotteryCampaign, error) {
	if err := validateActivityLotteryDraft(&input, now); err != nil {
		return nil, err
	}
	campaign := &ActivityLotteryCampaign{
		Title:                input.Title,
		Description:          input.Description,
		Status:               ActivityLotteryStatusDraft,
		QualificationStartAt: input.QualificationStartAt,
		DrawAt:               input.DrawAt,
		MinParticipants:      input.MinParticipants,
		CreatedAt:            now.Unix(),
		UpdatedAt:            now.Unix(),
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(campaign).Error; err != nil {
			return err
		}
		return insertActivityLotteryPrizes(tx, campaign.Id, input.Prizes)
	})
	if err != nil {
		return nil, err
	}
	return GetActivityLotteryCampaignById(campaign.Id)
}

func UpdateActivityLotteryDraft(id int, input ActivityLotteryDraftInput, now time.Time) (*ActivityLotteryCampaign, error) {
	if id <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if err := validateActivityLotteryDraft(&input, now); err != nil {
		return nil, err
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var campaign ActivityLotteryCampaign
		if err := lockForUpdate(tx).Where("id = ?", id).First(&campaign).Error; err != nil {
			return err
		}
		if campaign.Status != ActivityLotteryStatusDraft {
			return errors.New("published activity lottery rules cannot be edited")
		}
		if err := tx.Model(&ActivityLotteryCampaign{}).Where("id = ?", id).
			Updates(map[string]any{
				"title":                  input.Title,
				"description":            input.Description,
				"qualification_start_at": input.QualificationStartAt,
				"draw_at":                input.DrawAt,
				"min_participants":       input.MinParticipants,
				"updated_at":             now.Unix(),
			}).Error; err != nil {
			return err
		}
		if err := tx.Where("campaign_id = ?", id).Delete(&ActivityLotteryPrize{}).Error; err != nil {
			return err
		}
		return insertActivityLotteryPrizes(tx, id, input.Prizes)
	})
	if err != nil {
		return nil, err
	}
	return GetActivityLotteryCampaignById(id)
}

func CancelActivityLotteryCampaign(id int, now time.Time) (*ActivityLotteryCampaign, error) {
	if id <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var campaign ActivityLotteryCampaign
		if err := lockForUpdate(tx).Where("id = ?", id).First(&campaign).Error; err != nil {
			return err
		}
		if campaign.Status == ActivityLotteryStatusCanceled {
			return nil
		}
		if campaign.Status != ActivityLotteryStatusDraft && campaign.Status != ActivityLotteryStatusOpen {
			return errors.New("completed activity lottery cannot be canceled")
		}
		updates := map[string]any{
			"status":     ActivityLotteryStatusCanceled,
			"active_key": nil,
			"updated_at": now.Unix(),
		}
		if campaign.Status == ActivityLotteryStatusOpen {
			cutoff := min(now.Unix(), campaign.QualificationEndAt)
			cutoff = max(cutoff, campaign.QualificationStartAt)
			campaign.QualificationEndAt = cutoff
			var participants int64
			if err := activityLotteryEligibleTopups(tx, &campaign).Distinct("user_id").Count(&participants).Error; err != nil {
				return err
			}
			updates["qualification_end_at"] = cutoff
			updates["participant_count"] = participants
		}
		result := tx.Model(&ActivityLotteryCampaign{}).
			Where("id = ? AND status = ?", id, campaign.Status).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("activity lottery status changed")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return GetActivityLotteryCampaignById(id)
}

func PublishActivityLotteryCampaign(id int, now time.Time) (*ActivityLotteryCampaign, error) {
	if id <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	rate := operation_setting.USDExchangeRate
	quotaPerUnit := common.QuotaPerUnit
	if rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) || quotaPerUnit <= 0 || math.IsNaN(quotaPerUnit) || math.IsInf(quotaPerUnit, 0) {
		return nil, errors.New("invalid CNY prize conversion settings")
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		var campaign ActivityLotteryCampaign
		if err := lockForUpdate(tx).Where("id = ?", id).First(&campaign).Error; err != nil {
			return err
		}
		if campaign.Status != ActivityLotteryStatusDraft {
			return errors.New("only draft activity lotteries can be published")
		}
		if campaign.DrawAt <= now.Unix() {
			return errors.New("activity lottery draw time must be in the future")
		}
		if campaign.QualificationStartAt == 0 {
			campaign.QualificationStartAt = beijingDayStart(now)
		}
		if err := validateActivityLotteryStart(campaign.QualificationStartAt, campaign.DrawAt); err != nil {
			return err
		}
		var activeCount int64
		if err := tx.Model(&ActivityLotteryCampaign{}).
			Where("status = ?", ActivityLotteryStatusOpen).Count(&activeCount).Error; err != nil {
			return err
		}
		if activeCount > 0 {
			return errors.New("another activity lottery is already open")
		}
		var prizes []ActivityLotteryPrize
		if err := tx.Where("campaign_id = ?", id).Order("position asc").Find(&prizes).Error; err != nil {
			return err
		}
		if len(prizes) == 0 {
			return errors.New("activity lottery has no prize tiers")
		}
		for _, prize := range prizes {
			quotaValue := decimal.NewFromInt(prize.AmountCents).
				Mul(decimal.NewFromFloat(quotaPerUnit)).
				Div(decimal.NewFromInt(100)).
				Div(decimal.NewFromFloat(rate))
			quota, err := common.WalletQuotaFromDecimalStrict(quotaValue)
			if err != nil || quota <= 0 {
				return fmt.Errorf("invalid quota for prize %q", prize.Name)
			}
			if err := tx.Model(&ActivityLotteryPrize{}).Where("id = ?", prize.Id).Update("quota", quota).Error; err != nil {
				return err
			}
		}
		activeKey := "active"
		result := tx.Model(&ActivityLotteryCampaign{}).
			Where("id = ? AND status = ?", id, ActivityLotteryStatusDraft).
			Updates(map[string]any{
				"status":                 ActivityLotteryStatusOpen,
				"active_key":             &activeKey,
				"published_at":           now.Unix(),
				"qualification_start_at": campaign.QualificationStartAt,
				"qualification_end_at":   campaign.DrawAt,
				"usd_exchange_rate":      rate,
				"quota_per_unit":         quotaPerUnit,
				"updated_at":             now.Unix(),
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("activity lottery was already published")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return GetActivityLotteryCampaignById(id)
}

func sampleActivityLotteryUsers(tx *gorm.DB, campaign *ActivityLotteryCampaign, slots int) ([]int, int64, error) {
	rows, err := activityLotteryEligibleTopups(tx, campaign).
		Distinct("user_id").Order("user_id asc").Rows()
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	selected := make([]int, 0, slots)
	var participantCount int64
	for rows.Next() {
		var userId int
		if err := rows.Scan(&userId); err != nil {
			return nil, 0, err
		}
		if userId <= 0 {
			continue
		}
		participantCount++
		if len(selected) < slots {
			selected = append(selected, userId)
			continue
		}
		choice, err := cryptorand.Int(cryptorand.Reader, big.NewInt(participantCount))
		if err != nil {
			return nil, 0, err
		}
		if choice.Int64() < int64(slots) {
			selected[choice.Int64()] = userId
		}
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	for i := len(selected) - 1; i > 0; i-- {
		choice, err := cryptorand.Int(cryptorand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return nil, 0, err
		}
		selected[i], selected[choice.Int64()] = selected[choice.Int64()], selected[i]
	}
	return selected, participantCount, nil
}

func DrawActivityLotteryCampaign(ctx context.Context, id int, now time.Time) (*ActivityLotteryCampaign, error) {
	if id <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	grantedWinners := make([]ActivityLotteryWinner, 0)
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var campaign ActivityLotteryCampaign
		if err := lockForUpdate(tx).Where("id = ?", id).First(&campaign).Error; err != nil {
			return err
		}
		if campaign.Status == ActivityLotteryStatusDrawn || campaign.Status == ActivityLotteryStatusExpired {
			return nil
		}
		if campaign.Status != ActivityLotteryStatusOpen {
			return errors.New("activity lottery is not open")
		}
		if now.Unix() < campaign.DrawAt {
			return errors.New("activity lottery draw time has not arrived")
		}

		var prizes []ActivityLotteryPrize
		if err := tx.Where("campaign_id = ?", id).Order("position asc").Find(&prizes).Error; err != nil {
			return err
		}
		slots := 0
		for _, prize := range prizes {
			if prize.Count <= 0 || prize.Quota <= 0 {
				return errors.New("activity lottery prize configuration is invalid")
			}
			slots += prize.Count
		}
		if slots == 0 || slots > 1000 {
			return errors.New("activity lottery prize slots are invalid")
		}

		selected, participantCount, err := sampleActivityLotteryUsers(tx, &campaign, slots)
		if err != nil {
			return err
		}
		status := ActivityLotteryStatusDrawn
		if participantCount < int64(campaign.MinParticipants) || len(selected) < slots {
			status = ActivityLotteryStatusExpired
		} else {
			position := 0
			for _, prize := range prizes {
				for range prize.Count {
					userId := selected[position]
					position++
					if err := creditTopUpQuota(tx, userId, prize.Quota, nil); err != nil {
						return err
					}
					winner := &ActivityLotteryWinner{
						CampaignId:   campaign.Id,
						UserId:       userId,
						PrizeId:      prize.Id,
						PrizeName:    prize.Name,
						AmountCents:  prize.AmountCents,
						Quota:        prize.Quota,
						CreditStatus: ActivityLotteryGrantStatusGranted,
						GrantedAt:    now.Unix(),
						CreatedAt:    now.Unix(),
					}
					if err := tx.Create(winner).Error; err != nil {
						return err
					}
					grantedWinners = append(grantedWinners, *winner)
				}
			}
		}
		updates := map[string]any{
			"status":            status,
			"active_key":        nil,
			"participant_count": participantCount,
			"updated_at":        now.Unix(),
		}
		if status == ActivityLotteryStatusDrawn {
			updates["drawn_at"] = now.Unix()
		}
		result := tx.Model(&ActivityLotteryCampaign{}).
			Where("id = ? AND status = ?", id, ActivityLotteryStatusOpen).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("activity lottery was already finalized")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, winner := range grantedWinners {
		syncCreditUserQuotaCache(winner.UserId, winner.Quota, "activity lottery gift")
		RecordTopupLog(winner.UserId, fmt.Sprintf("活动赠金到账：%s（活动 #%d，%s）", logger.LogQuota(winner.Quota), id, winner.PrizeName), "", "activity_bonus", "activity_lottery")
	}
	return GetActivityLotteryCampaignById(id)
}

func activityLotteryEligibleTopups(tx *gorm.DB, campaign *ActivityLotteryCampaign) *gorm.DB {
	return tx.Model(&TopUp{}).
		Where("status = ?", common.TopUpStatusSuccess).
		Where("user_id > 0").
		Where("complete_time >= ? AND complete_time < ?", campaign.QualificationStartAt, campaign.QualificationEndAt).
		Where("amount > 0 AND money > 0 AND group_buy_id = 0 AND agent_prepay_id = 0")
}

func GetActivityLotteryParticipation(campaign *ActivityLotteryCampaign, userId int) (int64, bool, error) {
	if campaign != nil && campaign.Status == ActivityLotteryStatusCanceled && campaign.QualificationEndAt == campaign.QualificationStartAt {
		return 0, false, nil
	}
	if campaign == nil || campaign.QualificationStartAt <= 0 || campaign.QualificationEndAt <= campaign.QualificationStartAt {
		return 0, false, errors.New("invalid activity lottery qualification period")
	}

	var count int64
	if err := activityLotteryEligibleTopups(DB, campaign).Distinct("user_id").Count(&count).Error; err != nil {
		return 0, false, err
	}
	if userId <= 0 {
		return count, false, nil
	}

	var userTopups int64
	if err := activityLotteryEligibleTopups(DB, campaign).Where("user_id = ?", userId).Count(&userTopups).Error; err != nil {
		return 0, false, err
	}
	return count, userTopups > 0, nil
}
