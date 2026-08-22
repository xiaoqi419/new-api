package controller

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/error_alert_setting"

	"github.com/gin-gonic/gin"
)

const maxTicketAttachmentBytes = 10 * 1024 * 1024
const maxTicketAttachments = 6
const maxTicketContentRunes = 5000

var allowedTicketAttachmentExts = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".gif":  true,
	".pdf":  true,
	".txt":  true,
	".log":  true,
	".zip":  true,
}

// ticketAttachmentDir 工单附件本地存储目录，可用环境变量覆盖。
func ticketAttachmentDir() string {
	if dir := os.Getenv("TICKET_ATTACHMENT_DIR"); dir != "" {
		return dir
	}
	return "./data/ticket_attachments"
}

type ticketCreateRequest struct {
	Title       string                   `json:"title"`
	Category    string                   `json:"category"`
	Priority    string                   `json:"priority"`
	Content     string                   `json:"content"`
	Attachments []model.TicketAttachment `json:"attachments"`
}

type ticketReplyRequest struct {
	Content     string                   `json:"content"`
	Attachments []model.TicketAttachment `json:"attachments"`
}

// sanitizeTicketAttachments 仅保留目录内真实存在的附件并规整文件名，防止越权引用。
func sanitizeTicketAttachments(list []model.TicketAttachment) []model.TicketAttachment {
	if len(list) == 0 {
		return nil
	}
	dir := ticketAttachmentDir()
	result := make([]model.TicketAttachment, 0, len(list))
	for _, att := range list {
		safeName := filepath.Base(strings.TrimSpace(att.File))
		if safeName == "" || safeName == "." || safeName == "/" {
			continue
		}
		if !strings.HasPrefix(safeName, "ticket_") {
			continue
		}
		info, err := os.Stat(filepath.Join(dir, safeName))
		if err != nil || info.IsDir() {
			continue
		}
		name := strings.TrimSpace(att.Name)
		if name == "" {
			name = safeName
		}
		if len([]rune(name)) > 128 {
			name = string([]rune(name)[:128])
		}
		result = append(result, model.TicketAttachment{Name: name, File: safeName, Size: info.Size()})
		if len(result) >= maxTicketAttachments {
			break
		}
	}
	return result
}

// GetTicketMeta 返回工单枚举（分类/优先级/状态），供表单与筛选使用。
func GetTicketMeta(c *gin.Context) {
	common.ApiSuccess(c, gin.H{
		"categories": []string{
			model.TicketCategoryBilling,
			model.TicketCategoryTechnical,
			model.TicketCategoryAccount,
			model.TicketCategoryOther,
		},
		"priorities": []string{
			model.TicketPriorityLow,
			model.TicketPriorityMedium,
			model.TicketPriorityHigh,
			model.TicketPriorityUrgent,
		},
		"statuses": []string{
			model.TicketStatusOpen,
			model.TicketStatusProcessing,
			model.TicketStatusReplied,
			model.TicketStatusResolved,
			model.TicketStatusClosed,
		},
	})
}

// UploadTicketAttachment 用户上传单个附件，返回落盘引用（供创建/回复时携带）。
func UploadTicketAttachment(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		common.ApiErrorMsg(c, "用户未登录")
		return
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "请选择文件")
		return
	}
	if fileHeader.Size > maxTicketAttachmentBytes {
		common.ApiErrorMsg(c, "文件大小不能超过 10MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedTicketAttachmentExts[ext] {
		common.ApiErrorMsg(c, "不支持的文件类型")
		return
	}
	dir := ticketAttachmentDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		common.ApiError(c, err)
		return
	}
	fileName := fmt.Sprintf("ticket_%d_%d%s", userId, time.Now().UnixNano(), ext)
	if err := c.SaveUploadedFile(fileHeader, filepath.Join(dir, fileName)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, model.TicketAttachment{
		Name: fileHeader.Filename,
		File: fileName,
		Size: fileHeader.Size,
	})
}

// DownloadTicketAttachment 下载附件，仅工单所属用户或管理员可访问。
func DownloadTicketAttachment(c *gin.Context) {
	userId := c.GetInt("id")
	role := c.GetInt("role")
	ticketId, err := strconv.Atoi(c.Param("id"))
	if err != nil || ticketId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	safeName := filepath.Base(c.Param("file"))
	ticket, err := model.GetTicketById(ticketId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if ticket.UserId != userId && role < common.RoleAdminUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权访问该附件"})
		return
	}
	if !model.TicketHasAttachment(ticketId, safeName) {
		common.ApiErrorMsg(c, "附件不存在")
		return
	}
	fullPath := filepath.Join(ticketAttachmentDir(), safeName)
	if _, err := os.Stat(fullPath); err != nil {
		common.ApiErrorMsg(c, "附件不存在")
		return
	}
	c.File(fullPath)
}

// GetSelfTickets 用户查询自己的工单列表。
func GetSelfTickets(c *gin.Context) {
	userId := c.GetInt("id")
	status := c.Query("status")
	category := c.Query("category")
	pageInfo := common.GetPageQuery(c)
	tickets, total, err := model.GetSelfTickets(userId, status, category, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tickets)
	common.ApiSuccess(c, pageInfo)
}

// CreateTicket 用户创建工单。
func CreateTicket(c *gin.Context) {
	userId := c.GetInt("id")
	username := c.GetString("username")
	if userId == 0 {
		common.ApiErrorMsg(c, "用户未登录")
		return
	}
	var req ticketCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		common.ApiErrorMsg(c, "工单内容不能为空")
		return
	}
	if len([]rune(req.Content)) > maxTicketContentRunes {
		common.ApiErrorMsg(c, "工单内容过长")
		return
	}
	ticket := &model.Ticket{
		UserId:   userId,
		Username: username,
		Title:    req.Title,
		Category: req.Category,
		Priority: req.Priority,
	}
	firstMessage := &model.TicketMessage{
		AuthorId:    userId,
		AuthorName:  username,
		Content:     req.Content,
		Attachments: sanitizeTicketAttachments(req.Attachments),
	}
	if err := model.CreateTicket(ticket, firstMessage); err != nil {
		common.ApiError(c, err)
		return
	}
	notifyAdminsTicketEvent(ticket, "新工单", req.Content)
	common.ApiSuccess(c, ticket)
}

// GetTicketDetail 用户查询自己工单详情（含消息），并清除用户未读。
func GetTicketDetail(c *gin.Context) {
	userId := c.GetInt("id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	ticket, err := model.GetTicketById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if ticket.UserId != userId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权访问该工单"})
		return
	}
	messages, err := model.GetTicketMessages(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	ticket.Messages = messages
	_ = model.MarkTicketRead(id, false)
	ticket.UserUnread = false
	common.ApiSuccess(c, ticket)
}

// ReplyTicket 用户回复自己的工单。
func ReplyTicket(c *gin.Context) {
	userId := c.GetInt("id")
	username := c.GetString("username")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	ticket, err := model.GetTicketById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if ticket.UserId != userId {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权操作该工单"})
		return
	}
	var req ticketReplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if len([]rune(req.Content)) > maxTicketContentRunes {
		common.ApiErrorMsg(c, "回复内容过长")
		return
	}
	msg := &model.TicketMessage{
		AuthorId:    userId,
		AuthorName:  username,
		Content:     req.Content,
		Attachments: sanitizeTicketAttachments(req.Attachments),
	}
	updated, err := model.AddTicketReply(id, msg, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	notifyAdminsTicketEvent(updated, "工单新回复", req.Content)
	common.ApiSuccess(c, updated)
}

// CloseTicket 用户关闭自己的工单。
func CloseTicket(c *gin.Context) {
	userId := c.GetInt("id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.CloseTicket(id, userId, false); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": id})
}

// ---------------- Admin ----------------

// GetAllTickets 管理端分页查询工单（?status=&category=&priority=&keyword=）。
func GetAllTickets(c *gin.Context) {
	status := c.Query("status")
	category := c.Query("category")
	priority := c.Query("priority")
	keyword := strings.TrimSpace(c.Query("keyword"))
	pageInfo := common.GetPageQuery(c)
	tickets, total, err := model.GetAllTickets(status, category, priority, keyword, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tickets)
	common.ApiSuccess(c, pageInfo)
}

// GetTicketStats 管理端各状态工单数量统计。
func GetTicketStats(c *gin.Context) {
	counts, err := model.GetTicketStatusCounts()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, counts)
}

// AdminGetTicketDetail 管理端查询任意工单详情，并清除管理员未读。
func AdminGetTicketDetail(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	ticket, err := model.GetTicketById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	messages, err := model.GetTicketMessages(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	ticket.Messages = messages
	_ = model.MarkTicketRead(id, true)
	ticket.AdminUnread = false
	common.ApiSuccess(c, ticket)
}

// AdminReplyTicket 管理员回复工单，并通知用户。
func AdminReplyTicket(c *gin.Context) {
	adminId := c.GetInt("id")
	adminName := c.GetString("username")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	var req ticketReplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if len([]rune(req.Content)) > maxTicketContentRunes {
		common.ApiErrorMsg(c, "回复内容过长")
		return
	}
	msg := &model.TicketMessage{
		AuthorId:    adminId,
		AuthorName:  adminName,
		Content:     req.Content,
		Attachments: sanitizeTicketAttachments(req.Attachments),
	}
	updated, err := model.AddTicketReply(id, msg, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	notifyUserTicketReply(updated, req.Content)
	common.ApiSuccess(c, updated)
}

func AdminUpdateTicketStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.UpdateTicketStatus(id, strings.TrimSpace(req.Status)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": id, "status": req.Status})
}

func AdminUpdateTicketPriority(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	var req struct {
		Priority string `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	if err := model.UpdateTicketPriority(id, strings.TrimSpace(req.Priority)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": id, "priority": req.Priority})
}

// ---------------- notifications ----------------

func notifyAsync(fn func()) {
	go func() {
		defer func() { _ = recover() }()
		fn()
	}()
}

func ticketContentSummary(content string) string {
	content = strings.TrimSpace(content)
	runes := []rune(content)
	if len(runes) > 120 {
		return string(runes[:120]) + "..."
	}
	return content
}

// notifyAdminsTicketEvent 用户侧动作（新建/回复）通知管理员：企业微信群机器人 + Root 用户消息。
func notifyAdminsTicketEvent(ticket *model.Ticket, event string, content string) {
	if ticket == nil {
		return
	}
	subject := fmt.Sprintf("[工单] %s #%s", event, ticket.TicketNo)
	body := fmt.Sprintf("%s\n工单号: %s\n用户: %s\n标题: %s\n内容: %s",
		event, ticket.TicketNo, ticket.Username, ticket.Title, ticketContentSummary(content))
	notifyAsync(func() {
		webhook := error_alert_setting.GetSetting().WecomWebhookUrl
		if webhook != "" {
			md := fmt.Sprintf("### %s\n> 工单号: %s\n> 用户: %s\n> 标题: %s\n\n%s",
				event, ticket.TicketNo, ticket.Username, ticket.Title, ticketContentSummary(content))
			if err := service.SendWecomBotMarkdown(webhook, md); err != nil {
				common.SysLog(fmt.Sprintf("ticket wecom notify failed: %s", err.Error()))
			}
		}
		service.NotifyRootUser(dto.NotifyTypeChannelUpdate, subject, body)
	})
}

// notifyUserTicketReply 管理员回复后通知用户（按用户通知渠道设置）。
func notifyUserTicketReply(ticket *model.Ticket, content string) {
	if ticket == nil {
		return
	}
	notifyAsync(func() {
		user, err := model.GetUserById(ticket.UserId, false)
		if err != nil {
			return
		}
		subject := fmt.Sprintf("工单 #%s 有新回复", ticket.TicketNo)
		body := fmt.Sprintf("您的工单「%s」有新回复：\n%s", ticket.Title, ticketContentSummary(content))
		if err := service.NotifyUser(user.Id, user.Email, user.GetSetting(),
			dto.NewNotify("ticket_reply", subject, body, nil)); err != nil {
			common.SysLog(fmt.Sprintf("ticket user notify failed: %s", err.Error()))
		}
		model.RecordLog(ticket.UserId, model.LogTypeSystem, fmt.Sprintf("工单 #%s 有新回复", ticket.TicketNo))
	})
}
