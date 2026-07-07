package ui_setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type ApimartHomeHero struct {
	Title               string `json:"title"`
	Subtitle            string `json:"subtitle"`
	Subnote             string `json:"subnote"`
	PrimaryButtonText   string `json:"primary_button_text"`
	SecondaryButtonText string `json:"secondary_button_text"`
}

type ApimartHomeStat struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type ApimartHomeModel struct {
	Name   string `json:"name"`
	Vendor string `json:"vendor"`
	Price  string `json:"price"`
	Size   string `json:"size"`
	Tone   string `json:"tone"`
	Icon   string `json:"icon"`
	Image  string `json:"image"`
}

type ApimartHomeStep struct {
	Step        string `json:"step"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type ApimartHomeAPIUseCase struct {
	Name        string   `json:"name"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Bullets     []string `json:"bullets"`
	Button      string   `json:"button"`
	Image       string   `json:"image"`
}

type ApimartHomeSectionTitles struct {
	HotModels     string `json:"hot_models"`
	Steps         string `json:"steps"`
	StepsSubtitle string `json:"steps_subtitle"`
	APIUseCases   string `json:"api_use_cases"`
	ValueProps    string `json:"value_props"`
	Providers     string `json:"providers"`
	FAQ           string `json:"faq"`
}

type ApimartHomeValueProp struct {
	Index       string `json:"index"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type ApimartHomeProvider struct {
	Name string `json:"name"`
	Icon string `json:"icon"`
}

type ApimartHomeFAQ struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

type ApimartHomeSetting struct {
	Hero           ApimartHomeHero          `json:"hero"`
	SectionTitles  ApimartHomeSectionTitles `json:"section_titles"`
	Stats          []ApimartHomeStat        `json:"stats"`
	FeaturedModels []ApimartHomeModel       `json:"featured_models"`
	Steps          []ApimartHomeStep        `json:"steps"`
	APIUseCases    []ApimartHomeAPIUseCase  `json:"api_use_cases"`
	ValueProps     []ApimartHomeValueProp   `json:"value_props"`
	Providers      []ApimartHomeProvider    `json:"providers"`
	FAQ            []ApimartHomeFAQ         `json:"faq"`
}

var defaultApimartHome = ApimartHomeSetting{
	Hero: ApimartHomeHero{
		Title:               "统一 AI API 折扣聚合平台",
		Subtitle:            "一个 API 满足所有需求 · 节省 30-70%",
		Subnote:             "一个端点 · 百种模型 · 无限可能",
		PrimaryButtonText:   "获取 API 密钥",
		SecondaryButtonText: "API 文档",
	},
	SectionTitles: ApimartHomeSectionTitles{
		HotModels:     "热门 AI API 模型",
		Steps:         "3 个简单步骤集成 {site} API",
		StepsSubtitle: "几分钟内即可开始使用数百种 AI 模型",
		APIUseCases:   "适合任何项目的 API",
		ValueProps:    "为什么选择 {site} 作为您的 AI API 平台",
		Providers:     "所有模型均可使用",
		FAQ:           "常见问题",
	},
	Stats: []ApimartHomeStat{
		{Value: "100+", Label: "AI模型"},
		{Value: "99.9%", Label: "在线率"},
		{Value: "<50ms", Label: "全球延迟"},
		{Value: "70%", Label: "成本节省"},
	},
	FeaturedModels: []ApimartHomeModel{
		{Name: "Nano Banana 2 API", Vendor: "Gemini", Price: "$0.025", Size: "small", Tone: "cyan", Icon: "gemini"},
		{Name: "Seedream 5.0 Lite API", Vendor: "ByteDance", Price: "$0.025", Size: "small", Tone: "blue", Icon: "volcengine"},
		{Name: "SkyReels V4 API", Vendor: "SkyReels", Price: "Coming Soon", Size: "wide", Tone: "green", Icon: "spark"},
		{Name: "Seedream 4.5 API", Vendor: "ByteDance", Price: "$0.025", Size: "small", Tone: "teal", Icon: "volcengine"},
		{Name: "Sora 2 API", Vendor: "OpenAI", Price: "$0.025", Size: "small", Tone: "orange", Icon: "openai"},
		{Name: "Sora 2 Pro API", Vendor: "OpenAI", Price: "$1", Size: "large", Tone: "violet", Icon: "openai"},
		{Name: "Veo 3.1 API", Vendor: "Google", Price: "$0.08", Size: "large", Tone: "pink", Icon: "gemini"},
	},
	Steps: []ApimartHomeStep{
		{Step: "01", Title: "创建 API 密钥", Description: "注册账户，在控制台生成专属 API 密钥。"},
		{Step: "02", Title: "更新 Base URL", Description: "OpenAI SDK 用户只需要替换接口地址。"},
		{Step: "03", Title: "开始使用 AI 模型", Description: "通过统一接口调用 GPT、Claude、Sora 等模型。"},
	},
	APIUseCases: []ApimartHomeAPIUseCase{
		{
			Name:        "Chat API",
			Title:       "AI聊天API - 访问100+领先的语言模型",
			Description: "通过一个 API 访问 GPT、Claude、DeepSeek、Qwen 等主流聊天模型，保持 OpenAI 兼容请求格式。",
			Bullets:     []string{"统一鉴权、计费和日志", "支持流式输出、视觉输入和工具调用"},
			Button:      "探索聊天 API",
			Image:       "/cover-4.webp",
		},
		{
			Name:        "Image API",
			Title:       "图像API - 接入主流图像生成能力",
			Description: "统一管理图像生成渠道，用同一套账户、密钥和计费体系服务创意生产场景。",
			Bullets:     []string{"统一任务提交和结果查询", "支持多渠道成本和可用性切换"},
			Button:      "探索图像 API",
			Image:       "/cover-2.webp",
		},
		{
			Name:        "Video API",
			Title:       "视频API - 管理异步生成任务",
			Description: "把视频生成、任务状态、结果预览和额度消耗放进同一套控制台流程。",
			Bullets:     []string{"适配异步任务工作流", "日志、额度和失败原因集中追踪"},
			Button:      "探索视频 API",
			Image:       "/cover-3.webp",
		},
	},
	ValueProps: []ApimartHomeValueProp{
		{Index: "01", Title: "成本低于竞争对手", Description: "对接多家上游渠道，按模型和场景选择更低成本路径。"},
		{Index: "02", Title: "100+ AI模型，一个API", Description: "聊天、图像、视频、嵌入和重排模型都走同一套接入方式。"},
		{Index: "03", Title: "OpenAI兼容格式", Description: "现有 OpenAI SDK 只需替换 Base URL 和 API Key。"},
		{Index: "04", Title: "高性能与可靠性", Description: "渠道健康检查、优先级、权重和自动禁用机制保障可用性。"},
		{Index: "05", Title: "开发友好的文档", Description: "统一接口、日志和控制台让接入、排障、计费更清晰。"},
		{Index: "06", Title: "灵活凭证与计费", Description: "支持令牌、分组、额度、订阅、充值、兑换码和倍率策略。"},
	},
	Providers: []ApimartHomeProvider{
		{Name: "ANTHROPIC", Icon: "claude"},
		{Name: "OpenAI", Icon: "openai"},
		{Name: "Google", Icon: "gemini"},
		{Name: "DeepSeek", Icon: "deepseek"},
		{Name: "Qwen", Icon: "qwen"},
		{Name: "ByteDance", Icon: "volcengine"},
		{Name: "Azure AI", Icon: "azure"},
		{Name: "Midjourney", Icon: "midjourney"},
		{Name: "Grok", Icon: "grok"},
		{Name: "MiniMax", Icon: "minimax"},
		{Name: "Wenxin", Icon: "wenxin"},
		{Name: "Spark", Icon: "spark"},
	},
	FAQ: []ApimartHomeFAQ{
		{Question: "什么是 AI API 聚合平台？", Answer: "它把多家模型供应商接入到统一 API 中，开发者用一个密钥和一个 Base URL 访问多种模型。"},
		{Question: "新手能快速接入吗？", Answer: "可以。创建密钥、替换 Base URL、选择模型后即可开始调用。"},
		{Question: "与 OpenAI API 兼容性如何？", Answer: "聊天接口保持 OpenAI 兼容格式，现有 SDK 迁移成本较低。"},
		{Question: "如何接入到我的应用中？", Answer: "在应用里配置平台提供的 API Key 和 Base URL，然后按模型名称发起请求。"},
		{Question: "相比直接使用模型供应商，为什么选择聚合平台？", Answer: "聚合平台能统一管理模型、密钥、额度、日志和渠道容灾，降低接入与运维成本。"},
		{Question: "我的 API Key 安全吗？", Answer: "密钥由系统统一管理，管理员可配置用户权限、模型限制、额度和访问策略。"},
	},
}

func DefaultApimartHome() ApimartHomeSetting {
	return defaultApimartHome
}

func GetApimartHome() ApimartHomeSetting {
	return ValidateApimartHome(uiSetting.ApimartHome)
}

func ApimartHomeJSONString() string {
	b, err := common.Marshal(GetApimartHome())
	if err != nil {
		return "{}"
	}
	return string(b)
}

func ValidateApimartHomeJSONString(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = ApimartHomeJSONString()
	}

	var home ApimartHomeSetting
	if err := common.UnmarshalJsonStr(raw, &home); err != nil {
		return "", fmt.Errorf("APIMart 首页配置格式错误: %s", err.Error())
	}

	normalized := ValidateApimartHome(home)
	b, err := common.Marshal(normalized)
	if err != nil {
		return "", fmt.Errorf("APIMart 首页配置序列化失败: %s", err.Error())
	}
	return string(b), nil
}

func ValidateApimartHome(home ApimartHomeSetting) ApimartHomeSetting {
	normalized := home

	normalized.Hero.Title = textOrDefault(normalized.Hero.Title, defaultApimartHome.Hero.Title)
	normalized.Hero.Subtitle = textOrDefault(normalized.Hero.Subtitle, defaultApimartHome.Hero.Subtitle)
	normalized.Hero.Subnote = textOrDefault(normalized.Hero.Subnote, defaultApimartHome.Hero.Subnote)
	normalized.Hero.PrimaryButtonText = textOrDefault(normalized.Hero.PrimaryButtonText, defaultApimartHome.Hero.PrimaryButtonText)
	normalized.Hero.SecondaryButtonText = textOrDefault(normalized.Hero.SecondaryButtonText, defaultApimartHome.Hero.SecondaryButtonText)
	normalized.SectionTitles.HotModels = textOrDefault(normalized.SectionTitles.HotModels, defaultApimartHome.SectionTitles.HotModels)
	normalized.SectionTitles.Steps = textOrDefault(normalized.SectionTitles.Steps, defaultApimartHome.SectionTitles.Steps)
	normalized.SectionTitles.StepsSubtitle = textOrDefault(normalized.SectionTitles.StepsSubtitle, defaultApimartHome.SectionTitles.StepsSubtitle)
	normalized.SectionTitles.APIUseCases = textOrDefault(normalized.SectionTitles.APIUseCases, defaultApimartHome.SectionTitles.APIUseCases)
	normalized.SectionTitles.ValueProps = textOrDefault(normalized.SectionTitles.ValueProps, defaultApimartHome.SectionTitles.ValueProps)
	normalized.SectionTitles.Providers = textOrDefault(normalized.SectionTitles.Providers, defaultApimartHome.SectionTitles.Providers)
	normalized.SectionTitles.FAQ = textOrDefault(normalized.SectionTitles.FAQ, defaultApimartHome.SectionTitles.FAQ)

	if len(normalized.Stats) == 0 {
		normalized.Stats = defaultApimartHome.Stats
	}
	if len(normalized.FeaturedModels) == 0 {
		normalized.FeaturedModels = defaultApimartHome.FeaturedModels
	}
	if len(normalized.Steps) == 0 {
		normalized.Steps = defaultApimartHome.Steps
	}
	if len(normalized.APIUseCases) == 0 {
		normalized.APIUseCases = defaultApimartHome.APIUseCases
	}
	if len(normalized.ValueProps) == 0 {
		normalized.ValueProps = defaultApimartHome.ValueProps
	}
	if len(normalized.Providers) == 0 {
		normalized.Providers = defaultApimartHome.Providers
	}
	if len(normalized.FAQ) == 0 {
		normalized.FAQ = defaultApimartHome.FAQ
	}

	for i := range normalized.FeaturedModels {
		normalized.FeaturedModels[i].Size = enumStringOrDefault(
			normalized.FeaturedModels[i].Size,
			defaultApimartHome.FeaturedModels[0].Size,
			map[string]bool{"small": true, "wide": true, "large": true},
		)
		normalized.FeaturedModels[i].Tone = enumStringOrDefault(
			normalized.FeaturedModels[i].Tone,
			defaultApimartHome.FeaturedModels[0].Tone,
			map[string]bool{"cyan": true, "blue": true, "green": true, "teal": true, "orange": true, "violet": true, "pink": true},
		)
	}

	return normalized
}

func textOrDefault(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func enumStringOrDefault(value, fallback string, allowed map[string]bool) string {
	value = strings.TrimSpace(value)
	if allowed[value] {
		return value
	}
	return fallback
}
