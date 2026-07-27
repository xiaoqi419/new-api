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
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/identity_verify_setting"

	"github.com/gin-gonic/gin"
)

// maxIdentityGrantQuota 单一身份类型可配置/发放的额度上限，防止数值溢出 int32 额度列。
const maxIdentityGrantQuota = 2000000000

const maxIdentityProofBytes = 10 * 1024 * 1024

var allowedIdentityProofExts = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".pdf":  true,
}

// identityProofDir 身份证明材料本地存储目录，可用环境变量覆盖。
func identityProofDir() string {
	if dir := os.Getenv("IDENTITY_PROOF_DIR"); dir != "" {
		return dir
	}
	return "./data/identity_proofs"
}

// GetIdentityVerifyTypes 返回身份认证开关及当前开放申请的身份类型（用户提交表单用）。
func GetIdentityVerifyTypes(c *gin.Context) {
	setting := identity_verify_setting.GetSetting()
	if !setting.Enabled {
		common.ApiSuccess(c, gin.H{"enabled": false, "types": []any{}})
		return
	}
	common.ApiSuccess(c, gin.H{"enabled": true, "types": identity_verify_setting.GetEnabledTypes()})
}

// SubmitIdentityVerification 用户提交身份认证申请（multipart：type_key + 资料 + 证明文件）。
func SubmitIdentityVerification(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		common.ApiErrorMsg(c, "用户未登录")
		return
	}
	setting := identity_verify_setting.GetSetting()
	if !setting.Enabled {
		common.ApiErrorMsg(c, "身份认证功能未开启")
		return
	}

	typeKey := strings.TrimSpace(c.PostForm("type_key"))
	idType, ok := identity_verify_setting.GetTypeByKey(typeKey)
	if !ok || !idType.Enabled {
		common.ApiErrorMsg(c, "身份类型不存在或未开放")
		return
	}

	realName := strings.TrimSpace(c.PostForm("real_name"))
	if realName == "" {
		common.ApiErrorMsg(c, "请填写真实姓名")
		return
	}
	org := strings.TrimSpace(c.PostForm("org"))
	extra := strings.TrimSpace(c.PostForm("extra"))

	active, err := model.HasActiveIdentityVerification(userId, typeKey)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if active {
		common.ApiErrorMsg(c, "你已提交或已通过该身份认证，请勿重复申请")
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "请上传证明材料")
		return
	}
	if fileHeader.Size > maxIdentityProofBytes {
		common.ApiErrorMsg(c, "文件大小不能超过 10MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedIdentityProofExts[ext] {
		common.ApiErrorMsg(c, "仅支持 JPG/PNG/WEBP/PDF 文件")
		return
	}

	dir := identityProofDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		common.ApiError(c, err)
		return
	}
	fileName := fmt.Sprintf("identity_%d_%d%s", userId, time.Now().UnixNano(), ext)
	fullPath := filepath.Join(dir, fileName)
	if err := c.SaveUploadedFile(fileHeader, fullPath); err != nil {
		common.ApiError(c, err)
		return
	}

	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	record := &model.IdentityVerification{
		UserId:      userId,
		Username:    user.Username,
		TypeKey:     idType.Key,
		TypeName:    idType.Name,
		RealName:    realName,
		Org:         org,
		Extra:       extra,
		ProofFile:   fileName,
		Status:      model.IdentityVerificationStatusPending,
		CreatedTime: time.Now().Unix(),
	}
	if err := record.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, record)
}

// GetSelfIdentityVerifications 用户查看本人身份认证记录。
func GetSelfIdentityVerifications(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	list, total, err := model.GetUserIdentityVerifications(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(list)
	common.ApiSuccess(c, pageInfo)
}

// GetAllIdentityVerifications 管理员分页查询，可按状态（缺省全部）、类型筛选。
func GetAllIdentityVerifications(c *gin.Context) {
	status := -1
	if s := c.Query("status"); s != "" {
		if v, err := strconv.Atoi(s); err == nil {
			status = v
		}
	}
	typeKey := strings.TrimSpace(c.Query("type_key"))
	pageInfo := common.GetPageQuery(c)
	list, total, err := model.GetAllIdentityVerifications(status, typeKey, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(list)
	common.ApiSuccess(c, pageInfo)
}

// ApproveIdentityVerification 管理员审核通过并按最新后台配置自动发放额度。
func ApproveIdentityVerification(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	record, err := model.GetIdentityVerificationById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if record.Status != model.IdentityVerificationStatusPending {
		common.ApiErrorMsg(c, "该申请已被处理")
		return
	}

	quota := 0
	if idType, ok := identity_verify_setting.GetTypeByKey(record.TypeKey); ok {
		quota = idType.Quota
	}
	if quota < 0 {
		quota = 0
	}
	if quota > maxIdentityGrantQuota {
		quota = maxIdentityGrantQuota
	}

	adminId := c.GetInt("id")
	updated, err := model.ApproveIdentityVerification(id, quota, adminId, time.Now().Unix())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if quota > 0 {
		model.RecordLog(updated.UserId, model.LogTypeSystem,
			fmt.Sprintf("身份认证「%s」审核通过，发放额度 %s", updated.TypeName, logger.LogQuota(quota)))
	} else {
		model.RecordLog(updated.UserId, model.LogTypeSystem,
			fmt.Sprintf("身份认证「%s」审核通过", updated.TypeName))
	}
	common.ApiSuccess(c, updated)
}

// RejectIdentityVerification 管理员驳回身份认证申请。
func RejectIdentityVerification(c *gin.Context) {
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
	adminId := c.GetInt("id")
	updated, err := model.RejectIdentityVerification(id, strings.TrimSpace(req.Reason), adminId, time.Now().Unix())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, updated)
}

// DownloadIdentityProof 查看证明材料，用户仅可查看本人，管理员可查看全部。图片/PDF 内联展示。
func DownloadIdentityProof(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	record, err := model.GetIdentityVerificationById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userId := c.GetInt("id")
	role := c.GetInt("role")
	if record.UserId != userId && role < common.RoleAdminUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "无权查看此证明材料"})
		return
	}
	if record.ProofFile == "" {
		common.ApiErrorMsg(c, "证明材料不存在")
		return
	}
	// 防路径穿越：仅使用文件名部分拼接存储目录。
	safeName := filepath.Base(record.ProofFile)
	fullPath := filepath.Join(identityProofDir(), safeName)
	if _, err := os.Stat(fullPath); err != nil {
		common.ApiErrorMsg(c, "证明材料文件不存在")
		return
	}
	c.File(fullPath)
}

// GetIdentityVerifyConfig 管理员读取身份认证配置（开关 + 类型列表）。
func GetIdentityVerifyConfig(c *gin.Context) {
	common.ApiSuccess(c, identity_verify_setting.GetSetting())
}

// SaveIdentityVerifyConfig 管理员保存身份认证配置，持久化后自动热更新。
func SaveIdentityVerifyConfig(c *gin.Context) {
	var req identity_verify_setting.IdentityVerifySetting
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	seen := make(map[string]bool)
	for i := range req.Types {
		req.Types[i].Key = strings.TrimSpace(req.Types[i].Key)
		req.Types[i].Name = strings.TrimSpace(req.Types[i].Name)
		if req.Types[i].Key == "" || req.Types[i].Name == "" {
			common.ApiErrorMsg(c, "身份类型的标识和名称不能为空")
			return
		}
		if seen[req.Types[i].Key] {
			common.ApiErrorMsg(c, "身份类型标识重复: "+req.Types[i].Key)
			return
		}
		seen[req.Types[i].Key] = true
		if req.Types[i].Quota < 0 {
			req.Types[i].Quota = 0
		}
		if req.Types[i].Quota > maxIdentityGrantQuota {
			req.Types[i].Quota = maxIdentityGrantQuota
		}
	}

	typesJSON, err := common.Marshal(req.Types)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("identity_verify_setting.enabled", strconv.FormatBool(req.Enabled)); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("identity_verify_setting.types", string(typesJSON)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, identity_verify_setting.GetSetting())
}
