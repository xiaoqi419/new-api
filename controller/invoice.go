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

	"github.com/gin-gonic/gin"
)

// invoiceStorageDir 发票 PDF 本地存储目录，可用环境变量覆盖。
func invoiceStorageDir() string {
	if dir := os.Getenv("INVOICE_DIR"); dir != "" {
		return dir
	}
	return "./data/invoices"
}

// eligibleOrder 可开票订单的对外表示。
type eligibleOrder struct {
	Id           int     `json:"id"`
	TradeNo      string  `json:"trade_no"`
	Money        float64 `json:"money"`
	CompleteTime int64   `json:"complete_time"`
	PaymentMethod string `json:"payment_method"`
}

// GetEligibleOrders 返回用户已支付成功且未被有效发票占用的充值订单，供申请发票时选择。
func GetEligibleOrders(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		common.ApiErrorMsg(c, "用户未登录")
		return
	}
	topUps, err := model.GetSuccessTopUpsByUser(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	occupied, err := model.GetOccupiedOrderIds(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	orders := make([]eligibleOrder, 0, len(topUps))
	for _, t := range topUps {
		if occupied[t.Id] {
			continue
		}
		orders = append(orders, eligibleOrder{
			Id:            t.Id,
			TradeNo:       t.TradeNo,
			Money:         t.Money,
			CompleteTime:  t.CompleteTime,
			PaymentMethod: t.PaymentMethod,
		})
	}
	common.ApiSuccess(c, orders)
}

// SubmitInvoiceRequest 用户提交开票申请，必须关联已支付且未开票的充值订单，金额取所选订单合计。
func SubmitInvoiceRequest(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		common.ApiErrorMsg(c, "用户未登录")
		return
	}

	var req struct {
		OrderIds  []int  `json:"order_ids"`
		TitleType int    `json:"title_type"`
		Title     string `json:"title"`
		TaxNumber string `json:"tax_number"`
		Email     string `json:"email"`
		Remark    string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		common.ApiErrorMsg(c, "发票抬头不能为空")
		return
	}
	if len(req.OrderIds) == 0 {
		common.ApiErrorMsg(c, "请至少选择一个已支付订单")
		return
	}
	if req.TitleType == model.InvoiceTitleTypeCompany && strings.TrimSpace(req.TaxNumber) == "" {
		common.ApiErrorMsg(c, "企业抬头需填写税号")
		return
	}

	// 校验所选订单：均属于本人、已支付成功、未被其它有效发票占用；金额取合计。
	topUps, err := model.GetSuccessTopUpsByUser(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	successById := make(map[int]float64, len(topUps))
	for _, t := range topUps {
		successById[t.Id] = t.Money
	}
	occupied, err := model.GetOccupiedOrderIds(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	seen := make(map[int]bool)
	totalMoney := 0.0
	orderIdStrs := make([]string, 0, len(req.OrderIds))
	for _, oid := range req.OrderIds {
		if seen[oid] {
			continue
		}
		seen[oid] = true
		money, ok := successById[oid]
		if !ok {
			common.ApiErrorMsg(c, fmt.Sprintf("订单 #%d 不存在或未支付成功", oid))
			return
		}
		if occupied[oid] {
			common.ApiErrorMsg(c, fmt.Sprintf("订单 #%d 已申请过开票", oid))
			return
		}
		totalMoney += money
		orderIdStrs = append(orderIdStrs, strconv.Itoa(oid))
	}

	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	invoice := &model.InvoiceRequest{
		UserId:      userId,
		Username:    user.Username,
		Amount:      fmt.Sprintf("%.2f", totalMoney),
		OrderIds:    strings.Join(orderIdStrs, ","),
		TitleType:   req.TitleType,
		Title:       req.Title,
		TaxNumber:   strings.TrimSpace(req.TaxNumber),
		Email:       strings.TrimSpace(req.Email),
		Remark:      strings.TrimSpace(req.Remark),
		Status:      model.InvoiceStatusPending,
		CreatedTime: time.Now().Unix(),
	}
	if err := invoice.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, invoice)
}

// GetSelfInvoices 用户查看本人发票申请记录。
func GetSelfInvoices(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	invoices, total, err := model.GetUserInvoices(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(invoices)
	common.ApiSuccess(c, pageInfo)
}

// GetAllInvoices 管理员分页查询所有发票申请，可按状态筛选（status 缺省表示全部）。
func GetAllInvoices(c *gin.Context) {
	status := -1
	if s := c.Query("status"); s != "" {
		if v, err := strconv.Atoi(s); err == nil {
			status = v
		}
	}
	pageInfo := common.GetPageQuery(c)
	invoices, total, err := model.GetAllInvoices(status, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(invoices)
	common.ApiSuccess(c, pageInfo)
}

// IssueInvoice 管理员上传 PDF 并标记发票已开具。
func IssueInvoice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	invoice, err := model.GetInvoiceById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "请上传发票 PDF 文件")
		return
	}
	if fileHeader.Size > 10*1024*1024 {
		common.ApiErrorMsg(c, "文件大小不能超过 10MB")
		return
	}
	if strings.ToLower(filepath.Ext(fileHeader.Filename)) != ".pdf" {
		common.ApiErrorMsg(c, "仅支持 PDF 文件")
		return
	}

	dir := invoiceStorageDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		common.ApiError(c, err)
		return
	}
	fileName := fmt.Sprintf("invoice_%d_%d.pdf", invoice.Id, time.Now().Unix())
	fullPath := filepath.Join(dir, fileName)
	if err := c.SaveUploadedFile(fileHeader, fullPath); err != nil {
		common.ApiError(c, err)
		return
	}

	invoice.InvoiceFile = fileName
	invoice.Status = model.InvoiceStatusIssued
	invoice.RejectReason = ""
	invoice.ProcessedTime = time.Now().Unix()
	invoice.ProcessedBy = c.GetInt("id")
	if err := invoice.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, invoice)
}

// RejectInvoice 管理员驳回发票申请。
func RejectInvoice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	invoice, err := model.GetInvoiceById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	invoice.Status = model.InvoiceStatusRejected
	invoice.RejectReason = strings.TrimSpace(req.Reason)
	invoice.ProcessedTime = time.Now().Unix()
	invoice.ProcessedBy = c.GetInt("id")
	if err := invoice.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, invoice)
}

// DownloadInvoice 下载发票 PDF。用户仅可下载本人发票，管理员可下载全部。
func DownloadInvoice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	invoice, err := model.GetInvoiceById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	userId := c.GetInt("id")
	role := c.GetInt("role")
	if invoice.UserId != userId && role < common.RoleAdminUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权下载此发票"})
		return
	}
	if invoice.Status != model.InvoiceStatusIssued || invoice.InvoiceFile == "" {
		common.ApiErrorMsg(c, "发票尚未开具")
		return
	}

	// 防路径穿越：仅使用文件名部分拼接存储目录。
	safeName := filepath.Base(invoice.InvoiceFile)
	fullPath := filepath.Join(invoiceStorageDir(), safeName)
	if _, err := os.Stat(fullPath); err != nil {
		common.ApiErrorMsg(c, "发票文件不存在")
		return
	}
	c.FileAttachment(fullPath, fmt.Sprintf("invoice_%d.pdf", invoice.Id))
}
