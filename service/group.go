package service

import (
	"strings"

	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

func GetUserUsableGroups(userGroup string) map[string]string {
	groupsCopy := setting.GetUserUsableGroupsCopy()
	if userGroup != "" {
		specialSettings, b := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(userGroup)
		if b {
			// 处理特殊可用分组
			for specialGroup, desc := range specialSettings {
				if strings.HasPrefix(specialGroup, "-:") {
					// 移除分组
					groupToRemove := strings.TrimPrefix(specialGroup, "-:")
					delete(groupsCopy, groupToRemove)
				} else if strings.HasPrefix(specialGroup, "+:") {
					// 添加分组
					groupToAdd := strings.TrimPrefix(specialGroup, "+:")
					groupsCopy[groupToAdd] = desc
				} else {
					// 直接添加分组
					groupsCopy[specialGroup] = desc
				}
			}
		}
		// 如果userGroup不在UserUsableGroups中，返回UserUsableGroups + userGroup
		if _, ok := groupsCopy[userGroup]; !ok {
			groupsCopy[userGroup] = "用户分组"
		}
	}
	return groupsCopy
}

func GroupInUserUsableGroups(userGroup, groupName string) bool {
	_, ok := GetUserUsableGroups(userGroup)[groupName]
	return ok
}

// GetUserAutoGroup 根据用户分组获取（旧版）自动分组链路，等价于解析 "auto"。
func GetUserAutoGroup(userGroup string) []string {
	return GetUserAutoGroupChain(userGroup, "auto")
}

// GetUserAutoGroupChain 解析某个 token 分组（"auto" 或 "auto:<key>"）对应的
// 有序真实分组链路，并按用户可用分组过滤。
func GetUserAutoGroupChain(userGroup, tokenGroup string) []string {
	chain := setting.ResolveAutoGroupChain(tokenGroup)
	if len(chain) == 0 {
		return []string{}
	}
	groups := GetUserUsableGroups(userGroup)
	autoGroups := make([]string, 0, len(chain))
	for _, group := range chain {
		if _, ok := groups[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

// UserAutoGroupRoute 是暴露给前端（价格页/令牌表单）的自动链路信息，
// Groups 为按当前用户可用分组过滤后的真实链路。
type UserAutoGroupRoute struct {
	Key            string   `json:"key"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Groups         []string `json:"groups"`
	UserSelectable bool     `json:"user_selectable"`
}

// GetUserAutoGroupRoutes 返回所有已启用的具名自动链路（按用户可用分组过滤链路）。
func GetUserAutoGroupRoutes(userGroup string) []UserAutoGroupRoute {
	result := make([]UserAutoGroupRoute, 0)
	for _, route := range setting.GetAutoGroupRoutes() {
		if !route.Enabled {
			continue
		}
		result = append(result, UserAutoGroupRoute{
			Key:            route.Key,
			Name:           route.Name,
			Description:    route.Description,
			Groups:         GetUserAutoGroupChain(userGroup, setting.AutoGroupPrefix+route.Key),
			UserSelectable: route.UserSelectable,
		})
	}
	return result
}

// GetUserGroupRatio 获取用户使用某个分组的倍率
// userGroup 用户分组
// group 需要获取倍率的分组
func GetUserGroupRatio(userGroup, group string) float64 {
	ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group)
	if ok {
		return ratio
	}
	return ratio_setting.GetGroupRatio(group)
}
