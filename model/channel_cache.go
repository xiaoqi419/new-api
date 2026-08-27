package model

import (
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var group2model2channels map[string]map[string][]int // enabled channel
var channelsIDM map[int]*Channel                     // all channels include disabled
// channel2advancedCustomConfig caches parsed Advanced Custom (type 58) configs so
// path-aware selection avoids re-parsing JSON per request. Refreshed on full sync.
var channel2advancedCustomConfig map[int]*dto.AdvancedCustomConfig
var channelSyncLock sync.RWMutex

func InitChannelCache() {
	if !common.MemoryCacheEnabled {
		InvalidatePricingCache()
		return
	}
	newChannelId2channel := make(map[int]*Channel)
	newChannel2advancedCustomConfig := make(map[int]*dto.AdvancedCustomConfig)
	var channels []*Channel
	DB.Find(&channels)
	for _, channel := range channels {
		newChannelId2channel[channel.Id] = channel
		if channel.Type == constant.ChannelTypeAdvancedCustom {
			if config := channel.GetOtherSettings().AdvancedCustom; config != nil {
				newChannel2advancedCustomConfig[channel.Id] = config
			}
		}
	}
	var abilities []*Ability
	DB.Find(&abilities)
	groups := make(map[string]bool)
	for _, ability := range abilities {
		groups[ability.Group] = true
	}
	newGroup2model2channels := make(map[string]map[string][]int)
	for group := range groups {
		newGroup2model2channels[group] = make(map[string][]int)
	}
	for _, channel := range channels {
		if channel.Status != common.ChannelStatusEnabled {
			continue // skip disabled channels
		}
		groups := strings.Split(channel.Group, ",")
		for _, group := range groups {
			models := strings.Split(channel.Models, ",")
			for _, model := range models {
				if _, ok := newGroup2model2channels[group][model]; !ok {
					newGroup2model2channels[group][model] = make([]int, 0)
				}
				newGroup2model2channels[group][model] = append(newGroup2model2channels[group][model], channel.Id)
			}
		}
	}

	// sort by priority
	for group, model2channels := range newGroup2model2channels {
		for model, channels := range model2channels {
			sort.Slice(channels, func(i, j int) bool {
				left := newChannelId2channel[channels[i]]
				right := newChannelId2channel[channels[j]]
				if left.GetPriority() == right.GetPriority() {
					return left.Id < right.Id
				}
				return left.GetPriority() > right.GetPriority()
			})
			newGroup2model2channels[group][model] = channels
		}
	}

	channelSyncLock.Lock()
	group2model2channels = newGroup2model2channels
	//channelsIDM = newChannelId2channel
	for i, channel := range newChannelId2channel {
		if channel.ChannelInfo.IsMultiKey {
			channel.Keys = channel.GetKeys()
			if channel.ChannelInfo.MultiKeyMode == constant.MultiKeyModePolling {
				if oldChannel, ok := channelsIDM[i]; ok {
					// 存在旧的渠道，如果是多key且轮询，保留轮询索引信息
					if oldChannel.ChannelInfo.IsMultiKey && oldChannel.ChannelInfo.MultiKeyMode == constant.MultiKeyModePolling {
						channel.ChannelInfo.MultiKeyPollingIndex = oldChannel.ChannelInfo.MultiKeyPollingIndex
					}
				}
			}
		}
	}
	channelsIDM = newChannelId2channel
	channel2advancedCustomConfig = newChannel2advancedCustomConfig
	channelSyncLock.Unlock()
	// Lock ordering: InvalidatePricingCache acquires updatePricingLock, and
	// GetPricing (holding updatePricingLock) nests channelSyncLock.RLock via
	// loadPricingAdvancedCustomConfigs. channelSyncLock MUST be released before
	// invalidating the pricing cache, otherwise the reversed order deadlocks.
	InvalidatePricingCache()
	common.SysLog("channels synced from database")
}

func SyncChannelCache(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		common.SysLog("syncing channels from database")
		InitChannelCache()
	}
}

func GetRandomSatisfiedChannel(group string, model string, retry int, requestPath string) (*Channel, error) {
	return getRandomSatisfiedChannel(group, model, retry, requestPath, ChannelSelectionFilter{})
}

// ChannelSelectionFilter applies the same request-local constraints to both
// cache and database selection. A nil AllowedChannelIDs leaves normal routing
// unrestricted, while a non-nil empty map intentionally fails closed.
type ChannelSelectionFilter struct {
	AllowedChannelIDs    map[int]struct{}
	ExpectedChannelTypes map[int]int
	ExcludedChannelIDs   map[int]struct{}
	ChannelType          int
	RequireChannelType   bool
}

// GetRandomSatisfiedChannelExcluding preserves the legacy selection API while
// applying exclusions consistently even when the in-memory cache is disabled.
func GetRandomSatisfiedChannelExcluding(group string, model string, retry int, requestPath string, excludedChannelIDs map[int]struct{}) (*Channel, error) {
	return getRandomSatisfiedChannel(group, model, retry, requestPath, ChannelSelectionFilter{ExcludedChannelIDs: excludedChannelIDs})
}

// GetRandomSatisfiedChannelFiltered selects with an explicit positive allowlist
// and request-local exclusions. Callers use retry zero after an exclusion so
// each failover begins at the highest remaining priority tier.
func GetRandomSatisfiedChannelFiltered(group string, model string, retry int, requestPath string, filter ChannelSelectionFilter) (*Channel, error) {
	return getRandomSatisfiedChannel(group, model, retry, requestPath, filter)
}

func getRandomSatisfiedChannel(group string, model string, retry int, requestPath string, filter ChannelSelectionFilter) (*Channel, error) {
	// if memory cache is disabled, get channel directly from database
	if !common.MemoryCacheEnabled {
		return GetChannelFiltered(group, model, retry, requestPath, filter)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	// First, try to find channels with the exact model name.
	channels := filterChannelsByRequestPathAndModel(group2model2channels[group][model], requestPath, model)

	// If no channels found, try to find channels with the normalized model name.
	if len(channels) == 0 {
		normalizedModel := ratio_setting.FormatMatchingModelName(model)
		channels = filterChannelsByRequestPathAndModel(group2model2channels[group][normalizedModel], requestPath, model)
	}

	candidates := make([]*Channel, 0, len(channels))
	for _, channelId := range channels {
		channel, ok := channelsIDM[channelId]
		if !ok {
			return nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channelId)
		}
		if !filter.allows(channel, group) {
			continue
		}
		candidates = append(candidates, channel)
	}
	if len(candidates) == 0 {
		return nil, nil
	}

	selected := selectChannelByRetryTier(candidates, retry)
	if selected == nil {
		return nil, fmt.Errorf("no channel found, group: %s, model: %s", group, model)
	}
	return selected, nil
}

func (filter ChannelSelectionFilter) allows(channel *Channel, group string) bool {
	if channel == nil || channel.Status != common.ChannelStatusEnabled {
		return false
	}
	if filter.AllowedChannelIDs != nil {
		if _, allowed := filter.AllowedChannelIDs[channel.Id]; !allowed {
			return false
		}
	}
	if _, excluded := filter.ExcludedChannelIDs[channel.Id]; excluded {
		return false
	}
	if filter.RequireChannelType && channel.Type != filter.ChannelType {
		return false
	}
	if filter.ExpectedChannelTypes != nil {
		expectedType, found := filter.ExpectedChannelTypes[channel.Id]
		if !found || channel.Type != expectedType {
			return false
		}
	}
	for _, channelGroup := range channel.GetGroups() {
		if channelGroup == group {
			return true
		}
	}
	return false
}

// CachedChannelIDsForGroupModel returns the current in-memory candidates for a
// group and model without querying the database. The result is a defensive
// copy ordered by priority (descending) and channel ID (ascending).
func CachedChannelIDsForGroupModel(group string, model string, requestPath string) []int {
	if !common.MemoryCacheEnabled || group == "" || model == "" {
		return nil
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	if group2model2channels == nil {
		return nil
	}
	candidates := filterChannelsByRequestPathAndModel(group2model2channels[group][model], requestPath, model)
	if len(candidates) == 0 {
		normalizedModel := ratio_setting.FormatMatchingModelName(model)
		if normalizedModel != "" && normalizedModel != model {
			candidates = filterChannelsByRequestPathAndModel(group2model2channels[group][normalizedModel], requestPath, model)
		}
	}
	return append([]int(nil), candidates...)
}

// selectChannelByRetryTier 按重试档位从候选渠道中挑选一个，兜底渠道(setting.fallback)作为
// 最低的独立档位：只有在所有非兜底渠道的优先级档都用尽（或没有任何非兜底渠道）时才会命中。
// retry 即当前重试序号(0 起)，超过档数时夹取到最后一档。
func selectChannelByRetryTier(candidates []*Channel, retry int) *Channel {
	var primary, fallback []*Channel
	for _, channel := range candidates {
		if channel == nil {
			continue
		}
		if channel.GetSetting().Fallback {
			fallback = append(fallback, channel)
		} else {
			primary = append(primary, channel)
		}
	}

	prioritySet := make(map[int64]bool)
	for _, channel := range primary {
		prioritySet[channel.GetPriority()] = true
	}
	priorities := make([]int64, 0, len(prioritySet))
	for priority := range prioritySet {
		priorities = append(priorities, priority)
	}
	sort.Slice(priorities, func(i, j int) bool { return priorities[i] > priorities[j] })

	totalTiers := len(priorities)
	if len(fallback) > 0 {
		totalTiers++
	}
	if totalTiers == 0 {
		return nil
	}
	if retry < 0 {
		retry = 0
	}
	if retry >= totalTiers {
		retry = totalTiers - 1
	}

	var targetChannels []*Channel
	if retry < len(priorities) {
		targetPriority := priorities[retry]
		for _, channel := range primary {
			if channel.GetPriority() == targetPriority {
				targetChannels = append(targetChannels, channel)
			}
		}
	} else {
		targetChannels = fallback
	}
	return weightedPickChannel(targetChannels)
}

// weightedPickChannel 在同一档位内按权重(含平滑处理)随机挑选一个渠道。
func weightedPickChannel(targetChannels []*Channel) *Channel {
	if len(targetChannels) == 0 {
		return nil
	}
	if len(targetChannels) == 1 {
		return targetChannels[0]
	}

	sumWeight := 0
	for _, channel := range targetChannels {
		sumWeight += channel.GetWeight()
	}

	smoothingFactor := 1
	smoothingAdjustment := 0
	if sumWeight == 0 {
		sumWeight = len(targetChannels) * 100
		smoothingAdjustment = 100
	} else if sumWeight/len(targetChannels) < 10 {
		smoothingFactor = 100
	}

	totalWeight := sumWeight * smoothingFactor
	randomWeight := rand.Intn(totalWeight)
	for _, channel := range targetChannels {
		randomWeight -= channel.GetWeight()*smoothingFactor + smoothingAdjustment
		if randomWeight < 0 {
			return channel
		}
	}
	return targetChannels[len(targetChannels)-1]
}

// filterChannelsByRequestPathAndModel restricts candidates by request path and
// model. Only Advanced Custom (type 58) channels are path-checked: they are kept
// only when one of their configured routes matches requestPath and model. All
// other channel types always pass. When requestPath is empty, filtering is skipped.
// Caller must hold channelSyncLock (read lock). The cached slice is never mutated.
func filterChannelsByRequestPathAndModel(channels []int, requestPath string, model string) []int {
	if requestPath == "" || len(channels) == 0 {
		return channels
	}
	filtered := make([]int, 0, len(channels))
	for _, channelId := range channels {
		channel, ok := channelsIDM[channelId]
		if !ok {
			// keep it so the downstream consistency error is raised as before
			filtered = append(filtered, channelId)
			continue
		}
		if channel.Type != constant.ChannelTypeAdvancedCustom {
			filtered = append(filtered, channelId)
			continue
		}
		if config := channel2advancedCustomConfig[channelId]; config != nil && config.SupportsPathForModel(requestPath, model) {
			filtered = append(filtered, channelId)
		}
	}
	return filtered
}

func CacheGetChannel(id int) (*Channel, error) {
	if !common.MemoryCacheEnabled {
		return GetChannelById(id, true)
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	return c, nil
}

func CacheGetChannelInfo(id int) (*ChannelInfo, error) {
	if !common.MemoryCacheEnabled {
		channel, err := GetChannelById(id, true)
		if err != nil {
			return nil, err
		}
		return &channel.ChannelInfo, nil
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	c, ok := channelsIDM[id]
	if !ok {
		return nil, fmt.Errorf("渠道# %d，已不存在", id)
	}
	return &c.ChannelInfo, nil
}

func CacheUpdateChannelStatus(id int, status int) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	defer channelSyncLock.Unlock()
	channel, found := channelsIDM[id]
	if found {
		channel.Status = status
	}
	if status != common.ChannelStatusEnabled {
		removeCachedChannelIDLocked(id)
		return
	}
	if found {
		insertCachedEnabledChannelLocked(channel)
	}
}

func removeCachedChannelIDLocked(channelID int) {
	for group, model2channels := range group2model2channels {
		for model, channels := range model2channels {
			filtered := channels[:0]
			for _, cachedID := range channels {
				if cachedID != channelID {
					filtered = append(filtered, cachedID)
				}
			}
			group2model2channels[group][model] = filtered
		}
	}
}

func insertCachedEnabledChannelLocked(channel *Channel) {
	if channel == nil {
		return
	}
	if group2model2channels == nil {
		group2model2channels = make(map[string]map[string][]int)
	}
	removeCachedChannelIDLocked(channel.Id)

	for _, group := range strings.Split(channel.Group, ",") {
		group = strings.TrimSpace(group)
		if group == "" {
			continue
		}
		if group2model2channels[group] == nil {
			group2model2channels[group] = make(map[string][]int)
		}
		for _, model := range strings.Split(channel.Models, ",") {
			model = strings.TrimSpace(model)
			if model == "" {
				continue
			}
			channels := append(group2model2channels[group][model], channel.Id)
			sort.Slice(channels, func(i, j int) bool {
				left := channelsIDM[channels[i]]
				right := channelsIDM[channels[j]]
				if left == nil || right == nil {
					return channels[i] < channels[j]
				}
				if left.GetPriority() == right.GetPriority() {
					return left.Id < right.Id
				}
				return left.GetPriority() > right.GetPriority()
			})
			group2model2channels[group][model] = channels
		}
	}
}

func CacheUpdateChannel(channel *Channel) {
	if !common.MemoryCacheEnabled {
		return
	}
	channelSyncLock.Lock()
	if channel == nil {
		channelSyncLock.Unlock()
		return
	}

	if channelsIDM == nil {
		channelsIDM = make(map[int]*Channel)
	}
	if oldChannel, ok := channelsIDM[channel.Id]; ok {
		logger.LogDebug(nil, "CacheUpdateChannel before: id=%d, name=%s, status=%d, polling_index=%d", channel.Id, channel.Name, channel.Status, oldChannel.ChannelInfo.MultiKeyPollingIndex)
	}
	channelsIDM[channel.Id] = channel
	if channel2advancedCustomConfig == nil {
		channel2advancedCustomConfig = make(map[int]*dto.AdvancedCustomConfig)
	}
	delete(channel2advancedCustomConfig, channel.Id)
	if channel.Type == constant.ChannelTypeAdvancedCustom {
		if config := channel.GetOtherSettings().AdvancedCustom; config != nil {
			channel2advancedCustomConfig[channel.Id] = config
		}
	}
	logger.LogDebug(nil, "CacheUpdateChannel after: id=%d, name=%s, status=%d, polling_index=%d", channel.Id, channel.Name, channel.Status, channel.ChannelInfo.MultiKeyPollingIndex)
	// Lock ordering: do NOT hold channelSyncLock while calling
	// InvalidatePricingCache. GetPricing acquires updatePricingLock first and then
	// channelSyncLock.RLock (via loadPricingAdvancedCustomConfigs); acquiring
	// updatePricingLock while holding channelSyncLock would be an AB-BA deadlock.
	channelSyncLock.Unlock()
	InvalidatePricingCache()
}
