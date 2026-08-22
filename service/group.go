package service

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
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

func IsUserSelectableGroup(userGroup, groupName string) bool {
	if groupName == "" || groupName == "auto" {
		return false
	}
	return GroupInUserUsableGroups(userGroup, groupName) && ratio_setting.ContainsGroupRatio(groupName)
}

// GetUserAutoGroup 根据用户分组获取（旧版）自动分组链路，等价于解析 "auto"。
func GetUserAutoGroup(userGroup string) []string {
	return GetUserAutoGroupChain(userGroup, "auto")
}

// GetUserAutoGroupChain 解析某个 token 分组（"auto" 或 "auto:<key>"）对应的
// 有序真实分组链路，按当前用户可选分组过滤并去重。
func GetUserAutoGroupChain(userGroup, tokenGroup string) []string {
	chain := setting.ResolveAutoGroupChain(tokenGroup)
	if len(chain) == 0 {
		return []string{}
	}
	autoGroups := make([]string, 0, len(chain))
	seen := make(map[string]struct{})
	for _, group := range chain {
		if !IsUserSelectableGroup(userGroup, group) {
			continue
		}
		if _, ok := seen[group]; ok {
			continue
		}
		seen[group] = struct{}{}
		autoGroups = append(autoGroups, group)
	}
	return autoGroups
}

// FilterUserTokenAutoGroups applies current permissions before the current
// per-token limit. It intentionally does not fall back to the global Auto list.
func FilterUserTokenAutoGroups(userGroup string, groups []string) []string {
	maxCount := setting.GetMaxTokenAutoGroups()
	filtered := make([]string, 0, min(len(groups), maxCount))
	seen := make(map[string]struct{})
	for _, group := range groups {
		if !IsUserSelectableGroup(userGroup, group) {
			continue
		}
		if _, ok := seen[group]; ok {
			continue
		}
		seen[group] = struct{}{}
		filtered = append(filtered, group)
		if len(filtered) == maxCount {
			break
		}
	}
	return filtered
}

// GetRequestAutoGroups resolves the ordered Auto groups for the current token.
// The absence of the context value means that the token inherits the complete
// global Auto list; a present (even empty) value is an explicit token snapshot.
func GetRequestAutoGroups(c *gin.Context, userGroup string) []string {
	value, ok := common.GetContextKey(c, constant.ContextKeyTokenAutoGroups)
	if !ok {
		return GetUserAutoGroup(userGroup)
	}
	groups, ok := value.([]string)
	if !ok {
		return []string{}
	}
	return FilterUserTokenAutoGroups(userGroup, groups)
}

// ResolveRequestAutoGroups 解析本次请求实际生效的有序自动分组链路：
// "auto:<key>" 走具名链路配置，裸 "auto" 走令牌自带的候选快照并回退到全局 Auto 列表。
func ResolveRequestAutoGroups(c *gin.Context, userGroup, usingGroup string) []string {
	if strings.HasPrefix(usingGroup, setting.AutoGroupPrefix) {
		return GetUserAutoGroupChain(userGroup, usingGroup)
	}
	return GetRequestAutoGroups(c, userGroup)
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

// GetGroupsEnabledModels 按 groups 顺序获取各分组启用的模型并去重
func GetGroupsEnabledModels(groups []string) []string {
	seen := make(map[string]struct{})
	models := make([]string, 0)
	for _, group := range groups {
		for _, modelName := range model.GetGroupEnabledModels(group) {
			if _, ok := seen[modelName]; !ok {
				seen[modelName] = struct{}{}
				models = append(models, modelName)
			}
		}
	}
	return models
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
