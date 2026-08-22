package service

import (
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// Sticky cooldown cache for per-API-Key group auto-switching.
//
// After a request escalates to a higher-ratio candidate group and successfully
// selects a channel there, that group is remembered for a cooldown window so
// subsequent requests (same token + model + user group) start from it instead
// of re-probing the lowest group every time. When the window expires the next
// request starts again from the lowest-ratio candidate.

const groupSwitchCachePrefix = "groupswitch:"

type groupSwitchEntry struct {
	group    string
	expireAt time.Time
}

var (
	groupSwitchMemCache = make(map[string]groupSwitchEntry)
	groupSwitchMemMutex sync.RWMutex
)

func groupSwitchCacheKey(tokenId int, modelName, userGroup string) string {
	return fmt.Sprintf("%s%d:%s:%s", groupSwitchCachePrefix, tokenId, modelName, userGroup)
}

// GetStickyGroupSwitch returns the remembered escalated group, or "" when none
// is active for this token+model+userGroup.
func GetStickyGroupSwitch(tokenId int, modelName, userGroup string) string {
	key := groupSwitchCacheKey(tokenId, modelName, userGroup)
	if common.RedisEnabled {
		val, err := common.RedisGet(key)
		if err != nil {
			return ""
		}
		return val
	}
	groupSwitchMemMutex.RLock()
	entry, ok := groupSwitchMemCache[key]
	groupSwitchMemMutex.RUnlock()
	if !ok {
		return ""
	}
	if time.Now().After(entry.expireAt) {
		groupSwitchMemMutex.Lock()
		delete(groupSwitchMemCache, key)
		groupSwitchMemMutex.Unlock()
		return ""
	}
	return entry.group
}

// SetStickyGroupSwitch remembers the escalated group for cooldownMinutes.
func SetStickyGroupSwitch(tokenId int, modelName, userGroup, group string, cooldownMinutes int) {
	if group == "" || cooldownMinutes <= 0 {
		return
	}
	key := groupSwitchCacheKey(tokenId, modelName, userGroup)
	ttl := time.Duration(cooldownMinutes) * time.Minute
	if common.RedisEnabled {
		if err := common.RedisSet(key, group, ttl); err != nil {
			common.SysLog("failed to set group switch sticky cache: " + err.Error())
		}
		return
	}
	groupSwitchMemMutex.Lock()
	groupSwitchMemCache[key] = groupSwitchEntry{group: group, expireAt: time.Now().Add(ttl)}
	groupSwitchMemMutex.Unlock()
}
