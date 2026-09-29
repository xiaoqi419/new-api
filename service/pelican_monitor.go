package service

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	pelicanLogicTimeout   = 3 * time.Minute
	pelicanDrawingTimeout = 6 * time.Minute
	pelicanStaleAfter     = 8 * time.Minute
	pelicanParallelGroups = 2
	pelicanReasoning      = "medium"
)

var (
	pelicanRoundMu sync.Mutex
	pelicanHTTP    = &http.Client{Timeout: pelicanDrawingTimeout + 15*time.Second}
)

type PelicanTarget struct {
	Group       string
	Description string
	Model       string
	Key         string
	Ratio       float64
	HasKey      bool
}

type PelicanDashboard struct {
	UpdatedAt     int64              `json:"updated_at"`
	Range         string             `json:"range"`
	NextSlotAt    int64              `json:"next_slot_at"`
	LogicPassRate *float64           `json:"logic_pass_rate"`
	LogicAnswer   string             `json:"logic_answer"`
	Enabled       bool               `json:"enabled"`
	Settings      *PelicanSettings   `json:"settings,omitempty"`
	Summary       PelicanSummary     `json:"summary"`
	Groups        []PelicanGroupCard `json:"groups"`
}

func PelicanMonitorActive() bool {
	if strings.EqualFold(os.Getenv("PELICAN_MONITOR"), "off") {
		return false
	}
	return common.PelicanMonitorEnabled
}

type PelicanGroupChoice struct {
	Group string `json:"group"`
	Model string `json:"model,omitempty"`
}

type PelicanCatalogGroup struct {
	Name   string   `json:"name"`
	Models []string `json:"models"`
}

func NormalizePelicanGroups(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return "[]", nil
	}
	var items []any
	if err := common.UnmarshalJsonStr(raw, &items); err != nil {
		return "", errors.New("monitored groups must be a JSON array")
	}
	if len(items) > 100 {
		return "", errors.New("too many monitored groups")
	}
	seen := make(map[string]struct{}, len(items))
	clean := make([]PelicanGroupChoice, 0, len(items))
	for _, item := range items {
		var choice PelicanGroupChoice
		switch value := item.(type) {
		case string:
			choice.Group = value
		case map[string]any:
			group, ok := value["group"].(string)
			if !ok {
				return "", errors.New("invalid monitored group name")
			}
			choice.Group = group
			if modelValue, exists := value["model"]; exists && modelValue != nil {
				modelName, modelOK := modelValue.(string)
				if !modelOK {
					return "", errors.New("invalid monitored model")
				}
				choice.Model = modelName
			}
		default:
			return "", errors.New("invalid monitored group")
		}
		choice.Group = strings.TrimSpace(choice.Group)
		choice.Model = strings.TrimSpace(choice.Model)
		if choice.Group == "" || len(choice.Group) > 64 {
			return "", errors.New("invalid monitored group name")
		}
		if len(choice.Model) > 255 || strings.ContainsAny(choice.Model, "\r\n") {
			return "", errors.New("invalid monitored model")
		}
		if _, ok := seen[choice.Group]; ok {
			continue
		}
		seen[choice.Group] = struct{}{}
		clean = append(clean, choice)
	}
	if len(clean) == 0 {
		return "[]", nil
	}
	encoded, err := common.Marshal(clean)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func PelicanMonitorChoices() []PelicanGroupChoice {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap["PelicanMonitorGroups"]
	common.OptionMapRWMutex.RUnlock()
	normalized, err := NormalizePelicanGroups(raw)
	if err != nil {
		return nil
	}
	var choices []PelicanGroupChoice
	if err = common.UnmarshalJsonStr(normalized, &choices); err != nil || len(choices) == 0 {
		return nil
	}
	return choices
}

func PelicanMonitorAllowlist() []string {
	choices := PelicanMonitorChoices()
	if len(choices) == 0 {
		return nil
	}
	names := make([]string, 0, len(choices))
	for _, choice := range choices {
		names = append(names, choice.Group)
	}
	return names
}

func PelicanGroupMonitored(group string) bool {
	return pelicanGroupAllowed(group, PelicanMonitorAllowlist())
}

type PelicanSettings struct {
	Enabled              bool                  `json:"enabled"`
	Groups               []PelicanGroupChoice  `json:"groups"`
	Catalog              []PelicanCatalogGroup `json:"catalog"`
	LogicPrompt          string                `json:"logic_prompt"`
	LogicPromptDefault   string                `json:"logic_prompt_default"`
	LogicAnswer          string                `json:"logic_answer"`
	LogicAnswerDefault   string                `json:"logic_answer_default"`
	DrawingPrompt        string                `json:"drawing_prompt"`
	DrawingPromptDefault string                `json:"drawing_prompt_default"`
}

func PelicanSettingsView() PelicanSettings {
	choices := PelicanMonitorChoices()
	if choices == nil {
		choices = []PelicanGroupChoice{}
	}
	return PelicanSettings{
		Enabled:              common.PelicanMonitorEnabled,
		Groups:               choices,
		Catalog:              pelicanGroupCatalog(),
		LogicPrompt:          pelicanOption("PelicanLogicPrompt"),
		LogicPromptDefault:   pelicanLogicPrompt,
		LogicAnswer:          pelicanOption("PelicanLogicAnswer"),
		LogicAnswerDefault:   PelicanLogicAnswer,
		DrawingPrompt:        pelicanOption("PelicanDrawingPrompt"),
		DrawingPromptDefault: pelicanDrawingTemplate,
	}
}

func pelicanGroupCatalog() []PelicanCatalogGroup {
	names, err := model.ListEnabledAbilityGroups()
	if err != nil {
		common.SysError("pelican monitor catalog: " + err.Error())
		return []PelicanCatalogGroup{}
	}
	sort.Strings(names)
	catalog := make([]PelicanCatalogGroup, 0, len(names))
	for _, name := range names {
		seen := make(map[string]struct{})
		models := make([]string, 0)
		for _, modelName := range model.GetGroupEnabledModels(name) {
			modelName = strings.TrimSpace(modelName)
			if modelName == "" {
				continue
			}
			if _, ok := seen[modelName]; ok {
				continue
			}
			seen[modelName] = struct{}{}
			models = append(models, modelName)
		}
		sort.Strings(models)
		catalog = append(catalog, PelicanCatalogGroup{Name: name, Models: models})
	}
	return catalog
}

func EmptyPelicanDashboard(window string, now time.Time) *PelicanDashboard {
	if window != "3d" {
		window = "24h"
	}
	return &PelicanDashboard{
		UpdatedAt:   now.Unix(),
		Range:       window,
		NextSlotAt:  PelicanSlotStart(now) + int64(pelicanSlot.Seconds()),
		LogicAnswer: PelicanExpectedAnswer(),
		Groups:      []PelicanGroupCard{},
	}
}

func pelicanGroupAllowed(group string, allow []string) bool {
	if len(allow) == 0 {
		return true
	}
	for _, name := range allow {
		if name == group {
			return true
		}
	}
	return false
}

type PelicanSummary struct {
	Normal   int `json:"normal"`
	Degraded int `json:"degraded"`
	Empty    int `json:"empty"`
}

type PelicanGroupCard struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Model       string           `json:"model"`
	Reasoning   string           `json:"reasoning"`
	Ratio       float64          `json:"ratio"`
	HasKey      bool             `json:"has_key"`
	Health      string           `json:"health"`
	Logic       PelicanKindPanel `json:"logic"`
	Drawing     PelicanKindPanel `json:"drawing"`
	Artwork     *PelicanArtwork  `json:"artwork"`
}

type PelicanKindPanel struct {
	Passed       int                `json:"passed"`
	Judged       int                `json:"judged"`
	AvgLatencyMs int                `json:"avg_latency_ms"`
	Latest       *PelicanProbeBrief `json:"latest"`
	Slots        []PelicanSlotView  `json:"slots"`
}

type PelicanProbeBrief struct {
	ID        int    `json:"id"`
	Status    string `json:"status"`
	SlotStart int64  `json:"slot_start"`
	CreatedAt int64  `json:"created_at"`
	LatencyMs int    `json:"latency_ms"`
	Vehicle   string `json:"vehicle,omitempty"`
	Scene     string `json:"scene,omitempty"`
	Subject   string `json:"subject,omitempty"`
}

type PelicanSlotView struct {
	Start  int64  `json:"start"`
	Status string `json:"status"`
	ID     int    `json:"id,omitempty"`
}

type PelicanArtwork struct {
	ID        int    `json:"id"`
	HTML      string `json:"html"`
	Subject   string `json:"subject"`
	Vehicle   string `json:"vehicle"`
	Scene     string `json:"scene"`
	SlotStart int64  `json:"slot_start"`
	LatencyMs int    `json:"latency_ms"`
}

type PelicanProbeDetail struct {
	ID           int    `json:"id"`
	GroupName    string `json:"group_name"`
	Kind         string `json:"kind"`
	Status       string `json:"status"`
	SlotStart    int64  `json:"slot_start"`
	CreatedAt    int64  `json:"created_at"`
	Model        string `json:"model"`
	Reasoning    string `json:"reasoning"`
	LatencyMs    int    `json:"latency_ms"`
	TtftMs       int    `json:"ttft_ms"`
	InputTokens  int    `json:"input_tokens"`
	OutputTokens int    `json:"output_tokens"`
	Attempts     int    `json:"attempts"`
	Answer       string `json:"answer"`
	Expected     string `json:"expected"`
	Prompt       string `json:"prompt"`
	Reply        string `json:"reply"`
	DrawingHTML  string `json:"drawing_html"`
	Subject      string `json:"subject"`
	Vehicle      string `json:"vehicle"`
	Scene        string `json:"scene"`
	Error        string `json:"error"`
}

func StartPelicanMonitor() {
	if strings.EqualFold(os.Getenv("PELICAN_MONITOR"), "off") {
		common.SysLog("pelican monitor disabled by PELICAN_MONITOR=off")
		return
	}
	go func() {
		time.Sleep(45 * time.Second)
		runPelicanRound()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			runPelicanRound()
		}
	}()
}

func runPelicanRound() {
	if !pelicanRoundMu.TryLock() {
		return
	}
	defer pelicanRoundMu.Unlock()
	defer func() {
		if recovered := recover(); recovered != nil {
			common.SysError("pelican monitor panic")
		}
	}()

	if !PelicanMonitorActive() {
		return
	}
	now := time.Now()
	if err := model.FailStalePelicanProbes(now.Add(-pelicanStaleAfter).Unix()); err != nil {
		common.SysError("pelican monitor stale sweep failed: " + err.Error())
	}
	targets, err := LoadPelicanTargets(now)
	if err != nil {
		common.SysError("pelican monitor target load failed: " + err.Error())
		return
	}
	slot := PelicanSlotStart(now)
	sem := make(chan struct{}, pelicanParallelGroups)
	var wait sync.WaitGroup
	for _, target := range targets {
		if !target.HasKey || target.Model == "" {
			continue
		}
		wait.Add(1)
		sem <- struct{}{}
		go func(target PelicanTarget) {
			defer wait.Done()
			defer func() { <-sem }()
			runPelicanKind(target, "logic", slot)
			runPelicanKind(target, "drawing", slot)
		}(target)
	}
	wait.Wait()
}

func runPelicanKind(target PelicanTarget, kind string, slot int64) {
	subject, vehicle, scene := PelicanDrawingTheme(target.Group, slot)
	prompt := PelicanLogicPrompt()
	if kind == "drawing" {
		prompt = PelicanDrawingPrompt(subject, vehicle, scene)
	} else {
		subject, vehicle, scene = "", "", ""
	}
	probe := &model.PelicanProbe{
		GroupName:  target.Group,
		Kind:       kind,
		SlotStart:  slot,
		ModelName:  target.Model,
		Reasoning:  pelicanReasoning,
		GroupRatio: target.Ratio,
		Prompt:     prompt,
		Subject:    subject,
		Vehicle:    vehicle,
		Scene:      scene,
	}
	claimed, err := model.ClaimPelicanProbe(probe)
	if err != nil {
		common.SysError("pelican monitor claim failed: " + err.Error())
		return
	}
	if !claimed {
		return
	}
	timeout := pelicanLogicTimeout
	if kind == "drawing" {
		timeout = pelicanDrawingTimeout
	}
	started := time.Now()
	reply, inputTokens, outputTokens, ttft, callErr := callPelicanModel(target.Key, target.Model, prompt, timeout)
	probe.LatencyMs = int(time.Since(started).Milliseconds())
	probe.TtftMs = int(ttft.Milliseconds())
	probe.InputTokens = inputTokens
	probe.OutputTokens = outputTokens
	probe.Attempts = 1
	probe.Reply = reply
	if callErr != nil && errors.Is(callErr, errPelicanUnreachable) {
		if releaseErr := model.ReleasePelicanProbe(probe.Id); releaseErr != nil {
			common.SysError("pelican monitor release failed: " + releaseErr.Error())
		}
		return
	}
	if callErr != nil && strings.TrimSpace(reply) == "" {
		probe.Status = "error"
		probe.Error = clipPelicanText(callErr.Error(), 1000)
	} else if kind == "logic" {
		answer, pass := JudgeLogicAnswer(reply)
		probe.Answer = answer
		probe.Status = "fail"
		if pass {
			probe.Status = "pass"
		}
	} else {
		html, ok := ExtractDrawingHTML(reply)
		probe.Status = "fail"
		if ok {
			probe.Status = "pass"
			probe.DrawingHTML = html
		}
	}
	if err = model.FinishPelicanProbe(probe); err != nil {
		common.SysError("pelican monitor finish failed: " + err.Error())
	}
}

var errPelicanUnreachable = errors.New("pelican monitor endpoint is not listening")

func callPelicanModel(key, modelName, prompt string, timeout time.Duration) (string, int, int, time.Duration, error) {
	body, err := common.Marshal(map[string]any{
		"model":            modelName,
		"stream":           true,
		"reasoning_effort": pelicanReasoning,
		"messages":         []map[string]string{{"role": "user", "content": prompt}},
		"stream_options":   map[string]any{"include_usage": true},
	})
	if err != nil {
		return "", 0, 0, 0, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, pelicanMonitorURL(), bytes.NewReader(body))
	if err != nil {
		return "", 0, 0, 0, err
	}
	request.Header.Set("Authorization", "Bearer sk-"+key)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "text/event-stream")
	started := time.Now()
	response, err := pelicanHTTP.Do(request)
	if err != nil {
		if isPelicanUnreachable(err) {
			return "", 0, 0, 0, errPelicanUnreachable
		}
		return "", 0, 0, 0, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return "", 0, 0, 0, errors.New("upstream status " + strconv.Itoa(response.StatusCode) + ": " + clipPelicanText(string(snippet), 300))
	}
	if strings.Contains(strings.ToLower(response.Header.Get("Content-Type")), "text/event-stream") {
		return readPelicanStream(response.Body, started)
	}
	return readPelicanJSON(response.Body, started)
}

func pelicanMonitorURL() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = strconv.Itoa(*common.Port)
	}
	return "http://127.0.0.1:" + port + "/v1/chat/completions"
}

func isPelicanUnreachable(err error) bool {
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "connection refused") || strings.Contains(text, "connectex")
}

type pelicanChatChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func readPelicanStream(body io.Reader, started time.Time) (string, int, int, time.Duration, error) {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64*1024), 2<<20)
	var builder strings.Builder
	var first time.Time
	var inputTokens, outputTokens int
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk pelicanChatChunk
		if err := common.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if chunk.Error != nil && chunk.Error.Message != "" && builder.Len() == 0 {
			return "", inputTokens, outputTokens, 0, errors.New(chunk.Error.Message)
		}
		piece := ""
		if len(chunk.Choices) > 0 {
			piece = chunk.Choices[0].Delta.Content
			if piece == "" {
				piece = chunk.Choices[0].Message.Content
			}
		}
		if piece != "" {
			if first.IsZero() {
				first = time.Now()
			}
			builder.WriteString(piece)
		}
		if chunk.Usage != nil {
			inputTokens = chunk.Usage.PromptTokens
			outputTokens = chunk.Usage.CompletionTokens
		}
	}
	if err := scanner.Err(); err != nil && builder.Len() == 0 {
		return "", inputTokens, outputTokens, 0, err
	}
	ttft := time.Duration(0)
	if !first.IsZero() {
		ttft = first.Sub(started)
	}
	return builder.String(), inputTokens, outputTokens, ttft, nil
}

func readPelicanJSON(body io.Reader, started time.Time) (string, int, int, time.Duration, error) {
	payload, err := io.ReadAll(io.LimitReader(body, 2<<20))
	if err != nil {
		return "", 0, 0, 0, err
	}
	var chunk pelicanChatChunk
	if err = common.Unmarshal(payload, &chunk); err != nil {
		return "", 0, 0, 0, err
	}
	if chunk.Error != nil && chunk.Error.Message != "" {
		return "", 0, 0, 0, errors.New(chunk.Error.Message)
	}
	content := ""
	if len(chunk.Choices) > 0 {
		content = chunk.Choices[0].Message.Content
	}
	inputTokens, outputTokens := 0, 0
	if chunk.Usage != nil {
		inputTokens = chunk.Usage.PromptTokens
		outputTokens = chunk.Usage.CompletionTokens
	}
	ttft := time.Duration(0)
	if content != "" {
		ttft = time.Since(started)
	}
	return content, inputTokens, outputTokens, ttft, nil
}

func LoadPelicanTargets(now time.Time) ([]PelicanTarget, error) {
	groups, err := model.ListEnabledAbilityGroups()
	if err != nil {
		return nil, err
	}
	sort.Strings(groups)
	choices := PelicanMonitorChoices()
	configured := make(map[string]string, len(choices))
	allow := make([]string, 0, len(choices))
	for _, choice := range choices {
		allow = append(allow, choice.Group)
		configured[choice.Group] = choice.Model
	}
	targets := make([]PelicanTarget, 0, len(groups))
	for _, group := range groups {
		if !pelicanGroupAllowed(group, allow) {
			continue
		}
		token, tokenErr := model.FindPelicanToken(group, now.Unix())
		if tokenErr != nil {
			return nil, tokenErr
		}
		target := PelicanTarget{
			Group:       group,
			Description: setting.GetUsableGroupDescription(group),
			Ratio:       ratio_setting.GetGroupRatio(group),
			Model:       pickPelicanModel(group, token, configured[group]),
		}
		if token != nil && token.Key != "" {
			target.HasKey = true
			target.Key = token.Key
		}
		targets = append(targets, target)
	}
	return targets, nil
}

func pickPelicanModel(group string, token *model.Token, configured string) string {
	if strings.TrimSpace(configured) != "" {
		return strings.TrimSpace(configured)
	}
	models := model.GetGroupEnabledModels(group)
	allowed := map[string]struct{}{}
	if token != nil && token.ModelLimitsEnabled {
		for _, name := range token.GetModelLimits() {
			name = strings.TrimSpace(name)
			if name != "" {
				allowed[name] = struct{}{}
			}
		}
	}
	picked := make([]string, 0, len(models))
	for _, name := range models {
		if len(allowed) > 0 {
			if _, ok := allowed[name]; !ok {
				continue
			}
		}
		if skipPelicanModel(name) {
			continue
		}
		picked = append(picked, name)
	}
	sort.Strings(picked)
	for _, name := range picked {
		if strings.Contains(strings.ToLower(name), "gpt") {
			return name
		}
	}
	if len(picked) == 0 {
		return ""
	}
	return picked[0]
}

func skipPelicanModel(name string) bool {
	lower := strings.ToLower(name)
	for _, part := range []string{"embedding", "whisper", "tts", "dall-e", "moderation", "image", "rerank", "audio"} {
		if strings.Contains(lower, part) {
			return true
		}
	}
	return false
}

func LoadPelicanDashboard(window string, now time.Time) (*PelicanDashboard, error) {
	if window != "3d" {
		window = "24h"
	}
	targets, err := LoadPelicanTargets(now)
	if err != nil {
		return nil, err
	}
	slots := PelicanWindowSlots(window, now)
	briefs, err := model.ListPelicanProbeBriefs(slots[0], slots[len(slots)-1])
	if err != nil {
		return nil, err
	}
	art := make(map[string]*model.PelicanProbe, len(targets))
	for _, target := range targets {
		row, artErr := model.LatestPassedPelicanDrawing(target.Group, slots[0], slots[len(slots)-1])
		if artErr != nil {
			return nil, artErr
		}
		if row != nil {
			art[target.Group] = row
		}
	}
	dashboard := assemblePelicanDashboard(targets, briefs, art, window, now, slots)
	dashboard.Enabled = PelicanMonitorActive()
	return dashboard, nil
}

func LoadPelicanProbeDetail(id int) (*PelicanProbeDetail, error) {
	row, err := model.GetPelicanProbeByID(id)
	if err != nil || row == nil {
		return nil, err
	}
	detail := &PelicanProbeDetail{
		ID:           row.Id,
		GroupName:    row.GroupName,
		Kind:         row.Kind,
		Status:       row.Status,
		SlotStart:    row.SlotStart,
		CreatedAt:    row.CreatedAt,
		Model:        row.ModelName,
		Reasoning:    row.Reasoning,
		LatencyMs:    row.LatencyMs,
		TtftMs:       row.TtftMs,
		InputTokens:  row.InputTokens,
		OutputTokens: row.OutputTokens,
		Attempts:     row.Attempts,
		Answer:       row.Answer,
		Prompt:       row.Prompt,
		Reply:        row.Reply,
		DrawingHTML:  row.DrawingHTML,
		Subject:      row.Subject,
		Vehicle:      row.Vehicle,
		Scene:        row.Scene,
		Error:        row.Error,
	}
	if row.Kind == "drawing" && strings.TrimSpace(detail.DrawingHTML) == "" {
		if html, ok := ExtractDrawingHTML(row.Reply); ok {
			detail.DrawingHTML = html
		}
	}
	if row.Kind == "logic" {
		detail.Expected = PelicanExpectedAnswer()
	}
	return detail, nil
}

func assemblePelicanDashboard(targets []PelicanTarget, probes []model.PelicanProbe, art map[string]*model.PelicanProbe, window string, now time.Time, slots []int64) *PelicanDashboard {
	byGroup := make(map[string][]model.PelicanProbe, len(targets))
	for _, probe := range probes {
		byGroup[probe.GroupName] = append(byGroup[probe.GroupName], probe)
	}
	dashboard := &PelicanDashboard{
		UpdatedAt:  now.Unix(),
		Range:      window,
		NextSlotAt: PelicanSlotStart(now) + int64(pelicanSlot.Seconds()),
		Groups:     make([]PelicanGroupCard, 0, len(targets)),
	}
	pass, fail := 0, 0
	for _, target := range targets {
		card := PelicanGroupCard{
			Name:        target.Group,
			Description: target.Description,
			Model:       target.Model,
			Reasoning:   pelicanReasoning,
			Ratio:       target.Ratio,
			HasKey:      target.HasKey,
			Logic:       panelForKind(byGroup[target.Group], "logic", slots),
			Drawing:     panelForKind(byGroup[target.Group], "drawing", slots),
		}
		card.Health = healthFromSlots(card.Logic.Slots)
		switch card.Health {
		case "normal":
			dashboard.Summary.Normal++
		case "degraded":
			dashboard.Summary.Degraded++
		default:
			dashboard.Summary.Empty++
		}
		pass += card.Logic.Passed
		fail += card.Logic.Judged - card.Logic.Passed
		if row := art[target.Group]; row != nil && strings.TrimSpace(row.DrawingHTML) != "" {
			card.Artwork = &PelicanArtwork{
				ID:        row.Id,
				HTML:      row.DrawingHTML,
				Subject:   row.Subject,
				Vehicle:   row.Vehicle,
				Scene:     row.Scene,
				SlotStart: row.SlotStart,
				LatencyMs: row.LatencyMs,
			}
		}
		dashboard.Groups = append(dashboard.Groups, card)
	}
	if pass+fail > 0 {
		rate := float64(pass) / float64(pass+fail)
		dashboard.LogicPassRate = &rate
	}
	dashboard.LogicAnswer = PelicanExpectedAnswer()
	return dashboard
}

func panelForKind(probes []model.PelicanProbe, kind string, slots []int64) PelicanKindPanel {
	found := make(map[int64]model.PelicanProbe, len(slots))
	for _, probe := range probes {
		if probe.Kind != kind {
			continue
		}
		previous, ok := found[probe.SlotStart]
		if !ok || probe.Id >= previous.Id {
			found[probe.SlotStart] = probe
		}
	}
	panel := PelicanKindPanel{Slots: make([]PelicanSlotView, 0, len(slots))}
	latencySum := 0
	latencyCount := 0
	var latest *model.PelicanProbe
	for _, start := range slots {
		view := PelicanSlotView{Start: start, Status: "empty"}
		probe, ok := found[start]
		if ok {
			view.Status = probe.Status
			view.ID = probe.Id
			if probe.Status == "pass" || probe.Status == "fail" {
				panel.Judged++
				if probe.Status == "pass" {
					panel.Passed++
				}
				if probe.LatencyMs > 0 {
					latencySum += probe.LatencyMs
					latencyCount++
				}
			}
			if latest == nil || probe.SlotStart > latest.SlotStart || (probe.SlotStart == latest.SlotStart && probe.Id > latest.Id) {
				copyProbe := probe
				latest = &copyProbe
			}
		}
		panel.Slots = append(panel.Slots, view)
	}
	if latencyCount > 0 {
		panel.AvgLatencyMs = latencySum / latencyCount
	}
	if latest != nil {
		panel.Latest = &PelicanProbeBrief{
			ID:        latest.Id,
			Status:    latest.Status,
			SlotStart: latest.SlotStart,
			CreatedAt: latest.CreatedAt,
			LatencyMs: latest.LatencyMs,
			Vehicle:   latest.Vehicle,
			Scene:     latest.Scene,
			Subject:   latest.Subject,
		}
	}
	return panel
}

func healthFromSlots(slots []PelicanSlotView) string {
	for index := len(slots) - 1; index >= 0; index-- {
		switch slots[index].Status {
		case "pass":
			return "normal"
		case "fail":
			return "degraded"
		}
	}
	return "empty"
}
