package controller

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// precheckAgentWalletForUser 在下单前校验当前用户所属代理的钱包是否够本次充值结算。
// 返回 ok=false 时附带面向用户的提示。fail-open：查不到用户/代理时放行，由结算挂单兜底。
func precheckAgentWalletForUser(c *gin.Context, projectedQuota int) (ok bool, msg string) {
	if projectedQuota <= 0 {
		return true, ""
	}
	userId := c.GetInt("id")
	if userId <= 0 {
		return true, ""
	}
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil || user.AgentId <= 0 {
		return true, ""
	}
	enough, err := model.PreCheckAgentWalletForTopup(user.AgentId, projectedQuota)
	if err != nil {
		return false, err.Error()
	}
	if !enough {
		return false, "当前代理额度不足，暂时无法充值，请联系代理充值后再试"
	}
	return true, ""
}

// ---- 平台管理员：代理商管理 ----

func AdminGetAllAgents(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	agents, total, err := model.GetAllAgents(pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(agents)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetAgent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	agent, err := model.GetAgentById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, agent)
}

type createAgentRequest struct {
	OwnerUserId int     `json:"owner_user_id"`
	Name        string  `json:"name"`
	CostRatio   float64 `json:"cost_ratio"`
	Status      int     `json:"status"`
	Remark      string  `json:"remark"`
}

func AdminCreateAgent(c *gin.Context) {
	var req createAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Name == "" {
		common.ApiErrorMsg(c, "代理名称不能为空")
		return
	}
	costRatio := req.CostRatio
	if costRatio <= 0 {
		costRatio = 1
	}
	status := req.Status
	if status != model.AgentStatusActive && status != model.AgentStatusPending && status != model.AgentStatusDisabled {
		status = model.AgentStatusActive
	}
	agent, err := model.CreateAgentForOwner(req.OwnerUserId, req.Name, costRatio, status, req.Remark)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, agent)
}

type updateAgentRequest struct {
	Id        int      `json:"id"`
	Name      string   `json:"name"`
	CostRatio *float64 `json:"cost_ratio"`
	Status    *int     `json:"status"`
	Remark    string   `json:"remark"`
}

func AdminUpdateAgent(c *gin.Context) {
	var req updateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	agent, err := model.GetAgentById(req.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Name != "" {
		agent.Name = req.Name
	}
	agent.Remark = req.Remark
	if req.CostRatio != nil {
		if *req.CostRatio < 0 {
			common.ApiErrorMsg(c, "结算折扣不能为负数")
			return
		}
		agent.CostRatio = *req.CostRatio
	}
	if req.Status != nil {
		agent.Status = *req.Status
	}
	if err := agent.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, agent)
}

type agentWalletAdjustRequest struct {
	Delta  int    `json:"delta"` // 额度单位：正=预充/回补，负=扣减
	Type   string `json:"type"`  // prepay / adjust / refund
	Remark string `json:"remark"`
}

func AdminAdjustAgentWallet(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req agentWalletAdjustRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Delta == 0 {
		common.ApiErrorMsg(c, "调整额度不能为 0")
		return
	}
	ledgerType := req.Type
	switch ledgerType {
	case model.AgentLedgerTypePrepay, model.AgentLedgerTypeAdjust, model.AgentLedgerTypeRefund:
	default:
		ledgerType = model.AgentLedgerTypeAdjust
	}
	if err := model.AdjustAgentWallet(id, req.Delta, ledgerType, "", 0, req.Remark); err != nil {
		common.ApiError(c, err)
		return
	}
	agent, err := model.GetAgentById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, agent)
}

func AdminApproveAgent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.ActivateAgent(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminDisableAgent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateAgentStatus(id, model.AgentStatusDisabled); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminGetAgentLedgers(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo := common.GetPageQuery(c)
	ledgers, total, err := model.GetAgentLedgers(id, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(ledgers)
	common.ApiSuccess(c, pageInfo)
}

// ---- 前台申请成为代理 ----

type agentApplyRequest struct {
	Name         string `json:"name"`
	PrepayAmount int64  `json:"prepay_amount"`
}

// AgentApplyStatus 返回当前登录用户的代理申请/开通状态，供前台申请页展示。
func AgentApplyStatus(c *gin.Context) {
	userId := c.GetInt("id")
	agent, err := model.GetAgentByOwnerUserId(userId)
	if err != nil || agent == nil {
		common.ApiSuccess(c, gin.H{"applied": false, "auto_approve": common.AgentAutoApproveEnabled})
		return
	}
	common.ApiSuccess(c, gin.H{
		"applied":      true,
		"auto_approve": common.AgentAutoApproveEnabled,
		"agent": gin.H{
			"id":           agent.Id,
			"name":         agent.Name,
			"status":       agent.Status,
			"wallet_quota": agent.WalletQuota,
			"cost_ratio":   agent.CostRatio,
		},
	})
}

// AgentApply 平台普通用户(agent_id=0)提交成为代理的申请：创建 pending 代理记录。
// 预充与激活分离：申请后由代理控制台发起预充；开启 AgentAutoApproveEnabled 时预充到账即自动激活，
// 否则由管理员审批激活(S6)。
func AgentApply(c *gin.Context) {
	userId := c.GetInt("id")
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil {
		common.ApiErrorMsg(c, "用户不存在")
		return
	}
	if user.AgentId != 0 {
		common.ApiErrorMsg(c, "终端用户不能申请成为代理")
		return
	}
	if existing, _ := model.GetAgentByOwnerUserId(userId); existing != nil {
		common.ApiErrorMsg(c, "你已提交申请或已经是代理")
		return
	}
	var req agentApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = user.Username
	}
	remark := ""
	if req.PrepayAmount > 0 {
		remark = fmt.Sprintf("期望预充: %d", req.PrepayAmount)
	}
	agent, err := model.CreateAgentApplication(userId, name, remark)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, gin.H{
		"id":           agent.Id,
		"name":         agent.Name,
		"status":       agent.Status,
		"auto_approve": common.AgentAutoApproveEnabled,
	})
}
