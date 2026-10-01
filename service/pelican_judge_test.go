package service

import (
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPelicanSlotStartAlignsToShanghaiFifteenMinutes(t *testing.T) {
	loc := time.FixedZone("CST", 8*3600)
	now := time.Date(2026, 9, 28, 17, 24, 15, 0, loc)
	got := time.Unix(PelicanSlotStart(now), 0).In(loc)
	assert.Equal(t, 17, got.Hour())
	assert.Equal(t, 15, got.Minute())
	assert.Equal(t, 0, got.Second())

	same := time.Date(2026, 9, 28, 17, 29, 59, 0, loc)
	next := time.Date(2026, 9, 28, 17, 30, 0, 0, loc)
	assert.Equal(t, PelicanSlotStart(now), PelicanSlotStart(same))
	assert.Equal(t, PelicanSlotStart(now)+int64(pelicanSlot.Seconds()), PelicanSlotStart(next))

	utc := time.Date(2026, 9, 28, 9, 24, 15, 0, time.UTC)
	assert.Equal(t, PelicanSlotStart(now), PelicanSlotStart(utc))
}

func TestPelicanWindowSlots(t *testing.T) {
	loc := time.FixedZone("CST", 8*3600)
	now := time.Date(2026, 9, 28, 18, 7, 0, 0, loc)
	day := PelicanWindowSlots("24h", now)
	require.Len(t, day, 96)
	assert.Equal(t, PelicanSlotStart(now), day[len(day)-1])
	assert.Equal(t, int64(15*60), day[1]-day[0])
	assert.Equal(t, PelicanSlotStart(now)-int64(95*15*60), day[0])

	three := PelicanWindowSlots("3d", now)
	require.Len(t, three, 288)
	assert.Equal(t, day[len(day)-1], three[len(three)-1])
	assert.Equal(t, PelicanSlotStart(now)-int64(287*15*60), three[0])
}

func TestJudgeLogicAnswer(t *testing.T) {
	answer, pass := JudgeLogicAnswer("前面写了答案是29颗，但允许按形状选择时，最少是21颗。")
	assert.True(t, pass)
	assert.Equal(t, "21", answer)

	answer, pass = JudgeLogicAnswer("最少取出 21 个，后面又写了 12 个。")
	assert.False(t, pass)
	assert.Equal(t, "12", answer)

	answer, pass = JudgeLogicAnswer("所以最少取出20个。")
	assert.False(t, pass)
	assert.Equal(t, "20", answer)

	answer, pass = JudgeLogicAnswer("前面写了最少取出 20 个，但最终答案是 21")
	assert.True(t, pass)
	assert.Equal(t, "21", answer)

	answer, pass = JudgeLogicAnswer("我不会这道题")
	assert.False(t, pass)
	assert.Empty(t, answer)

	answer, pass = JudgeLogicAnswer("综上，答案为：\n\\[\n\\boxed{21\\text{个}}\n\\]\n如果不允许按形状选择，则需要29个。")
	assert.True(t, pass)
	assert.Equal(t, "21", answer)

	answer, pass = JudgeLogicAnswer("\\boxed{28+1=29}")
	assert.False(t, pass)
	assert.Equal(t, "29", answer)

	answer, pass = JudgeLogicAnswer("先写 \\boxed{20}，最终 \\boxed{21}。后面的补充是 12。")
	assert.True(t, pass)
	assert.Equal(t, "21", answer)

	answer, pass = JudgeLogicAnswer("\\[\n\\boxed{21\\text{颗：12颗五角星形＋9颗圆形}}\n\\]\n注意：如果**不允许利用手感选择形状，只能随机取出**，答案才是29颗。")
	assert.True(t, pass)
	assert.Equal(t, "21", answer)

	answer, pass = JudgeLogicAnswer("\\boxed{28+1=29\\text{个}}")
	assert.False(t, pass)
	assert.Equal(t, "29", answer)
}

func TestExtractDrawingHTML(t *testing.T) {
	html, ok := ExtractDrawingHTML("```html\n<!doctype html><html><body><svg viewBox=\"0 0 10 10\"></svg></body></html>\n```")
	require.True(t, ok)
	assert.Contains(t, html, "<svg")

	fragment, ok := ExtractDrawingHTML(`<svg viewBox="0 0 4 4"><circle r="1"/></svg>`)
	require.True(t, ok)
	assert.Contains(t, fragment, "<html>")

	scripted, ok := ExtractDrawingHTML(`<svg viewBox="0 0 4 4"></svg><script>document.body.addEventListener("click", function () {})</script>`)
	require.True(t, ok)
	assert.Contains(t, scripted, "<script>")

	canvas, ok := ExtractDrawingHTML("<canvas id=\"c\"></canvas><script>const c = document.querySelector(\"canvas\")</script>")
	require.True(t, ok)
	assert.Contains(t, canvas, "<canvas")
	assert.Contains(t, canvas, "<html>")

	_, ok = ExtractDrawingHTML(`<canvas></canvas><img src="https://example.com/a.png">`)
	assert.False(t, ok)

	_, ok = ExtractDrawingHTML(`<svg></svg>`)
	assert.False(t, ok)

	_, ok = ExtractDrawingHTML(`<svg viewBox="0 0 4 4"><image href="https://example.com/a.png"/></svg>`)
	assert.False(t, ok)

	named, ok := ExtractDrawingHTML(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>@keyframes spin { to { transform: rotate(360deg) } }</style></svg>`)
	require.True(t, ok)
	assert.Contains(t, named, "xmlns")
	assert.Contains(t, named, "@keyframes")

	scriptNS, ok := ExtractDrawingHTML(`<!DOCTYPE html><html><body><svg id="art" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"></svg><script>const NS = "http://www.w3.org/2000/svg"; document.createElementNS(NS, "circle");</script></body></html>`)
	require.True(t, ok)
	assert.Contains(t, scriptNS, "createElementNS")
	assert.Contains(t, scriptNS, "http://www.w3.org/2000/svg")

	httpsNS, ok := ExtractDrawingHTML(`<svg viewBox="0 0 4 4"></svg><script>document.createElementNS("https://www.w3.org/2000/svg", "g")</script>`)
	require.True(t, ok)
	assert.Contains(t, httpsNS, "https://www.w3.org/2000/svg")

	xlink, ok := ExtractDrawingHTML(`<svg xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 4 4"></svg>`)
	require.True(t, ok)
	assert.Contains(t, xlink, "xmlns:xlink")

	_, ok = ExtractDrawingHTML(`<svg viewBox="0 0 4 4" xmlns="http://www.w3.org/2000/svg"><image href="http://www.w3.org/2000/svg/logo.svg"/></svg>`)
	assert.False(t, ok)

	_, ok = ExtractDrawingHTML(`<svg viewBox="0 0 4 4"><a href="javascript:alert(1)"></a></svg>`)
	assert.False(t, ok)
}

func TestPelicanDrawingThemeIsStable(t *testing.T) {
	subject, vehicle, scene := PelicanDrawingTheme("codex", 1_700_000_000)
	againSubject, againVehicle, againScene := PelicanDrawingTheme("codex", 1_700_000_000)
	assert.Equal(t, subject, againSubject)
	assert.Equal(t, vehicle, againVehicle)
	assert.Equal(t, scene, againScene)
	assert.Contains(t, []string{"奥巴马", "孙悟空", "奥特曼", "鹈鹕", "北极熊"}, subject)
	assert.Contains(t, []string{"自行车", "热气球", "滑板", "摩托车"}, vehicle)
	assert.Contains(t, PelicanDrawingPrompt(subject, vehicle, scene), subject)

	seenSubjects := map[string]struct{}{}
	seenVehicles := map[string]struct{}{}
	seenScenes := map[string]struct{}{}
	base := int64(1_700_000_000)
	base -= base % int64(pelicanSlot.Seconds())
	var previousSubject, previousVehicle, previousScene string
	for i := int64(0); i < 60; i++ {
		picked, ride, place := PelicanDrawingTheme("codex", base+i*int64(pelicanSlot.Seconds()))
		if i > 0 {
			assert.NotEqual(t, previousSubject, picked)
			assert.NotEqual(t, previousVehicle, ride)
			assert.NotEqual(t, previousScene, place)
		}
		previousSubject, previousVehicle, previousScene = picked, ride, place
		seenSubjects[picked] = struct{}{}
		seenVehicles[ride] = struct{}{}
		seenScenes[place] = struct{}{}
	}
	assert.Len(t, seenSubjects, 5)
	assert.Len(t, seenVehicles, 4)
	assert.Len(t, seenScenes, 6)
}

func TestNormalizePelicanPrompts(t *testing.T) {
	prompt, err := NormalizePelicanLogicPrompt("  7 candies  ")
	require.NoError(t, err)
	assert.Equal(t, "7 candies", prompt)

	_, err = NormalizePelicanLogicPrompt(strings.Repeat("a", pelicanPromptLimit+1))
	require.Error(t, err)

	answer, err := NormalizePelicanLogicAnswer(" 21 ")
	require.NoError(t, err)
	assert.Equal(t, "21", answer)
	_, err = NormalizePelicanLogicAnswer("021")
	require.Error(t, err)
	_, err = NormalizePelicanLogicAnswer("21a")
	require.Error(t, err)

	_, err = NormalizePelicanDrawingPrompt("draw a cat")
	require.Error(t, err)
	drawing, err := NormalizePelicanDrawingPrompt(" {{subject}} on {{vehicle}} at {{scene}} ")
	require.NoError(t, err)
	assert.Equal(t, "{{subject}} on {{vehicle}} at {{scene}}", drawing)
}

func TestJudgeLogicAnswerUsesConfiguredNumber(t *testing.T) {
	answer, pass := judgeLogicAnswer("最终答案是 7", "7")
	assert.True(t, pass)
	assert.Equal(t, "7", answer)

	answer, pass = judgeLogicAnswer("最终答案是 7", "21")
	assert.False(t, pass)
	assert.Equal(t, "7", answer)
}

func TestPelicanDrawingPromptFillsCustomTemplate(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{
		"PelicanDrawingPrompt": "{{subject}}骑{{vehicle}}在{{scene}}",
		"PelicanLogicPrompt":   "custom question",
		"PelicanLogicAnswer":   "7",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})

	assert.Equal(t, "孙悟空骑自行车在海边", PelicanDrawingPrompt("孙悟空", "自行车", "海边"))
	assert.Equal(t, "custom question", PelicanLogicPrompt())
	assert.Equal(t, "7", PelicanExpectedAnswer())
}
