package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// 工单状态
const (
	TicketStatusOpen       = "open"       // 待处理
	TicketStatusProcessing = "processing" // 处理中
	TicketStatusReplied    = "replied"    // 已回复（等待用户）
	TicketStatusResolved   = "resolved"   // 已解决
	TicketStatusClosed     = "closed"     // 已关闭
)

var ticketValidStatuses = map[string]bool{
	TicketStatusOpen:       true,
	TicketStatusProcessing: true,
	TicketStatusReplied:    true,
	TicketStatusResolved:   true,
	TicketStatusClosed:     true,
}

// 工单优先级
const (
	TicketPriorityLow    = "low"
	TicketPriorityMedium = "medium"
	TicketPriorityHigh   = "high"
	TicketPriorityUrgent = "urgent"
)

var ticketValidPriorities = map[string]bool{
	TicketPriorityLow:    true,
	TicketPriorityMedium: true,
	TicketPriorityHigh:   true,
	TicketPriorityUrgent: true,
}

// 工单分类
const (
	TicketCategoryBilling   = "billing"   // 账单充值
	TicketCategoryTechnical = "technical" // 技术支持
	TicketCategoryAccount   = "account"   // 账号问题
	TicketCategoryOther     = "other"     // 其他
)

var ticketValidCategories = map[string]bool{
	TicketCategoryBilling:   true,
	TicketCategoryTechnical: true,
	TicketCategoryAccount:   true,
	TicketCategoryOther:     true,
}

// 消息作者角色
const (
	TicketAuthorUser  = "user"
	TicketAuthorAdmin = "admin"
)

// TicketAttachment 附件元信息（存于消息的 JSON 列，文件本体落本地磁盘）。
type TicketAttachment struct {
	Name string `json:"name"` // 原始文件名
	File string `json:"file"` // 落盘文件名
	Size int64  `json:"size"`
}

func marshalTicketAttachments(list []TicketAttachment) string {
	if len(list) == 0 {
		return ""
	}
	b, err := common.Marshal(list)
	if err != nil {
		return ""
	}
	return string(b)
}

func unmarshalTicketAttachments(s string) []TicketAttachment {
	if s == "" {
		return nil
	}
	var list []TicketAttachment
	if err := common.Unmarshal([]byte(s), &list); err != nil {
		return nil
	}
	return list
}

// Ticket 工单主体。
type Ticket struct {
	Id            int    `json:"id"`
	TicketNo      string `json:"ticket_no" gorm:"type:varchar(32);uniqueIndex"`
	UserId        int    `json:"user_id" gorm:"index"`
	Username      string `json:"username" gorm:"type:varchar(64)"`
	Title         string `json:"title" gorm:"type:varchar(255);not null"`
	Category      string `json:"category" gorm:"type:varchar(32);index"`
	Priority      string `json:"priority" gorm:"type:varchar(16);index"`
	Status        string `json:"status" gorm:"type:varchar(16);index"`
	LastReplyAt   int64  `json:"last_reply_at" gorm:"bigint;index"`
	LastReplyRole string `json:"last_reply_role" gorm:"type:varchar(16)"`
	UserUnread    bool   `json:"user_unread"`  // 有管理员新回复待用户查看
	AdminUnread   bool   `json:"admin_unread"` // 有用户新回复待管理员查看
	MessageCount  int    `json:"message_count"`
	CreatedAt     int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt     int64  `json:"updated_at" gorm:"bigint"`

	Messages []*TicketMessage `json:"messages,omitempty" gorm:"-"`
}

// TicketMessage 工单对话消息。
type TicketMessage struct {
	Id              int    `json:"id"`
	TicketId        int    `json:"ticket_id" gorm:"index"`
	AuthorId        int    `json:"author_id"`
	AuthorRole      string `json:"author_role" gorm:"type:varchar(16)"`
	AuthorName      string `json:"author_name" gorm:"type:varchar(64)"`
	Content         string `json:"content" gorm:"type:text"`
	AttachmentsJson string `json:"-" gorm:"column:attachments;type:text"`

	Attachments []TicketAttachment `json:"attachments" gorm:"-"`
	CreatedAt   int64              `json:"created_at" gorm:"bigint;index"`
}

func (m *TicketMessage) AfterFind(_ *gorm.DB) error {
	m.Attachments = unmarshalTicketAttachments(m.AttachmentsJson)
	return nil
}

func normalizeTicketCategory(category string) string {
	category = strings.TrimSpace(category)
	if !ticketValidCategories[category] {
		return TicketCategoryOther
	}
	return category
}

func normalizeTicketPriority(priority string) string {
	priority = strings.TrimSpace(priority)
	if !ticketValidPriorities[priority] {
		return TicketPriorityMedium
	}
	return priority
}

func generateTicketNo() string {
	return fmt.Sprintf("T%s%s", time.Now().Format("20060102"), strings.ToUpper(common.GetRandomString(6)))
}

// CreateTicket 事务创建工单及首条消息。调用方需已填好 UserId/Username/Title/Category/Priority 以及首条消息内容/附件。
func CreateTicket(ticket *Ticket, firstMessage *TicketMessage) error {
	ticket.Title = strings.TrimSpace(ticket.Title)
	if ticket.Title == "" {
		return errors.New("工单标题不能为空")
	}
	if len([]rune(ticket.Title)) > 255 {
		return errors.New("工单标题过长")
	}
	if firstMessage == nil || strings.TrimSpace(firstMessage.Content) == "" {
		return errors.New("工单内容不能为空")
	}
	ticket.Category = normalizeTicketCategory(ticket.Category)
	ticket.Priority = normalizeTicketPriority(ticket.Priority)

	now := common.GetTimestamp()
	ticket.Status = TicketStatusOpen
	ticket.LastReplyAt = now
	ticket.LastReplyRole = TicketAuthorUser
	ticket.AdminUnread = true
	ticket.UserUnread = false
	ticket.MessageCount = 1
	ticket.CreatedAt = now
	ticket.UpdatedAt = now

	firstMessage.AuthorRole = TicketAuthorUser
	firstMessage.AttachmentsJson = marshalTicketAttachments(firstMessage.Attachments)
	firstMessage.CreatedAt = now

	// 工单号高熵（T + 日期 + 6 位随机），碰撞概率可忽略；不在事务内重试以兼容 PostgreSQL 出错即中止事务的语义。
	ticket.TicketNo = generateTicketNo()
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(ticket).Error; err != nil {
			return err
		}
		firstMessage.TicketId = ticket.Id
		return tx.Create(firstMessage).Error
	})
}

// AddTicketReply 事务追加一条回复，并按作者角色刷新工单状态/未读/统计。返回刷新后的工单。
func AddTicketReply(ticketId int, msg *TicketMessage, byAdmin bool) (*Ticket, error) {
	if strings.TrimSpace(msg.Content) == "" && len(msg.Attachments) == 0 {
		return nil, errors.New("回复内容不能为空")
	}
	now := common.GetTimestamp()
	msg.TicketId = ticketId
	msg.AttachmentsJson = marshalTicketAttachments(msg.Attachments)
	msg.CreatedAt = now
	if byAdmin {
		msg.AuthorRole = TicketAuthorAdmin
	} else {
		msg.AuthorRole = TicketAuthorUser
	}

	var updated *Ticket
	err := DB.Transaction(func(tx *gorm.DB) error {
		ticket := &Ticket{}
		if err := lockForUpdate(tx).Where("id = ?", ticketId).First(ticket).Error; err != nil {
			return errors.New("工单不存在")
		}
		if ticket.Status == TicketStatusClosed {
			return errors.New("工单已关闭，无法回复")
		}
		if err := tx.Create(msg).Error; err != nil {
			return err
		}
		updates := map[string]interface{}{
			"last_reply_at":   now,
			"updated_at":      now,
			"message_count":   ticket.MessageCount + 1,
			"last_reply_role": msg.AuthorRole,
		}
		if byAdmin {
			updates["status"] = TicketStatusReplied
			updates["user_unread"] = true
			updates["admin_unread"] = false
		} else {
			// 用户回复：若已解决则重新打开，否则标记为处理中
			if ticket.Status == TicketStatusResolved {
				updates["status"] = TicketStatusOpen
			} else {
				updates["status"] = TicketStatusProcessing
			}
			updates["admin_unread"] = true
			updates["user_unread"] = false
		}
		if err := tx.Model(&Ticket{}).Where("id = ?", ticketId).Updates(updates).Error; err != nil {
			return err
		}
		updated = &Ticket{}
		return tx.Where("id = ?", ticketId).First(updated).Error
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func GetTicketById(id int) (*Ticket, error) {
	if id <= 0 {
		return nil, errors.New("工单不存在")
	}
	ticket := &Ticket{}
	if err := DB.Where("id = ?", id).First(ticket).Error; err != nil {
		return nil, errors.New("工单不存在")
	}
	return ticket, nil
}

func GetTicketMessages(ticketId int) ([]*TicketMessage, error) {
	var list []*TicketMessage
	err := DB.Where("ticket_id = ?", ticketId).Order("id asc").Find(&list).Error
	return list, err
}

// TicketHasAttachment 校验某文件确属该工单的某条消息附件，避免越权下载目录内任意文件。
func TicketHasAttachment(ticketId int, fileName string) bool {
	messages, err := GetTicketMessages(ticketId)
	if err != nil {
		return false
	}
	for _, m := range messages {
		for _, att := range m.Attachments {
			if att.File == fileName {
				return true
			}
		}
	}
	return false
}

func GetSelfTickets(userId int, status, category string, pageInfo *common.PageInfo) ([]*Ticket, int64, error) {
	query := DB.Model(&Ticket{}).Where("user_id = ?", userId)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if category != "" {
		query = query.Where("category = ?", category)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []*Ticket
	err := query.Order("last_reply_at desc, id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&list).Error
	return list, total, err
}

func GetAllTickets(status, category, priority, keyword string, pageInfo *common.PageInfo) ([]*Ticket, int64, error) {
	query := DB.Model(&Ticket{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if category != "" {
		query = query.Where("category = ?", category)
	}
	if priority != "" {
		query = query.Where("priority = ?", priority)
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("ticket_no LIKE ? OR title LIKE ? OR username LIKE ?", like, like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []*Ticket
	err := query.Order("admin_unread desc, last_reply_at desc, id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&list).Error
	return list, total, err
}

// MarkTicketRead 查看工单时清除对应角色的未读标记。
func MarkTicketRead(ticketId int, byAdmin bool) error {
	column := "user_unread"
	if byAdmin {
		column = "admin_unread"
	}
	return DB.Model(&Ticket{}).Where("id = ?", ticketId).Update(column, false).Error
}

func UpdateTicketStatus(ticketId int, status string) error {
	if !ticketValidStatuses[status] {
		return errors.New("工单状态无效")
	}
	return DB.Model(&Ticket{}).Where("id = ?", ticketId).Updates(map[string]interface{}{
		"status":     status,
		"updated_at": common.GetTimestamp(),
	}).Error
}

func UpdateTicketPriority(ticketId int, priority string) error {
	if !ticketValidPriorities[priority] {
		return errors.New("工单优先级无效")
	}
	return DB.Model(&Ticket{}).Where("id = ?", ticketId).Updates(map[string]interface{}{
		"priority":   priority,
		"updated_at": common.GetTimestamp(),
	}).Error
}

// CloseTicket 关闭工单。非管理员仅能关闭自己的工单。
func CloseTicket(ticketId, userId int, byAdmin bool) error {
	ticket, err := GetTicketById(ticketId)
	if err != nil {
		return err
	}
	if !byAdmin && ticket.UserId != userId {
		return errors.New("无权操作该工单")
	}
	return DB.Model(&Ticket{}).Where("id = ?", ticketId).Updates(map[string]interface{}{
		"status":     TicketStatusClosed,
		"updated_at": common.GetTimestamp(),
	}).Error
}

// GetTicketStatusCounts 管理端各状态工单数量统计。
func GetTicketStatusCounts() (map[string]int64, error) {
	type row struct {
		Status string
		Count  int64
	}
	var rows []row
	if err := DB.Model(&Ticket{}).Select("status, count(*) as count").Group("status").Scan(&rows).Error; err != nil {
		return nil, err
	}
	counts := map[string]int64{
		TicketStatusOpen:       0,
		TicketStatusProcessing: 0,
		TicketStatusReplied:    0,
		TicketStatusResolved:   0,
		TicketStatusClosed:     0,
	}
	var total int64
	for _, r := range rows {
		counts[r.Status] = r.Count
		total += r.Count
	}
	counts["all"] = total
	return counts, nil
}
