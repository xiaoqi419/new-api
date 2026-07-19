package setting

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

var autoGroups = []string{
	"default",
}

var DefaultUseAutoGroup = false

// AutoGroupPrefix is the token-group prefix that denotes a named auto route,
// e.g. token group "auto:fast" maps to the route with Key "fast".
const AutoGroupPrefix = "auto:"

// AutoGroupRoute is a named auto-dispatch route. Each route resolves to an
// ordered chain of real groups that channel selection walks in order.
type AutoGroupRoute struct {
	Key            string   `json:"key"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Groups         []string `json:"groups"`
	Enabled        bool     `json:"enabled"`
	UserSelectable bool     `json:"user_selectable"`
}

var autoGroupRoutes = make([]AutoGroupRoute, 0)

func ContainsAutoGroup(group string) bool {
	for _, autoGroup := range autoGroups {
		if autoGroup == group {
			return true
		}
	}
	return false
}

func UpdateAutoGroupsByJsonString(jsonString string) error {
	autoGroups = make([]string, 0)
	return common.Unmarshal([]byte(jsonString), &autoGroups)
}

func AutoGroups2JsonString() string {
	jsonBytes, err := common.Marshal(autoGroups)
	if err != nil {
		return "[]"
	}
	return string(jsonBytes)
}

func GetAutoGroups() []string {
	return autoGroups
}

func UpdateAutoGroupRoutesByJsonString(jsonString string) error {
	routes := make([]AutoGroupRoute, 0)
	if err := common.Unmarshal([]byte(jsonString), &routes); err != nil {
		return err
	}
	autoGroupRoutes = routes
	return nil
}

func AutoGroupRoutes2JsonString() string {
	jsonBytes, err := common.Marshal(autoGroupRoutes)
	if err != nil {
		return "[]"
	}
	return string(jsonBytes)
}

func GetAutoGroupRoutes() []AutoGroupRoute {
	return autoGroupRoutes
}

// GetAutoGroupRoute returns the route whose Key matches the given key
// (the part after the "auto:" prefix) and whether it was found.
func GetAutoGroupRoute(key string) (AutoGroupRoute, bool) {
	for _, route := range autoGroupRoutes {
		if route.Key == key {
			return route, true
		}
	}
	return AutoGroupRoute{}, false
}

// IsAutoGroup reports whether a token group denotes an auto route: the legacy
// "auto" group or a named "auto:<key>" route.
func IsAutoGroup(group string) bool {
	return group == "auto" || strings.HasPrefix(group, AutoGroupPrefix)
}

// ResolveAutoGroupChain returns the ordered real-group chain for a token group.
// "auto" resolves to the legacy AutoGroups list; "auto:<key>" resolves to the
// matching route's Groups only when that route exists and is enabled.
func ResolveAutoGroupChain(tokenGroup string) []string {
	if tokenGroup == "auto" {
		return autoGroups
	}
	if strings.HasPrefix(tokenGroup, AutoGroupPrefix) {
		key := strings.TrimPrefix(tokenGroup, AutoGroupPrefix)
		if route, ok := GetAutoGroupRoute(key); ok && route.Enabled {
			return route.Groups
		}
	}
	return nil
}
