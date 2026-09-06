package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	IdentityVerificationStatusPending  = 0 // 待审核
	IdentityVerificationStatusApproved = 1 // 已通过
	IdentityVerificationStatusRejected = 2 // 已驳回
)

// IdentityVerification 身份认证申请（教师/医疗/大学生等）。用户提交证明材料，
// 管理员审核通过后按后台配置自动发放额度。
type IdentityVerification struct {
	Id            int    `json:"id"`
	UserId        int    `json:"user_id" gorm:"index"`
	Username      string `json:"username" gorm:"type:varchar(64)"`
	TypeKey       string `json:"type_key" gorm:"type:varchar(64);index"`
	TypeName      string `json:"type_name" gorm:"type:varchar(64)"`
	RealName      string `json:"real_name" gorm:"type:varchar(64)"`
	Org           string `json:"org" gorm:"type:varchar(255)"`
	Extra         string `json:"extra" gorm:"type:varchar(255)"`
	ProofFile     string `json:"proof_file" gorm:"type:varchar(255)"`
	Status        int    `json:"status" gorm:"index"`
	GrantedQuota  int    `json:"granted_quota"`
	RejectReason  string `json:"reject_reason" gorm:"type:varchar(500)"`
	CreatedTime   int64  `json:"created_time"`
	ProcessedTime int64  `json:"processed_time"`
	ProcessedBy   int    `json:"processed_by"`
}

func (v *IdentityVerification) Insert() error {
	return DB.Create(v).Error
}

func GetIdentityVerificationById(id int) (*IdentityVerification, error) {
	if id == 0 {
		return nil, errors.New("id 为空")
	}
	var v IdentityVerification
	if err := DB.First(&v, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &v, nil
}

// HasActiveIdentityVerification 判断用户在某身份类型上是否已有「待审核/已通过」记录（用于去重）。
func HasActiveIdentityVerification(userId int, typeKey string) (bool, error) {
	var count int64
	err := DB.Model(&IdentityVerification{}).
		Where("user_id = ? AND type_key = ? AND status IN (?)", userId, typeKey,
			[]int{IdentityVerificationStatusPending, IdentityVerificationStatusApproved}).
		Count(&count).Error
	return count > 0, err
}

func GetUserIdentityVerifications(userId int, startIdx int, num int) ([]*IdentityVerification, int64, error) {
	var total int64
	if err := DB.Model(&IdentityVerification{}).Where("user_id = ?", userId).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []*IdentityVerification
	err := DB.Where("user_id = ?", userId).Order("id desc").Limit(num).Offset(startIdx).Find(&list).Error
	return list, total, err
}

// GetAllIdentityVerifications 管理员分页查询，status < 0 不过滤状态，typeKey 为空不过滤类型。
func GetAllIdentityVerifications(status int, typeKey string, startIdx int, num int) ([]*IdentityVerification, int64, error) {
	build := func() *gorm.DB {
		q := DB.Model(&IdentityVerification{})
		if status >= 0 {
			q = q.Where("status = ?", status)
		}
		if typeKey != "" {
			q = q.Where("type_key = ?", typeKey)
		}
		return q
	}
	var total int64
	if err := build().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []*IdentityVerification
	err := build().Order("id desc").Limit(num).Offset(startIdx).Find(&list).Error
	return list, total, err
}

// ApproveIdentityVerification 在事务内把待审核记录置为通过并发放额度，避免并发/重复发放。
// 额度增加与状态变更原子提交；提交后再同步 Redis 缓存。
func ApproveIdentityVerification(id int, quota int, adminId int, processedTime int64) (*IdentityVerification, error) {
	var result IdentityVerification
	err := DB.Transaction(func(tx *gorm.DB) error {
		var v IdentityVerification
		if err := lockForUpdate(tx).First(&v, "id = ?", id).Error; err != nil {
			return err
		}
		if v.Status != IdentityVerificationStatusPending {
			return errors.New("该申请已被处理")
		}
		if err := tx.Model(&IdentityVerification{}).Where("id = ?", id).Updates(map[string]any{
			"status":         IdentityVerificationStatusApproved,
			"granted_quota":  quota,
			"reject_reason":  "",
			"processed_by":   adminId,
			"processed_time": processedTime,
		}).Error; err != nil {
			return err
		}
		if quota > 0 {
			if err := creditTopUpQuota(tx, v.UserId, quota, nil); err != nil {
				return err
			}
		}
		v.Status = IdentityVerificationStatusApproved
		v.GrantedQuota = quota
		v.RejectReason = ""
		v.ProcessedBy = adminId
		v.ProcessedTime = processedTime
		result = v
		return nil
	})
	if err != nil {
		return nil, err
	}
	if quota > 0 && common.RedisEnabled {
		if cacheErr := cacheIncrUserQuota(result.UserId, int64(quota)); cacheErr != nil {
			common.SysError("failed to sync user quota cache after identity verification approval: " + cacheErr.Error())
		}
	}
	return &result, nil
}

// RejectIdentityVerification 驳回待审核申请，记录原因；驳回后用户可重新提交。
func RejectIdentityVerification(id int, reason string, adminId int, processedTime int64) (*IdentityVerification, error) {
	v, err := GetIdentityVerificationById(id)
	if err != nil {
		return nil, err
	}
	if v.Status != IdentityVerificationStatusPending {
		return nil, errors.New("该申请已被处理")
	}
	if err := DB.Model(&IdentityVerification{}).Where("id = ?", id).Updates(map[string]any{
		"status":         IdentityVerificationStatusRejected,
		"reject_reason":  reason,
		"processed_by":   adminId,
		"processed_time": processedTime,
	}).Error; err != nil {
		return nil, err
	}
	v.Status = IdentityVerificationStatusRejected
	v.RejectReason = reason
	v.ProcessedBy = adminId
	v.ProcessedTime = processedTime
	return v, nil
}
