package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/go-redis/redis/v8"
)

// Sticky cooldown cache for per-API-Key group auto-switching.
//
// After a request escalates to a higher-ratio candidate group and successfully
// selects a channel there, that group is remembered for a cooldown window so
// subsequent requests (same token + model + user group) start from it instead
// of re-probing the lowest group every time. When the window expires the next
// request starts again from the lowest-ratio candidate.

const (
	groupSwitchCachePrefix        = "groupswitch:"
	groupSwitchMemoryCapacity     = 4096
	groupSwitchMaxCooldownMinutes = 30
)

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

func getGroupSwitchMemory(key string) string {
	now := time.Now()
	groupSwitchMemMutex.Lock()
	defer groupSwitchMemMutex.Unlock()
	entry, ok := groupSwitchMemCache[key]
	if !ok {
		return ""
	}
	if !entry.expireAt.After(now) {
		delete(groupSwitchMemCache, key)
		return ""
	}
	return entry.group
}

func setGroupSwitchMemory(key, group string, ttl time.Duration) {
	now := time.Now()
	groupSwitchMemMutex.Lock()
	defer groupSwitchMemMutex.Unlock()

	for cachedKey, entry := range groupSwitchMemCache {
		if !entry.expireAt.After(now) {
			delete(groupSwitchMemCache, cachedKey)
		}
	}
	if _, exists := groupSwitchMemCache[key]; !exists && len(groupSwitchMemCache) >= groupSwitchMemoryCapacity {
		var evictionKey string
		var earliestExpiry time.Time
		for cachedKey, entry := range groupSwitchMemCache {
			if evictionKey == "" || entry.expireAt.Before(earliestExpiry) {
				evictionKey = cachedKey
				earliestExpiry = entry.expireAt
			}
		}
		delete(groupSwitchMemCache, evictionKey)
	}
	groupSwitchMemCache[key] = groupSwitchEntry{group: group, expireAt: now.Add(ttl)}
}

func deleteGroupSwitchMemory(key string) {
	groupSwitchMemMutex.Lock()
	delete(groupSwitchMemCache, key)
	groupSwitchMemMutex.Unlock()
}

// GetStickyGroupSwitch returns the remembered escalated group, or "" when none
// is active for this token+model+userGroup.
func GetStickyGroupSwitch(tokenId int, modelName, userGroup string) string {
	key := groupSwitchCacheKey(tokenId, modelName, userGroup)
	if common.RedisEnabled && common.RDB != nil {
		val, err := common.RedisGet(key)
		if err == nil {
			remainingTTL, ttlErr := common.RDB.PTTL(context.Background(), key).Result()
			if ttlErr == nil {
				if remainingTTL > 0 {
					setGroupSwitchMemory(key, val, remainingTTL)
					return val
				}
				deleteGroupSwitchMemory(key)
				return ""
			}
			return val
		}
		if errors.Is(err, redis.Nil) {
			deleteGroupSwitchMemory(key)
			return ""
		}
	}
	return getGroupSwitchMemory(key)
}

// SetStickyGroupSwitch remembers the escalated group for cooldownMinutes.
func SetStickyGroupSwitch(tokenId int, modelName, userGroup, group string, cooldownMinutes int) {
	if group == "" || cooldownMinutes <= 0 {
		return
	}
	key := groupSwitchCacheKey(tokenId, modelName, userGroup)
	if cooldownMinutes > groupSwitchMaxCooldownMinutes {
		cooldownMinutes = groupSwitchMaxCooldownMinutes
	}
	ttl := time.Duration(cooldownMinutes) * time.Minute
	setGroupSwitchMemory(key, group, ttl)
	if common.RedisEnabled && common.RDB != nil {
		if err := common.RedisSet(key, group, ttl); err != nil {
			common.SysLog("failed to set group switch sticky cache: " + err.Error())
		}
	}
}
