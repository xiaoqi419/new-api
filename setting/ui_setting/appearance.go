package ui_setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	PresetClassic = "classic"
	PresetApimart = "apimart"

	ColorModeLight = "light"
	ColorModeDark  = "dark"
	ColorModeAuto  = "auto"

	ConsoleLayoutSidebar = "sidebar"
	ConsoleLayoutTopnav  = "topnav"
	ConsoleLayoutHybrid  = "hybrid"

	FooterVariantDefault  = "default"
	FooterVariantWordmark = "wordmark"

	ContentWidthNormal  = "normal"
	ContentWidthCompact = "compact"
	ContentWidthWide    = "wide"
)

type AppearanceSetting struct {
	Preset             string `json:"preset"`
	ColorMode          string `json:"color_mode"`
	ConsoleLayout      string `json:"console_layout"`
	AllowUserColorMode bool   `json:"allow_user_color_mode"`
	FooterVariant      string `json:"footer_variant"`
	ContentWidth       string `json:"content_width"`
}

type UISetting struct {
	Appearance  AppearanceSetting  `json:"appearance"`
	ApimartHome ApimartHomeSetting `json:"apimart_home"`
}

// classicAppearance 用作各字段为空时的回退基线（语义稳定）。
var classicAppearance = AppearanceSetting{
	Preset:             PresetClassic,
	ColorMode:          ColorModeAuto,
	ConsoleLayout:      ConsoleLayoutSidebar,
	AllowUserColorMode: false,
	FooterVariant:      FooterVariantDefault,
	ContentWidth:       ContentWidthNormal,
}

// apimartAppearance 为本项目默认外观（开箱即 apimart）。
var apimartAppearance = AppearanceSetting{
	Preset:             PresetApimart,
	ColorMode:          ColorModeLight,
	ConsoleLayout:      ConsoleLayoutSidebar,
	AllowUserColorMode: true,
	FooterVariant:      FooterVariantWordmark,
	ContentWidth:       ContentWidthWide,
}

var defaultAppearance = classicAppearance

var uiSetting = UISetting{
	Appearance:  apimartAppearance,
	ApimartHome: defaultApimartHome,
}

func init() {
	config.GlobalConfig.Register("ui_setting", &uiSetting)
}

func DefaultAppearance() AppearanceSetting {
	return apimartAppearance
}

func GetAppearance() AppearanceSetting {
	appearance, err := ValidateAppearance(uiSetting.Appearance)
	if err != nil {
		return apimartAppearance
	}
	return appearance
}

func AppearanceJSONString() string {
	b, err := common.Marshal(GetAppearance())
	if err != nil {
		return "{}"
	}
	return string(b)
}

func ValidateAppearanceJSONString(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = AppearanceJSONString()
	}

	var appearance AppearanceSetting
	if err := common.UnmarshalJsonStr(raw, &appearance); err != nil {
		return "", fmt.Errorf("外观主题配置格式错误: %s", err.Error())
	}

	normalized, err := ValidateAppearance(appearance)
	if err != nil {
		return "", err
	}

	b, err := common.Marshal(normalized)
	if err != nil {
		return "", fmt.Errorf("外观主题配置序列化失败: %s", err.Error())
	}
	return string(b), nil
}

func ValidateAppearance(appearance AppearanceSetting) (AppearanceSetting, error) {
	var err error
	normalized := appearance

	normalized.Preset, err = validateEnum("UI 主题", normalized.Preset, defaultAppearance.Preset, map[string]bool{
		PresetClassic: true,
		PresetApimart: true,
	})
	if err != nil {
		return defaultAppearance, err
	}

	normalized.ColorMode, err = validateEnum("颜色模式", normalized.ColorMode, defaultAppearance.ColorMode, map[string]bool{
		ColorModeLight: true,
		ColorModeDark:  true,
		ColorModeAuto:  true,
	})
	if err != nil {
		return defaultAppearance, err
	}

	normalized.ConsoleLayout, err = validateEnum("控制台布局", normalized.ConsoleLayout, defaultAppearance.ConsoleLayout, map[string]bool{
		ConsoleLayoutSidebar: true,
		ConsoleLayoutTopnav:  true,
		ConsoleLayoutHybrid:  true,
	})
	if err != nil {
		return defaultAppearance, err
	}

	normalized.FooterVariant, err = validateEnum("页脚样式", normalized.FooterVariant, defaultAppearance.FooterVariant, map[string]bool{
		FooterVariantDefault:  true,
		FooterVariantWordmark: true,
	})
	if err != nil {
		return defaultAppearance, err
	}

	normalized.ContentWidth, err = validateEnum("内容宽度", normalized.ContentWidth, defaultAppearance.ContentWidth, map[string]bool{
		ContentWidthNormal:  true,
		ContentWidthCompact: true,
		ContentWidthWide:    true,
	})
	if err != nil {
		return defaultAppearance, err
	}

	return normalized, nil
}

func validateEnum(name, value, fallback string, allowed map[string]bool) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	if !allowed[value] {
		return "", fmt.Errorf("%s不合法: %s", name, value)
	}
	return value, nil
}
