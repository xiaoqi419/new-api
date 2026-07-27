package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// 公告分类
const (
	AnnouncementTypeVersion  = "version"  // 版本公告
	AnnouncementTypeSystem   = "system"   // 系统通知
	AnnouncementTypeActivity = "activity" // 活动公告
)

var announcementValidTypes = map[string]bool{
	AnnouncementTypeVersion:  true,
	AnnouncementTypeSystem:   true,
	AnnouncementTypeActivity: true,
}

// 公告级别（驱动前端徽标颜色）
const (
	AnnouncementLevelDefault = "default"
	AnnouncementLevelSuccess = "success"
	AnnouncementLevelWarning = "warning"
	AnnouncementLevelError   = "error"
)

var announcementValidLevels = map[string]bool{
	AnnouncementLevelDefault: true,
	AnnouncementLevelSuccess: true,
	AnnouncementLevelWarning: true,
	AnnouncementLevelError:   true,
}

// Announcement 后台可编辑的公告 / 更新公告，替代旧的 console_setting.announcements 静态方案。
type Announcement struct {
	Id          int    `json:"id"`
	Title       string `json:"title" gorm:"type:varchar(255);not null"`
	Content     string `json:"content" gorm:"type:text"` // 支持 Markdown
	Type        string `json:"type" gorm:"type:varchar(32);index"`
	Level       string `json:"level" gorm:"type:varchar(16)"`
	Version     string `json:"version" gorm:"type:varchar(64)"` // 版本号，仅版本公告用于右侧时间线
	Pinned      bool   `json:"pinned" gorm:"index"`             // 置顶
	Published   bool   `json:"published" gorm:"index"`          // 已发布 / 草稿
	PublishTime int64  `json:"publish_time" gorm:"bigint;index"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt   int64  `json:"updated_at" gorm:"bigint"`
}

func (a *Announcement) normalize() {
	a.Title = strings.TrimSpace(a.Title)
	a.Type = strings.TrimSpace(a.Type)
	a.Level = strings.TrimSpace(a.Level)
	a.Version = strings.TrimSpace(a.Version)
	if a.Type == "" {
		a.Type = AnnouncementTypeSystem
	}
	if a.Level == "" {
		a.Level = AnnouncementLevelDefault
	}
}

func (a *Announcement) ValidateForSave() error {
	a.normalize()
	if a.Title == "" {
		return errors.New("公告标题不能为空")
	}
	if len([]rune(a.Title)) > 255 {
		return errors.New("公告标题过长")
	}
	if !announcementValidTypes[a.Type] {
		return errors.New("公告分类无效")
	}
	if !announcementValidLevels[a.Level] {
		return errors.New("公告级别无效")
	}
	return nil
}

func (a *Announcement) Insert() error {
	if err := a.ValidateForSave(); err != nil {
		return err
	}
	now := common.GetTimestamp()
	if a.PublishTime == 0 {
		a.PublishTime = now
	}
	a.CreatedAt = now
	a.UpdatedAt = now
	return DB.Create(a).Error
}

func (a *Announcement) Update() error {
	if err := a.ValidateForSave(); err != nil {
		return err
	}
	if a.PublishTime == 0 {
		a.PublishTime = common.GetTimestamp()
	}
	a.UpdatedAt = common.GetTimestamp()
	return DB.Model(&Announcement{}).Where("id = ?", a.Id).Updates(map[string]interface{}{
		"title":        a.Title,
		"content":      a.Content,
		"type":         a.Type,
		"level":        a.Level,
		"version":      a.Version,
		"pinned":       a.Pinned,
		"published":    a.Published,
		"publish_time": a.PublishTime,
		"updated_at":   a.UpdatedAt,
	}).Error
}

func GetAnnouncementById(id int) (*Announcement, error) {
	if id <= 0 {
		return nil, errors.New("公告不存在")
	}
	a := &Announcement{}
	if err := DB.Where("id = ?", id).First(a).Error; err != nil {
		return nil, errors.New("公告不存在")
	}
	return a, nil
}

// GetPublishedAnnouncements 公开查询已发布公告，按置顶 + 发布时间倒序。limit<=0 表示不限制。
func GetPublishedAnnouncements(annType string, limit int) ([]*Announcement, error) {
	query := DB.Model(&Announcement{}).Where("published = ?", true)
	if annType != "" {
		query = query.Where("type = ?", annType)
	}
	query = query.Order("pinned desc, publish_time desc, id desc")
	if limit > 0 {
		query = query.Limit(limit)
	}
	var list []*Announcement
	err := query.Find(&list).Error
	return list, err
}

// GetAllAnnouncements 管理端分页查询（含草稿）。
func GetAllAnnouncements(annType string, pageInfo *common.PageInfo) ([]*Announcement, int64, error) {
	query := DB.Model(&Announcement{})
	if annType != "" {
		query = query.Where("type = ?", annType)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []*Announcement
	err := query.Order("pinned desc, publish_time desc, id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&list).Error
	return list, total, err
}

func DeleteAnnouncementById(id int) error {
	if id <= 0 {
		return errors.New("参数错误")
	}
	return DB.Where("id = ?", id).Delete(&Announcement{}).Error
}
