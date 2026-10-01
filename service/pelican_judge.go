package service

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const (
	PelicanLogicAnswer = "21"
	pelicanSlot        = 15 * time.Minute
	pelicanPromptLimit = 8000
	pelicanAnswerLimit = 12
)

const pelicanLogicPrompt = "在一个黑色的袋子里装有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）\n苹果味 桃子味 西瓜味\n圆形 7 9 8\n五角星形 7 6 4"

const pelicanDrawingTemplate = "请直接返回完整的单文件HTML代码：用内联SVG或Canvas画{{subject}}骑着{{vehicle}}在{{scene}}。画面要持续播放动画，点击画面要有看得见的变化，可以用页面内脚本。如果用SVG，必须有viewBox。不要用外部资源、远程地址或Markdown代码块。"

var (
	pelicanSubjects       = []string{"奥巴马", "孙悟空", "奥特曼", "鹈鹕", "北极熊"}
	pelicanVehicles       = []string{"自行车", "热气球", "滑板", "摩托车"}
	pelicanScenes         = []string{"湖边", "沙漠", "彩虹下", "海边", "雪山", "城市夜景"}
	pelicanTrailingNumber = regexp.MustCompile(`\d+`)
	pelicanNamespaceURL   = regexp.MustCompile(`(?i)https?://www\.w3\.org/(?:2000/svg|1999/xlink)/?([^A-Za-z0-9/._~:?&=%+-]|$)`)
)

func pelicanLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("CST", 8*3600)
	}
	return loc
}

// PelicanSlotStart is the Shanghai fifteen-minute bucket that contains now.
func PelicanSlotStart(now time.Time) int64 {
	loc := pelicanLocation()
	local := now.In(loc)
	slotMinutes := int(pelicanSlot / time.Minute)
	minute := local.Minute() - (local.Minute() % slotMinutes)
	slot := time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), minute, 0, 0, loc)
	return slot.Unix()
}

// PelicanWindowSlots returns the fifteen-minute starts covered by 24h or 3d, ending at the current slot.
func PelicanWindowSlots(window string, now time.Time) []int64 {
	span := 24 * time.Hour
	if window == "3d" {
		span = 72 * time.Hour
	}
	count := int(span / pelicanSlot)
	current := PelicanSlotStart(now)
	slots := make([]int64, count)
	for i := 0; i < count; i++ {
		slots[i] = current - int64(count-1-i)*int64(pelicanSlot.Seconds())
	}
	return slots
}

func pelicanOption(key string) string {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	return strings.TrimSpace(common.OptionMap[key])
}

func PelicanLogicPrompt() string {
	custom := pelicanOption("PelicanLogicPrompt")
	if custom == "" {
		return pelicanLogicPrompt
	}
	return custom
}

func PelicanExpectedAnswer() string {
	custom := pelicanOption("PelicanLogicAnswer")
	if custom == "" {
		return PelicanLogicAnswer
	}
	return custom
}

func PelicanDrawingTheme(group string, slot int64) (subject, vehicle, scene string) {
	step := slot / int64(pelicanSlot.Seconds())
	if step < 0 {
		step = -step
	}
	mix := int64(0)
	for _, r := range group {
		mix += int64(r)
	}
	if mix < 0 {
		mix = -mix
	}
	pick := step + mix
	subject = pelicanSubjects[int(pick%int64(len(pelicanSubjects)))]
	vehicle = pelicanVehicles[int(pick%int64(len(pelicanVehicles)))]
	scene = pelicanScenes[int(pick%int64(len(pelicanScenes)))]
	return subject, vehicle, scene
}

func PelicanDrawingPrompt(subject, vehicle, scene string) string {
	template := pelicanOption("PelicanDrawingPrompt")
	if template == "" {
		template = pelicanDrawingTemplate
	}
	return strings.NewReplacer(
		"{{subject}}", subject,
		"{{vehicle}}", vehicle,
		"{{scene}}", scene,
	).Replace(template)
}

func NormalizePelicanLogicPrompt(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if utf8.RuneCountInString(raw) > pelicanPromptLimit {
		return "", errors.New("logic question is too long")
	}
	return raw, nil
}

func NormalizePelicanLogicAnswer(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if len(raw) > pelicanAnswerLimit || (len(raw) > 1 && raw[0] == '0') {
		return "", errors.New("logic answer must be a number")
	}
	for _, r := range raw {
		if r < '0' || r > '9' {
			return "", errors.New("logic answer must be a number")
		}
	}
	return raw, nil
}

func NormalizePelicanDrawingPrompt(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if utf8.RuneCountInString(raw) > pelicanPromptLimit {
		return "", errors.New("drawing prompt is too long")
	}
	for _, token := range []string{"{{subject}}", "{{vehicle}}", "{{scene}}"} {
		if !strings.Contains(raw, token) {
			return "", errors.New("drawing prompt must include {{subject}}, {{vehicle}}, and {{scene}}")
		}
	}
	return raw, nil
}

// JudgeLogicAnswer prefers the last \boxed{}.
// A number written before \text is the declared count; digits inside that text are only the breakdown.
// Without \text, the last number in the box is the answer. A number after the box is another scenario.
func JudgeLogicAnswer(reply string) (answer string, pass bool) {
	return judgeLogicAnswer(reply, PelicanExpectedAnswer())
}

func judgeLogicAnswer(reply, expected string) (answer string, pass bool) {
	answer = pelicanBoxedAnswer(reply)
	if answer == "" {
		matches := pelicanTrailingNumber.FindAllString(reply, -1)
		if len(matches) == 0 {
			return "", false
		}
		answer = matches[len(matches)-1]
	}
	return answer, answer == expected
}

func pelicanBoxedAnswer(reply string) string {
	const marker = `\boxed`
	last := ""
	for {
		index := strings.Index(reply, marker)
		if index < 0 {
			return last
		}
		reply = reply[index+len(marker):]
		reply = strings.TrimLeft(reply, " \t\r\n")
		if !strings.HasPrefix(reply, "{") {
			continue
		}
		reply = reply[1:]
		depth := 1
		end := -1
		for i := 0; i < len(reply); i++ {
			switch reply[i] {
			case '{':
				depth++
			case '}':
				depth--
				if depth == 0 {
					end = i
				}
			}
			if end >= 0 {
				break
			}
		}
		if end < 0 {
			return last
		}
		body := reply[:end]
		chosen := ""
		if textAt := strings.Index(body, `\text`); textAt >= 0 {
			before := pelicanTrailingNumber.FindAllString(body[:textAt], -1)
			if len(before) > 0 {
				chosen = before[len(before)-1]
			}
		}
		if chosen == "" {
			nums := pelicanTrailingNumber.FindAllString(body, -1)
			if len(nums) > 0 {
				chosen = nums[len(nums)-1]
			}
		}
		if chosen != "" {
			last = chosen
		}
		reply = reply[end+1:]
	}
}

// ExtractDrawingHTML keeps one inline drawing. SVG with a viewBox, or a canvas, is a pass.
// Inline scripts stay so the sandbox can animate and take clicks. Remote URLs are rejected.
// W3C SVG and XLink namespace URLs are not remote assets, even inside script strings.
func ExtractDrawingHTML(reply string) (string, bool) {
	text := stripCodeFence(strings.TrimSpace(reply))
	if text == "" || strings.Contains(strings.ToLower(text), "javascript:") {
		return "", false
	}
	withoutNamespace := pelicanNamespaceURL.ReplaceAllString(text, "$1")
	lower := strings.ToLower(withoutNamespace)
	if strings.Contains(lower, "http://") || strings.Contains(lower, "https://") {
		return "", false
	}
	hasCanvas := strings.Contains(lower, "<canvas")
	hasSVG := strings.Contains(lower, "<svg") && strings.Contains(lower, "viewbox")
	if !hasCanvas && !hasSVG {
		return "", false
	}
	if !strings.Contains(lower, "<html") {
		text = "<!doctype html><html><body>" + text + "</body></html>"
	}
	return text, true
}

func stripCodeFence(text string) string {
	if !strings.HasPrefix(text, "```") {
		return text
	}
	rest := text[3:]
	if index := strings.IndexByte(rest, '\n'); index >= 0 {
		rest = rest[index+1:]
	}
	rest = strings.TrimSpace(rest)
	rest = strings.TrimSuffix(rest, "```")
	return strings.TrimSpace(rest)
}

func clipPelicanText(value string, max int) string {
	if max <= 0 || len(value) <= max {
		return value
	}
	cut := value[:max]
	for len(cut) > 0 && cut[len(cut)-1]&0xC0 == 0x80 {
		cut = cut[:len(cut)-1]
	}
	return cut
}
