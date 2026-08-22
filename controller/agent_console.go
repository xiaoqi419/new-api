package controller

import (
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func consoleAgentId(c *gin.Context) int {
	return common.GetContextKeyInt(c, constant.ContextKeySelfAgentId)
}

// CheckTLSDomain 供反向代理(如 Caddy on-demand TLS 的 ask)校验域名是否为已验证的代理白标域名。
// 命中返回 200，否则 404，避免为任意域名签发证书造成滥用。公共接口，无需鉴权。
func CheckTLSDomain(c *gin.Context) {
	host := c.Query("domain")
	if host == "" {
		host = c.Request.Host
	}
	if model.ResolveAgentIdByHost(host) > 0 {
		c.String(http.StatusOK, "ok")
		return
	}
	c.String(http.StatusNotFound, "unknown domain")
}

// AgentConsoleGetSelf 返回当前代理的基础信息(钱包/折扣/倍率/品牌项)。
func AgentConsoleGetSelf(c *gin.Context) {
	agentId := consoleAgentId(c)
	agent, err := model.GetAgentById(agentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	options, err := model.GetAgentOptions(agentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"id":                agent.Id,
		"name":              agent.Name,
		"status":            agent.Status,
		"wallet_quota":      agent.WalletQuota,
		"cost_ratio":        agent.CostRatio,
		"sell_group_ratios": agent.SellGroupRatios,
		"options":           options,
		"quota_per_unit":    common.QuotaPerUnit,
	})
}

// ---- 白标域名 ----

func AgentConsoleListDomains(c *gin.Context) {
	agentId := consoleAgentId(c)
	domains, err := model.GetAgentDomains(agentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"domains":       domains,
		"verify_txt":    model.DomainVerifyTXTName,
		"verify_prefix": model.DomainVerifyTXTName,
	})
}

type addAgentDomainRequest struct {
	Domain string `json:"domain"`
}

func AgentConsoleAddDomain(c *gin.Context) {
	agentId := consoleAgentId(c)
	var req addAgentDomainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if strings.TrimSpace(req.Domain) == "" {
		common.ApiErrorMsg(c, "域名不能为空")
		return
	}
	record, err := model.AddAgentDomain(agentId, req.Domain)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, record)
}

// AgentConsoleVerifyDomain 通过 DNS TXT 记录校验域名归属：查询 _newapi-verify.<domain> 是否含 VerifyToken。
func AgentConsoleVerifyDomain(c *gin.Context) {
	agentId := consoleAgentId(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	domain, err := model.GetAgentDomainByIdForAgent(id, agentId)
	if err != nil {
		common.ApiErrorMsg(c, "域名不存在")
		return
	}
	if domain.Verified {
		common.ApiSuccess(c, domain)
		return
	}
	lookupHost := model.DomainVerifyTXTName + "." + domain.Domain
	txts, lookupErr := net.LookupTXT(lookupHost)
	matched := false
	for _, txt := range txts {
		if strings.TrimSpace(txt) == domain.VerifyToken {
			matched = true
			break
		}
	}
	if !matched {
		msg := "未找到匹配的 TXT 记录，请在 " + lookupHost + " 添加 TXT 值：" + domain.VerifyToken
		if lookupErr != nil {
			msg = "DNS 查询失败(" + lookupErr.Error() + ")，请确认已在 " + lookupHost + " 添加 TXT 值：" + domain.VerifyToken
		}
		common.ApiErrorMsg(c, msg)
		return
	}
	if err := model.SetAgentDomainVerified(domain.Id, true); err != nil {
		common.ApiError(c, err)
		return
	}
	domain.Verified = true
	common.ApiSuccess(c, domain)
}

func AgentConsoleDeleteDomain(c *gin.Context) {
	agentId := consoleAgentId(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteAgentDomain(id, agentId); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ---- 品牌项 ----

func AgentConsoleGetOptions(c *gin.Context) {
	agentId := consoleAgentId(c)
	options, err := model.GetAgentOptions(agentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, options)
}

type updateAgentOptionsRequest struct {
	Options map[string]string `json:"options"`
}

func AgentConsoleUpdateOptions(c *gin.Context) {
	agentId := consoleAgentId(c)
	var req updateAgentOptionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	for key, value := range req.Options {
		if !model.AgentBrandableKeys[key] {
			common.ApiErrorMsg(c, "不支持的品牌键: "+key)
			return
		}
		if err := model.SetAgentOption(agentId, key, value); err != nil {
			common.ApiErrorMsg(c, err.Error())
			return
		}
	}
	options, err := model.GetAgentOptions(agentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, options)
}

// ---- 自定义分组倍率 ----

func AgentConsoleGetRatios(c *gin.Context) {
	agentId := consoleAgentId(c)
	agent, err := model.GetAgentById(agentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"sell_group_ratios": agent.SellGroupRatios})
}

type updateAgentRatiosRequest struct {
	Ratios map[string]float64 `json:"ratios"`
}

func AgentConsoleUpdateRatios(c *gin.Context) {
	agentId := consoleAgentId(c)
	var req updateAgentRatiosRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	for group, ratio := range req.Ratios {
		if ratio <= 0 {
			common.ApiErrorMsg(c, "分组 "+group+" 的倍率必须大于 0")
			return
		}
	}
	ratiosJSON, err := common.Marshal(req.Ratios)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateAgentSellGroupRatios(agentId, string(ratiosJSON)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"sell_group_ratios": string(ratiosJSON)})
}

// ---- 钱包流水 & 终端用户 ----

func AgentConsoleGetLedgers(c *gin.Context) {
	agentId := consoleAgentId(c)
	pageInfo := common.GetPageQuery(c)
	ledgers, total, err := model.GetAgentLedgers(agentId, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(ledgers)
	common.ApiSuccess(c, pageInfo)
}

func AgentConsoleListUsers(c *gin.Context) {
	agentId := consoleAgentId(c)
	pageInfo := common.GetPageQuery(c)
	users, total, err := model.GetAgentTerminalUsers(agentId, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(users)
	common.ApiSuccess(c, pageInfo)
}

// ---- 自有支付配置 & 套餐定价 ----

type agentPaymentConfigView struct {
	Provider  string  `json:"provider"`
	Enabled   bool    `json:"enabled"`
	UnitPrice float64 `json:"unit_price"`
	MinTopup  int     `json:"min_topup"`
	HasCreds  bool    `json:"has_creds"`
}

// AgentConsoleGetPayment 返回代理已配置的自有支付网关(凭据仅返回是否已配置，不回传明文)。
func AgentConsoleGetPayment(c *gin.Context) {
	agentId := consoleAgentId(c)
	configs, err := model.GetAgentPaymentConfigs(agentId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	views := make([]agentPaymentConfigView, 0, len(configs))
	for _, cfg := range configs {
		views = append(views, agentPaymentConfigView{
			Provider:  cfg.Provider,
			Enabled:   cfg.Enabled,
			UnitPrice: cfg.UnitPrice,
			MinTopup:  cfg.MinTopup,
			HasCreds:  cfg.CredsEncrypted != "",
		})
	}
	common.ApiSuccess(c, gin.H{
		"configs":   views,
		"providers": []string{model.AgentPaymentProviderEpay, model.AgentPaymentProviderStripe},
		"cred_keys": gin.H{
			model.AgentPaymentProviderEpay:   model.AgentPaymentCredKeys(model.AgentPaymentProviderEpay),
			model.AgentPaymentProviderStripe: model.AgentPaymentCredKeys(model.AgentPaymentProviderStripe),
		},
	})
}

type updateAgentPaymentRequest struct {
	Provider  string            `json:"provider"`
	Enabled   bool              `json:"enabled"`
	UnitPrice float64           `json:"unit_price"`
	MinTopup  int               `json:"min_topup"`
	Creds     map[string]string `json:"creds"`
}

// AgentConsoleUpdatePayment upsert 一个自有支付网关配置。凭据按白名单过滤后与已有凭据合并再整段加密，
// 空字段保留原值(不覆盖)，实现部分更新且不泄露明文。
func AgentConsoleUpdatePayment(c *gin.Context) {
	agentId := consoleAgentId(c)
	var req updateAgentPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	allowed := model.AgentPaymentCredKeys(req.Provider)
	if allowed == nil {
		common.ApiErrorMsg(c, "不支持的支付网关: "+req.Provider)
		return
	}
	credsJSON := ""
	if len(req.Creds) > 0 {
		merged := map[string]string{}
		if existing, err := model.GetAgentPaymentConfig(agentId, req.Provider); err == nil && existing != nil {
			if m, derr := existing.DecryptCreds(); derr == nil {
				merged = m
			}
		}
		for _, k := range allowed {
			if v, ok := req.Creds[k]; ok && v != "" {
				merged[k] = v
			}
		}
		if len(merged) > 0 {
			b, err := common.Marshal(merged)
			if err != nil {
				common.ApiError(c, err)
				return
			}
			credsJSON = string(b)
		}
	}
	if err := model.SetAgentPaymentConfig(agentId, req.Provider, credsJSON, req.Enabled, req.UnitPrice, req.MinTopup); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	AgentConsoleGetPayment(c)
}
