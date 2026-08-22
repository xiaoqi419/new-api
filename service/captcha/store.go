package captcha

import (
	"context"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const (
	challengeTTL    = 3 * time.Minute
	redisKeyPrefix  = "click_captcha:"
	memoryMaxIssued = 4096
)

type storedChallenge struct {
	Targets []glyphSpot `json:"targets"`
	Expires int64       `json:"expires"`
}

var (
	memoryStore   = map[string]storedChallenge{}
	memoryStoreMu sync.Mutex
)

// redisOn checks the client too, not just the flag: common.RedisEnabled starts
// out true and only turns false inside InitRedisClient, so a caller running
// before that (or in a test binary) would otherwise dereference a nil client.
func redisOn() bool {
	return common.RedisEnabled && common.RDB != nil
}

func saveChallenge(id string, targets []glyphSpot) error {
	entry := storedChallenge{Targets: targets, Expires: time.Now().Add(challengeTTL).Unix()}

	if redisOn() {
		payload, err := common.Marshal(entry)
		if err != nil {
			return err
		}
		return common.RedisSet(redisKeyPrefix+id, string(payload), challengeTTL)
	}

	memoryStoreMu.Lock()
	defer memoryStoreMu.Unlock()
	if len(memoryStore) >= memoryMaxIssued {
		dropExpiredLocked()
	}
	memoryStore[id] = entry
	return nil
}

// consumeChallenge fetches a challenge and removes it in the same step, so a
// solved image cannot be replayed. On Redis the GET and DEL run inside one
// MULTI/EXEC rather than as two round trips, which also keeps it working on
// Redis older than 6.2 (no GETDEL).
func consumeChallenge(id string) (storedChallenge, bool) {
	if redisOn() {
		ctx := context.Background()
		pipe := common.RDB.TxPipeline()
		get := pipe.Get(ctx, redisKeyPrefix+id)
		pipe.Del(ctx, redisKeyPrefix+id)
		if _, err := pipe.Exec(ctx); err != nil {
			return storedChallenge{}, false
		}
		raw, err := get.Result()
		if err != nil {
			return storedChallenge{}, false
		}
		var entry storedChallenge
		if err := common.UnmarshalJsonStr(raw, &entry); err != nil {
			return storedChallenge{}, false
		}
		if time.Now().Unix() > entry.Expires {
			return storedChallenge{}, false
		}
		return entry, true
	}

	memoryStoreMu.Lock()
	defer memoryStoreMu.Unlock()
	entry, ok := memoryStore[id]
	if !ok {
		return storedChallenge{}, false
	}
	delete(memoryStore, id)
	if time.Now().Unix() > entry.Expires {
		return storedChallenge{}, false
	}
	return entry, true
}

// caller must hold memoryStoreMu
func dropExpiredLocked() {
	now := time.Now().Unix()
	for id, entry := range memoryStore {
		if now > entry.Expires {
			delete(memoryStore, id)
		}
	}
}
