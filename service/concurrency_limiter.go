package service

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/go-redis/redis/v8"
	"golang.org/x/sync/semaphore"
)

// 并发限制器：限制某个维度（用户/令牌）的同时在途请求数。
// max <= 0 表示不限制。超出上限时会等待空闲槽位，最长等待 common.ConcurrencyWaitTimeout，
// 超时返回获取失败（由调用方决定返回 429）。
//
// - Redis 可用时使用 ZSET 计数，支持多实例分布式；条目带安全 TTL 自愈，避免进程崩溃导致计数卡死。
// - 否则使用进程内加权信号量。

type memSemaphore struct {
	sem *semaphore.Weighted
	cap int64
}

var (
	memSemMu  sync.Mutex
	memSemMap = make(map[string]*memSemaphore)
)

func getMemSemaphore(key string, max int64) *semaphore.Weighted {
	memSemMu.Lock()
	defer memSemMu.Unlock()
	ms, ok := memSemMap[key]
	if !ok || ms.cap != max {
		ms = &memSemaphore{sem: semaphore.NewWeighted(max), cap: max}
		memSemMap[key] = ms
	}
	return ms.sem
}

// AcquireConcurrency 尝试为 scope:id 维度获取一个并发槽位。
// 返回 release 释放函数与是否成功。max<=0 时直接放行。
func AcquireConcurrency(scope string, id int, max int) (func(), bool) {
	if max <= 0 {
		return func() {}, true
	}
	key := fmt.Sprintf("%s:%d", scope, id)
	if common.RedisEnabled && common.RDB != nil {
		return acquireRedisConcurrency(key, max)
	}
	return acquireMemoryConcurrency(key, max)
}

// GetConcurrencyInUse 只读返回指定维度当前在途并发数。
// supported=false 表示当前部署（内存信号量模式）无法读取实时并发，仅 Redis 模式可读。
func GetConcurrencyInUse(scope string, id int) (inUse int, supported bool) {
	if !(common.RedisEnabled && common.RDB != nil) {
		return 0, false
	}
	key := fmt.Sprintf("%s:%d", scope, id)
	return readRedisConcurrency(key), true
}

// GetTokenConcurrencyInUse 批量读取多个令牌的实时并发数（单次 pipeline，避免 N 次往返）。
// 返回 map[tokenId]inUse 与 supported。内存模式下 supported=false。
func GetTokenConcurrencyInUse(tokenIds []int) (map[int]int, bool) {
	result := make(map[int]int, len(tokenIds))
	if !(common.RedisEnabled && common.RDB != nil) {
		return result, false
	}
	if len(tokenIds) == 0 {
		return result, true
	}
	ctx := context.Background()
	rdb := common.RDB
	minScore := strconv.FormatInt(time.Now().Add(-common.ConcurrencySafetyTTL).UnixMilli(), 10)
	pipe := rdb.TxPipeline()
	cards := make(map[int]*redis.IntCmd, len(tokenIds))
	for _, id := range tokenIds {
		zkey := fmt.Sprintf("concurrency:token:%d", id)
		pipe.ZRemRangeByScore(ctx, zkey, "0", minScore)
		cards[id] = pipe.ZCard(ctx, zkey)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return result, false
	}
	for id, cmd := range cards {
		result[id] = int(cmd.Val())
	}
	return result, true
}

// readRedisConcurrency 清理过期占位后返回 ZSET 计数，作为实时并发数。
func readRedisConcurrency(key string) int {
	ctx := context.Background()
	rdb := common.RDB
	zkey := "concurrency:" + key
	minScore := strconv.FormatInt(time.Now().Add(-common.ConcurrencySafetyTTL).UnixMilli(), 10)
	pipe := rdb.TxPipeline()
	pipe.ZRemRangeByScore(ctx, zkey, "0", minScore)
	card := pipe.ZCard(ctx, zkey)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0
	}
	return int(card.Val())
}

func acquireMemoryConcurrency(key string, max int) (func(), bool) {
	sem := getMemSemaphore(key, int64(max))
	ctx, cancel := context.WithTimeout(context.Background(), common.ConcurrencyWaitTimeout)
	defer cancel()
	if err := sem.Acquire(ctx, 1); err != nil {
		return nil, false
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			sem.Release(1)
		})
	}, true
}

func acquireRedisConcurrency(key string, max int) (func(), bool) {
	ctx := context.Background()
	rdb := common.RDB
	zkey := "concurrency:" + key
	member := common.NewRequestId()
	deadline := time.Now().Add(common.ConcurrencyWaitTimeout)
	safetyTTL := common.ConcurrencySafetyTTL

	release := func() {
		rdb.ZRem(context.Background(), zkey, member)
	}

	for {
		now := time.Now()
		minScore := now.Add(-safetyTTL).UnixMilli()
		pipe := rdb.TxPipeline()
		pipe.ZRemRangeByScore(ctx, zkey, "0", strconv.FormatInt(minScore, 10))
		pipe.ZAdd(ctx, zkey, &redis.Z{Score: float64(now.UnixMilli()), Member: member})
		card := pipe.ZCard(ctx, zkey)
		pipe.Expire(ctx, zkey, safetyTTL+time.Minute)
		if _, err := pipe.Exec(ctx); err != nil {
			// Redis 异常时放行，避免阻断正常流量。
			return func() {}, true
		}
		if card.Val() <= int64(max) {
			return release, true
		}
		// 超出上限：先移除自身占位，再等待重试。
		rdb.ZRem(ctx, zkey, member)
		if time.Now().After(deadline) {
			return nil, false
		}
		time.Sleep(80 * time.Millisecond)
	}
}
