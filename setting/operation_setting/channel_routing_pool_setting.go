package operation_setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

const ChannelRoutingPoolSettingConfigName = "channel_failover_setting"

// ChannelRoutingPool is an administrator-owned allowlist for a single real
// group and exact upstream channel type. The ID is stable so a request can
// keep the pool boundary it selected for its lifetime.
type ChannelRoutingPool struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Enabled     bool   `json:"enabled"`
	Group       string `json:"group"`
	ChannelType int    `json:"channel_type"`
	ChannelIDs  []int  `json:"channel_ids"`
}

// ChannelRoutingPoolSetting intentionally contains one JSON field. This
// makes the complete pool configuration an atomic Option update instead of a
// collection of independently persisted pool records.
type ChannelRoutingPoolSetting struct {
	Pools []ChannelRoutingPool `json:"pools"`
}

var channelRoutingPoolSetting = DefaultChannelRoutingPoolSetting()

func init() {
	config.GlobalConfig.Register(ChannelRoutingPoolSettingConfigName, &channelRoutingPoolSetting)
}

func DefaultChannelRoutingPoolSetting() ChannelRoutingPoolSetting {
	return ChannelRoutingPoolSetting{Pools: []ChannelRoutingPool{}}
}

// GetChannelRoutingPoolSetting returns a defensive copy because selection may
// retain a pool boundary while a later Option hot reload replaces the active
// configuration.
func GetChannelRoutingPoolSetting() *ChannelRoutingPoolSetting {
	setting := ChannelRoutingPoolSetting{Pools: make([]ChannelRoutingPool, len(channelRoutingPoolSetting.Pools))}
	for i, pool := range channelRoutingPoolSetting.Pools {
		setting.Pools[i] = pool
		setting.Pools[i].ChannelIDs = append([]int(nil), pool.ChannelIDs...)
	}
	return &setting
}

// ValidateChannelRoutingPoolSetting validates the persisted shape. Channel
// existence, exact group membership, and exact type
// are validated at the model boundary where database access is available.
func ValidateChannelRoutingPoolSetting(setting ChannelRoutingPoolSetting) error {
	seenIDs := make(map[string]struct{}, len(setting.Pools))
	enabledGroupTypes := make(map[string]struct{}, len(setting.Pools))
	for _, pool := range setting.Pools {
		if pool.ID == "" || pool.ID != strings.TrimSpace(pool.ID) {
			return fmt.Errorf("channel routing pool ID is required and cannot contain surrounding whitespace")
		}
		if _, exists := seenIDs[pool.ID]; exists {
			return fmt.Errorf("channel routing pool ID must be unique: %s", pool.ID)
		}
		seenIDs[pool.ID] = struct{}{}
		if strings.TrimSpace(pool.Name) == "" {
			return fmt.Errorf("channel routing pool %s name is required", pool.ID)
		}
		if pool.Group == "" || pool.Group != strings.TrimSpace(pool.Group) {
			return fmt.Errorf("channel routing pool %s group is required and cannot contain surrounding whitespace", pool.ID)
		}
		if len(pool.ChannelIDs) < 2 {
			return fmt.Errorf("channel routing pool %s must contain at least two channel IDs", pool.ID)
		}
		seenChannels := make(map[int]struct{}, len(pool.ChannelIDs))
		for _, channelID := range pool.ChannelIDs {
			if channelID <= 0 {
				return fmt.Errorf("channel routing pool %s channel IDs must be positive", pool.ID)
			}
			if _, exists := seenChannels[channelID]; exists {
				return fmt.Errorf("channel routing pool %s channel IDs must be unique", pool.ID)
			}
			seenChannels[channelID] = struct{}{}
		}
		if pool.Enabled {
			groupType := fmt.Sprintf("%s\x00%d", pool.Group, pool.ChannelType)
			if _, exists := enabledGroupTypes[groupType]; exists {
				return fmt.Errorf("only one enabled pool is allowed for group %s and channel type %d", pool.Group, pool.ChannelType)
			}
			enabledGroupTypes[groupType] = struct{}{}
		}
	}
	return nil
}
