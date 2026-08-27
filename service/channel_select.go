package service

import (
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type RetryParam struct {
	Ctx          *gin.Context
	TokenGroup   string
	ModelName    string
	RequestPath  string
	Retry        *int
	resetNextTry bool
}

func (p *RetryParam) GetRetry() int {
	if p.Retry == nil {
		return 0
	}
	return *p.Retry
}

func (p *RetryParam) SetRetry(retry int) {
	p.Retry = &retry
}

func (p *RetryParam) IncreaseRetry() {
	if p.resetNextTry {
		p.resetNextTry = false
		return
	}
	if p.Retry == nil {
		p.Retry = new(int)
	}
	*p.Retry++
}

func (p *RetryParam) ResetRetryNextTry() {
	p.resetNextTry = true
}

// CacheGetRandomSatisfiedChannel selects from a managed channel failover pool
// before the original API-key group-switch path. Unmanaged groups retain their
// pre-existing selection behavior unchanged.
func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
	if channel, managed, err := selectChannelFailoverPool(param); managed {
		if err != nil {
			return nil, param.TokenGroup, err
		}
		if channel == nil {
			return nil, param.TokenGroup, fmt.Errorf("no eligible channel in managed failover pools for model %s", param.ModelName)
		}
		return channel, param.TokenGroup, nil
	}
	if common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenGroupSwitch) {
		return getGroupSwitchChannel(param)
	}
	channel, err := model.GetRandomSatisfiedChannel(param.TokenGroup, param.ModelName, param.GetRetry(), param.RequestPath)
	if err != nil {
		return nil, param.TokenGroup, err
	}
	return channel, param.TokenGroup, nil
}

// orderedSwitchCandidates retains the original API-key candidate-group logic.
func orderedSwitchCandidates(param *RetryParam, userGroup string) []string {
	raw := common.GetContextKeyStringSlice(param.Ctx, constant.ContextKeyTokenGroupSwitchCandidates)
	if len(raw) == 0 {
		return nil
	}
	usable := GetUserUsableGroups(userGroup)
	seen := make(map[string]bool, len(raw))
	filtered := make([]string, 0, len(raw))
	for _, group := range raw {
		if group == "" || seen[group] {
			continue
		}
		if _, ok := usable[group]; !ok {
			continue
		}
		seen[group] = true
		filtered = append(filtered, group)
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		return GetUserGroupRatio(userGroup, filtered[i]) < GetUserGroupRatio(userGroup, filtered[j])
	})
	return filtered
}

func getGroupSwitchChannel(param *RetryParam) (*model.Channel, string, error) {
	userGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyUserGroup)
	candidates := orderedSwitchCandidates(param, userGroup)
	if len(candidates) < 2 {
		fallbackGroup := param.TokenGroup
		if len(candidates) == 1 {
			fallbackGroup = candidates[0]
		}
		if fallbackGroup == "" {
			fallbackGroup = userGroup
		}
		channel, err := model.GetRandomSatisfiedChannel(fallbackGroup, param.ModelName, param.GetRetry(), param.RequestPath)
		if err != nil {
			return nil, fallbackGroup, err
		}
		common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, fallbackGroup)
		return channel, fallbackGroup, nil
	}

	tokenID := common.GetContextKeyInt(param.Ctx, constant.ContextKeyTokenId)
	sticky := GetStickyGroupSwitch(tokenID, param.ModelName, userGroup)
	startIndex := 0
	if idx, exists := common.GetContextKey(param.Ctx, constant.ContextKeyGroupSwitchIndex); exists {
		if value, ok := idx.(int); ok {
			startIndex = value
		}
	} else if sticky != "" {
		for i, group := range candidates {
			if group == sticky {
				startIndex = i
				break
			}
		}
	}

	failCount := common.GetContextKeyInt(param.Ctx, constant.ContextKeyGroupSwitchFail)
	for i := startIndex; i < len(candidates); i++ {
		group := candidates[i]
		channel, _ := model.GetRandomSatisfiedChannel(group, param.ModelName, failCount, param.RequestPath)
		if channel == nil {
			logger.LogDebug(param.Ctx, "group switch: no channel in group %s for model %s, escalating", group, param.ModelName)
			failCount = 0
			continue
		}
		common.SetContextKey(param.Ctx, constant.ContextKeyGroupSwitchIndex, i)
		common.SetContextKey(param.Ctx, constant.ContextKeyGroupSwitchFail, failCount)
		common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, group)
		if i > 0 && group != sticky {
			cooldown := common.GetContextKeyInt(param.Ctx, constant.ContextKeyTokenGroupSwitchCooldown)
			SetStickyGroupSwitch(tokenID, param.ModelName, userGroup, group, cooldown)
		}
		return channel, group, nil
	}
	return nil, param.TokenGroup, fmt.Errorf("no available channel across candidate groups for model %s", param.ModelName)
}

// RecordGroupSwitchFailure is the untouched original candidate-group counter.
// Channel failover pools never call it.
func RecordGroupSwitchFailure(c *gin.Context) {
	if !common.GetContextKeyBool(c, constant.ContextKeyTokenGroupSwitch) {
		return
	}
	threshold := common.GetContextKeyInt(c, constant.ContextKeyTokenGroupSwitchThreshold)
	if threshold < 1 {
		threshold = 1
	}
	failCount := common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchFail) + 1
	if failCount >= threshold {
		index := common.GetContextKeyInt(c, constant.ContextKeyGroupSwitchIndex) + 1
		common.SetContextKey(c, constant.ContextKeyGroupSwitchIndex, index)
		common.SetContextKey(c, constant.ContextKeyGroupSwitchFail, 0)
		return
	}
	common.SetContextKey(c, constant.ContextKeyGroupSwitchFail, failCount)
}
