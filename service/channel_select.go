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

// CacheGetRandomSatisfiedChannel returns a channel satisfying the request.
//
// When the token has group auto-switch enabled (per-API-Key candidate groups),
// it walks the candidate groups ordered by group ratio (low to high),
// escalating to the next group when the current group has no channel for the
// model or has reached the per-group failure threshold. See getGroupSwitchChannel.
//
// Otherwise it selects a channel from the token's fixed group.
func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
	if common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenGroupSwitch) {
		return getGroupSwitchChannel(param)
	}

	channel, err := model.GetRandomSatisfiedChannel(param.TokenGroup, param.ModelName, param.GetRetry(), param.RequestPath)
	if err != nil {
		return nil, param.TokenGroup, err
	}
	return channel, param.TokenGroup, nil
}

// orderedSwitchCandidates returns the token's candidate groups filtered by the
// user's usable groups and sorted ascending by group ratio (cheapest first).
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

	// Not enough valid candidates after filtering: degrade to a fixed selection.
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

	tokenId := common.GetContextKeyInt(param.Ctx, constant.ContextKeyTokenId)
	sticky := GetStickyGroupSwitch(tokenId, param.ModelName, userGroup)

	startIndex := 0
	if idx, exists := common.GetContextKey(param.Ctx, constant.ContextKeyGroupSwitchIndex); exists {
		// Mid-request retry: continue from where the previous attempt left off.
		if v, ok := idx.(int); ok {
			startIndex = v
		}
	} else if sticky != "" {
		// First attempt of the request: honor the sticky cooldown group.
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
			// No channel for this model in this group -> escalate immediately.
			logger.LogDebug(param.Ctx, "group switch: no channel in group %s for model %s, escalating", group, param.ModelName)
			failCount = 0
			continue
		}
		common.SetContextKey(param.Ctx, constant.ContextKeyGroupSwitchIndex, i)
		common.SetContextKey(param.Ctx, constant.ContextKeyGroupSwitchFail, failCount)
		common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, group)
		// Remember a genuinely higher group so later requests skip cheaper groups
		// during the cooldown window. Skip when reusing the current sticky group
		// so its original expiry is preserved (no refresh on reuse).
		if i > 0 && group != sticky {
			cooldown := common.GetContextKeyInt(param.Ctx, constant.ContextKeyTokenGroupSwitchCooldown)
			SetStickyGroupSwitch(tokenId, param.ModelName, userGroup, group, cooldown)
		}
		return channel, group, nil
	}

	return nil, param.TokenGroup, fmt.Errorf("no available channel across candidate groups for model %s", param.ModelName)
}

// RecordGroupSwitchFailure records a retryable upstream failure for the current
// candidate group. When the per-group threshold is reached it advances to the
// next candidate group (resetting the per-group counter) so the next retry
// escalates. No-op when group auto-switch is not active for this request.
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
