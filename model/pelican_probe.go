package model

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const pelicanTextLimit = 60000

// PelicanProbe is one half-hour logic or drawing check for a group.
type PelicanProbe struct {
	Id           int     `json:"id" gorm:"primaryKey"`
	GroupName    string  `json:"group_name" gorm:"type:varchar(64);uniqueIndex:idx_pelican_slot,priority:1"`
	Kind         string  `json:"kind" gorm:"type:varchar(16);uniqueIndex:idx_pelican_slot,priority:2"`
	SlotStart    int64   `json:"slot_start" gorm:"bigint;uniqueIndex:idx_pelican_slot,priority:3;index"`
	Status       string  `json:"status" gorm:"type:varchar(16);index"`
	ModelName    string  `json:"model_name" gorm:"type:varchar(255)"`
	Reasoning    string  `json:"reasoning" gorm:"type:varchar(32)"`
	GroupRatio   float64 `json:"group_ratio"`
	LatencyMs    int     `json:"latency_ms"`
	TtftMs       int     `json:"ttft_ms"`
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	Attempts     int     `json:"attempts"`
	Answer       string  `json:"answer" gorm:"type:varchar(32)"`
	Prompt       string  `json:"prompt" gorm:"type:text"`
	Reply        string  `json:"reply" gorm:"type:text"`
	DrawingHTML  string  `json:"drawing_html" gorm:"type:text"`
	Subject      string  `json:"subject" gorm:"type:varchar(64)"`
	Vehicle      string  `json:"vehicle" gorm:"type:varchar(64)"`
	Scene        string  `json:"scene" gorm:"type:varchar(64)"`
	Error        string  `json:"error" gorm:"type:varchar(1024)"`
	CreatedAt    int64   `json:"created_at" gorm:"bigint"`
}

func (probe *PelicanProbe) clip() {
	probe.Prompt = clipPelicanColumn(probe.Prompt)
	probe.Reply = clipPelicanColumn(probe.Reply)
	probe.DrawingHTML = clipPelicanColumn(probe.DrawingHTML)
	probe.Error = clipPelicanColumn(probe.Error)
	if len(probe.Answer) > 32 {
		probe.Answer = probe.Answer[:32]
	}
}

func clipPelicanColumn(value string) string {
	if len(value) <= pelicanTextLimit {
		return value
	}
	cut := value[:pelicanTextLimit]
	for len(cut) > 0 && cut[len(cut)-1]&0xC0 == 0x80 {
		cut = cut[:len(cut)-1]
	}
	return cut
}

func pelicanDuplicate(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "unique") || strings.Contains(text, "duplicate")
}

// ClaimPelicanProbe inserts the running row for a slot. The caller must run the check only when claimed is true.
func ClaimPelicanProbe(probe *PelicanProbe) (bool, error) {
	if probe.CreatedAt == 0 {
		probe.CreatedAt = time.Now().Unix()
	}
	probe.Status = "running"
	probe.clip()
	err := DB.Create(probe).Error
	if pelicanDuplicate(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func FinishPelicanProbe(probe *PelicanProbe) error {
	probe.clip()
	return DB.Model(&PelicanProbe{}).Where("id = ?", probe.Id).Updates(map[string]any{
		"status":        probe.Status,
		"model_name":    probe.ModelName,
		"reasoning":     probe.Reasoning,
		"group_ratio":   probe.GroupRatio,
		"latency_ms":    probe.LatencyMs,
		"ttft_ms":       probe.TtftMs,
		"input_tokens":  probe.InputTokens,
		"output_tokens": probe.OutputTokens,
		"attempts":      probe.Attempts,
		"answer":        probe.Answer,
		"prompt":        probe.Prompt,
		"reply":         probe.Reply,
		"drawing_html":  probe.DrawingHTML,
		"subject":       probe.Subject,
		"vehicle":       probe.Vehicle,
		"scene":         probe.Scene,
		"error":         probe.Error,
	}).Error
}

func ReleasePelicanProbe(id int) error {
	if id <= 0 {
		return nil
	}
	return DB.Delete(&PelicanProbe{}, id).Error
}

func FailStalePelicanProbes(cutoff int64) error {
	return DB.Model(&PelicanProbe{}).
		Where("status = ? AND created_at > 0 AND created_at < ?", "running", cutoff).
		Updates(map[string]any{"status": "error", "error": "check interrupted"}).Error
}

func ListPelicanProbeBriefs(from, to int64) ([]PelicanProbe, error) {
	var rows []PelicanProbe
	err := DB.Select("id, group_name, kind, slot_start, status, model_name, reasoning, group_ratio, latency_ms, ttft_ms, input_tokens, output_tokens, attempts, answer, subject, vehicle, scene, error, created_at").
		Where("slot_start >= ? AND slot_start <= ?", from, to).
		Order("slot_start asc, id asc").
		Find(&rows).Error
	return rows, err
}

func LatestPassedPelicanDrawing(group string, from, to int64) (*PelicanProbe, error) {
	var row PelicanProbe
	err := DB.Where("group_name = ? AND kind = ? AND slot_start >= ? AND slot_start <= ? AND status = ? AND drawing_html <> ''", group, "drawing", from, to, "pass").
		Order("slot_start desc, id desc").
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func GetPelicanProbeByID(id int) (*PelicanProbe, error) {
	if id <= 0 {
		return nil, nil
	}
	var row PelicanProbe
	err := DB.First(&row, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

type pelicanGroupRow struct {
	Group string `gorm:"column:group"`
}

func ListEnabledAbilityGroups() ([]string, error) {
	var rows []pelicanGroupRow
	err := DB.Model(&Ability{}).
		Select(commonGroupCol).
		Where("enabled = ?", true).
		Group(commonGroupCol).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(rows))
	seen := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		name := strings.TrimSpace(row.Group)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	return names, nil
}

// FindPelicanToken returns one enabled token owned by a root user whose
// effective group is group. A token with an empty group uses its user's group.
// Tokens owned by any other role are ignored.
func FindPelicanToken(group string, now int64) (*Token, error) {
	if strings.TrimSpace(group) == "" {
		return nil, nil
	}
	var token Token
	tokenGroup := "tokens." + commonGroupCol
	userGroup := "users." + commonGroupCol
	err := DB.Model(&Token{}).
		Joins("join users on users.id = tokens.user_id").
		Where("users.role = ?", common.RoleRootUser).
		Where("tokens.status = ?", common.TokenStatusEnabled).
		Where("tokens.expired_time = -1 OR tokens.expired_time >= ?", now).
		Where("tokens.unlimited_quota = ? OR tokens.remain_quota > 0", true).
		Where(tokenGroup+" = ? OR (("+tokenGroup+" = '' OR "+tokenGroup+" IS NULL) AND "+userGroup+" = ?)", group, group).
		Order("tokens.id desc").
		First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &token, nil
}
