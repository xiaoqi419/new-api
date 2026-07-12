package model

import (
	"errors"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

const (
	InvoiceStatusPending  = 0 // 待处理
	InvoiceStatusIssued   = 1 // 已开票
	InvoiceStatusRejected = 2 // 已驳回

	InvoiceTitleTypePersonal = 1 // 个人抬头
	InvoiceTitleTypeCompany  = 2 // 企业抬头
)

// InvoiceRequest 发票申请记录。用户提交开票申请，管理员审核后上传 PDF 或驳回。
type InvoiceRequest struct {
	Id            int    `json:"id"`
	UserId        int    `json:"user_id" gorm:"index"`
	Username      string `json:"username" gorm:"type:varchar(64)"`
	Amount        string `json:"amount" gorm:"type:varchar(64)"`  // 申请开票金额（由所选订单金额合计得出）
	OrderIds      string `json:"order_ids" gorm:"type:varchar(500)"` // 关联的已支付充值订单 id，逗号分隔
	TitleType     int    `json:"title_type" gorm:"default:1"`     // 1 个人 2 企业
	Title         string `json:"title" gorm:"type:varchar(255)"` // 发票抬头
	TaxNumber     string `json:"tax_number" gorm:"type:varchar(64)"`
	Email         string `json:"email" gorm:"type:varchar(255)"`
	Remark        string `json:"remark" gorm:"type:varchar(500)"`
	Status        int    `json:"status" gorm:"index;default:0"`
	InvoiceFile   string `json:"invoice_file" gorm:"type:varchar(255)"` // 已开票 PDF 相对路径
	RejectReason  string `json:"reject_reason" gorm:"type:varchar(500)"`
	CreatedTime   int64  `json:"created_time"`
	ProcessedTime int64  `json:"processed_time"`
	ProcessedBy   int    `json:"processed_by"` // 处理管理员 id
}

func (i *InvoiceRequest) Insert() error {
	return DB.Create(i).Error
}

func (i *InvoiceRequest) Update() error {
	return DB.Model(i).Select("*").Updates(i).Error
}

func GetInvoiceById(id int) (*InvoiceRequest, error) {
	if id == 0 {
		return nil, errors.New("id 为空")
	}
	inv := InvoiceRequest{Id: id}
	err := DB.First(&inv, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func GetUserInvoices(userId int, startIdx int, num int) ([]*InvoiceRequest, int64, error) {
	var invoices []*InvoiceRequest
	var total int64
	if err := DB.Model(&InvoiceRequest{}).Where("user_id = ?", userId).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := DB.Where("user_id = ?", userId).Order("id desc").Limit(num).Offset(startIdx).Find(&invoices).Error
	return invoices, total, err
}

// GetAllInvoices 管理员分页查询发票申请，status < 0 表示不过滤状态。
func GetAllInvoices(status int, startIdx int, num int) ([]*InvoiceRequest, int64, error) {
	var invoices []*InvoiceRequest
	var total int64
	query := DB.Model(&InvoiceRequest{})
	if status >= 0 {
		query = query.Where("status = ?", status)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	listQuery := DB.Model(&InvoiceRequest{})
	if status >= 0 {
		listQuery = listQuery.Where("status = ?", status)
	}
	err := listQuery.Order("id desc").Limit(num).Offset(startIdx).Find(&invoices).Error
	return invoices, total, err
}

// GetOccupiedOrderIds 返回该用户已被有效发票（待处理/已开票，驳回不算）占用的充值订单 id 集合。
func GetOccupiedOrderIds(userId int) (map[int]bool, error) {
	var invoices []*InvoiceRequest
	err := DB.Select("order_ids").
		Where("user_id = ? AND status IN ?", userId, []int{InvoiceStatusPending, InvoiceStatusIssued}).
		Find(&invoices).Error
	if err != nil {
		return nil, err
	}
	occupied := make(map[int]bool)
	for _, inv := range invoices {
		for _, idStr := range strings.Split(inv.OrderIds, ",") {
			idStr = strings.TrimSpace(idStr)
			if idStr == "" {
				continue
			}
			if id, convErr := strconv.Atoi(idStr); convErr == nil {
				occupied[id] = true
			}
		}
	}
	return occupied, nil
}

func (i *InvoiceRequest) BeforeCreate(tx *gorm.DB) error {
	if i.TitleType != InvoiceTitleTypeCompany {
		i.TitleType = InvoiceTitleTypePersonal
	}
	return nil
}
