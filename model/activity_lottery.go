package model

import (
	"context"
	cryptorand "crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
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
	Id                   int     `json:"id" gorm:"primaryKey"`
	Title                string  `json:"title" gorm:"type:varchar(128);not null"`
	Description          string  `json:"description" gorm:"type:text"`
	Status               string  `json:"status" gorm:"type:varchar(16);index;not null"`
	ActiveKey            *string `json:"-" gorm:"type:varchar(16);uniqueIndex:idx_activity_lottery_active_key"`
	PublishedAt          int64   `json:"published_at" gorm:"bigint"`
	QualificationStartAt int64   `json:"qualification_start_at" gorm:"bigint"`
	QualificationEndAt   int64   `json:"qualification_end_at" gorm:"bigint"`
	DrawAt               int64   `json:"draw_at" gorm:"bigint;index"`
	MinParticipants      int     `json:"min_participants"`
	// DesignatedUserId, when greater than zero, reserves one slot of the
	// top prize tier for that account instead of drawing it randomly.
	DesignatedUserId      int                    `json:"designated_user_id"`
	ParticipantCount      int64                  `json:"participant_count" gorm:"bigint"`
	USDExchangeRate       float64                `json:"usd_exchange_rate"`
	QuotaPerUnit          float64                `json:"quota_per_unit"`
	DisplayCurrency       string                 `json:"display_currency" gorm:"type:varchar(16)"`
	DisplayCurrencySymbol string                 `json:"display_currency_symbol" gorm:"type:varchar(16)"`
	DisplayCurrencyRate   float64                `json:"display_currency_rate"`
	DrawnAt               int64                  `json:"drawn_at" gorm:"bigint"`
	LastError             string                 `json:"-" gorm:"type:text"`
	CreatedAt             int64                  `json:"created_at" gorm:"bigint"`
	UpdatedAt             int64                  `json:"updated_at" gorm:"bigint"`
	Prizes                []ActivityLotteryPrize `json:"prizes" gorm:"foreignKey:CampaignId"`
}

type ActivityLotteryPrize struct {
	Id         int    `json:"id" gorm:"primaryKey"`
	CampaignId int    `json:"campaign_id" gorm:"uniqueIndex:idx_activity_lottery_prize_position,priority:1;index"`
	Position   int    `json:"position" gorm:"uniqueIndex:idx_activity_lottery_prize_position,priority:2"`
	Name       string `json:"name" gorm:"type:varchar(64);not null"`
	Count      int    `json:"count"`
	// AmountCents is the smallest two-decimal unit of the captured display
	// currency; in TOKENS mode it stores raw quota units for API compatibility.
	AmountCents int64 `json:"amount_cents" gorm:"bigint"`
	Quota       int   `json:"quota" gorm:"bigint"`
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
	Name  string `json:"name"`
	Count int    `json:"count"`
	// AmountCents keeps the original API field name while following the
	// display currency captured when the draft is created.
	AmountCents int64 `json:"amount_cents"`
}

type ActivityLotteryDraftInput struct {
	Title                string                      `json:"title"`
	Description          string                      `json:"description"`
	QualificationStartAt int64                       `json:"qualification_start_at"`
	DrawAt               int64                       `json:"draw_at"`
	MinParticipants      int                         `json:"min_participants"`
	DesignatedUserId     int                         `json:"designated_user_id"`
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
			return errors.New("invalid prize tier count or amount")
		}
		totalSlots += prize.Count
		poolCents += int64(prize.Count) * prize.AmountCents
	}
	if totalSlots > 1000 || poolCents > 100_000_000 {
		return errors.New("activity lottery prize pool exceeds the allowed limit")
	}
	// A designated winner takes over one slot, so the tier it belongs to must
	// offer at least one. Only a negative value is rejected outright; a
	// designated account that disappears before the draw falls back to a
	// normal random draw.
	if input.DesignatedUserId < 0 {
		return errors.New("activity lottery designated user id is invalid")
	}
	if input.DesignatedUserId > 0 {
		if input.Prizes[0].Count < 1 {
			return errors.New("the top prize tier must have at least one winner slot")
		}
		if _, err := GetUserById(input.DesignatedUserId, false); err != nil {
			return errors.New("activity lottery designated user does not exist")
		}
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
	normalizeActivityLotteryCampaignCurrency(&campaign)
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
	displayCurrency, err := currentActivityLotteryCurrency()
	if err != nil {
		return nil, err
	}
	campaign := &ActivityLotteryCampaign{
		Title:                 input.Title,
		Description:           input.Description,
		Status:                ActivityLotteryStatusDraft,
		QualificationStartAt:  input.QualificationStartAt,
		DrawAt:                input.DrawAt,
		MinParticipants:       input.MinParticipants,
		DesignatedUserId:      input.DesignatedUserId,
		DisplayCurrency:       displayCurrency.DisplayCurrency,
		DisplayCurrencySymbol: displayCurrency.DisplayCurrencySymbol,
		DisplayCurrencyRate:   displayCurrency.DisplayCurrencyRate,
		CreatedAt:             now.Unix(),
		UpdatedAt:             now.Unix(),
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
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
	displayCurrency, err := currentActivityLotteryCurrency()
	if err != nil {
		return nil, err
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var campaign ActivityLotteryCampaign
		if err := lockForUpdate(tx).Where("id = ?", id).First(&campaign).Error; err != nil {
			return err
		}
		if campaign.Status != ActivityLotteryStatusDraft {
			return errors.New("published activity lottery rules cannot be edited")
		}
		if err := tx.Model(&ActivityLotteryCampaign{}).Where("id = ?", id).
			Updates(map[string]any{
				"title":                   input.Title,
				"description":             input.Description,
				"qualification_start_at":  input.QualificationStartAt,
				"draw_at":                 input.DrawAt,
				"min_participants":        input.MinParticipants,
				"designated_user_id":      input.DesignatedUserId,
				"display_currency":        displayCurrency.DisplayCurrency,
				"display_currency_symbol": displayCurrency.DisplayCurrencySymbol,
				"display_currency_rate":   displayCurrency.DisplayCurrencyRate,
				"updated_at":              now.Unix(),
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
	quotaPerUnit := common.QuotaPerUnit
	if quotaPerUnit <= 0 {
		return nil, errors.New("invalid activity lottery quota conversion settings")
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
		displayCurrency := activityLotteryCurrencyForCampaign(&campaign)
		for _, prize := range prizes {
			quota, err := activityLotteryPrizeQuota(prize.AmountCents, displayCurrency, quotaPerUnit)
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
				"status":                  ActivityLotteryStatusOpen,
				"active_key":              &activeKey,
				"published_at":            now.Unix(),
				"qualification_start_at":  campaign.QualificationStartAt,
				"qualification_end_at":    campaign.DrawAt,
				"usd_exchange_rate":       operation_setting.USDExchangeRate,
				"quota_per_unit":          quotaPerUnit,
				"display_currency":        displayCurrency.DisplayCurrency,
				"display_currency_symbol": displayCurrency.DisplayCurrencySymbol,
				"display_currency_rate":   displayCurrency.DisplayCurrencyRate,
				"updated_at":              now.Unix(),
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

		// A designated winner only replaces the first slot of the top prize
		// tier. It is not required to have qualified through a top-up, and it
		// counts towards both the participant total and the minimum that
		// unblocks the round. If the account no longer exists the campaign
		// silently falls back to a fully random draw.
		designatedUserId := campaign.DesignatedUserId
		if designatedUserId > 0 {
			if _, err := GetUserById(designatedUserId, false); err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("activity lottery #%d designated user %d no longer exists; falling back to a random draw", id, designatedUserId))
				designatedUserId = 0
			}
		}

		selectedSlots := slots
		if designatedUserId > 0 {
			selectedSlots = slots - 1
		}
		selected, participantCount, err := sampleActivityLotteryUsers(tx, &campaign, selectedSlots)
		if err != nil {
			return err
		}
		if designatedUserId > 0 {
			participantCount++
		}

		status := ActivityLotteryStatusDrawn
		if participantCount < int64(campaign.MinParticipants) || len(selected) < selectedSlots {
			status = ActivityLotteryStatusExpired
		} else {
			if selectedSlots > 0 {
				position := 0
				// The designated account takes the first slot of the top prize
				// tier, so that one slot is skipped while the sampled accounts
				// fill everything else in tier order.
				topTierReserved := designatedUserId > 0
				for _, prize := range prizes {
					count := prize.Count
					if topTierReserved {
						count--
						topTierReserved = false
					}
					for range count {
						userId := selected[position]
						position++
						winner, err := grantActivityLotteryPrize(tx, &campaign, prize, userId, now)
						if err != nil {
							return err
						}
						grantedWinners = append(grantedWinners, *winner)
					}
				}
			}
			if designatedUserId > 0 {
				winner, err := grantActivityLotteryPrize(tx, &campaign, prizes[0], designatedUserId, now)
				if err != nil {
					return err
				}
				grantedWinners = append(grantedWinners, *winner)
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

func grantActivityLotteryPrize(tx *gorm.DB, campaign *ActivityLotteryCampaign, prize ActivityLotteryPrize, userId int, now time.Time) (*ActivityLotteryWinner, error) {
	if err := creditTopUpQuota(tx, userId, prize.Quota, nil); err != nil {
		return nil, err
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
		return nil, err
	}
	return winner, nil
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
