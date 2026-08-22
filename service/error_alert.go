package service

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/error_alert_setting"
)

const errorAlertLastIdOption = "error_alert_last_id"

const (
	errorAlertBatchSize   = 2000
	errorAlertMaxBytes    = 4000
	errorAlertReasonRunes = 60
)

var statusCodeRe = regexp.MustCompile(`status_code=(\d+)`)

// StartErrorAlertTask 站点级「请求错误 -> 企业微信」告警后台任务：定时增量扫描
// type=5 错误日志，聚合后推送到企业微信机器人。首轮仅建立基线，不推历史。
func StartErrorAlertTask() {
	ensureErrorAlertBaseline()
	for {
		time.Sleep(time.Duration(error_alert_setting.GetIntervalSeconds()) * time.Second)
		runErrorAlertOnce()
	}
}

func ensureErrorAlertBaseline() {
	common.OptionMapRWMutex.RLock()
	existing := strings.TrimSpace(common.OptionMap[errorAlertLastIdOption])
	common.OptionMapRWMutex.RUnlock()
	if existing != "" {
		return
	}
	maxId, err := model.GetMaxErrorLogId()
	if err != nil {
		common.SysError("error alert baseline query failed: " + err.Error())
		return
	}
	if err := model.UpdateOption(errorAlertLastIdOption, strconv.Itoa(maxId)); err != nil {
		common.SysError("error alert baseline persist failed: " + err.Error())
	}
}

func readErrorAlertLastId() int {
	common.OptionMapRWMutex.RLock()
	v := strings.TrimSpace(common.OptionMap[errorAlertLastIdOption])
	common.OptionMapRWMutex.RUnlock()
	id, _ := strconv.Atoi(v)
	return id
}

func runErrorAlertOnce() {
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("error alert task panic: %v", r))
		}
	}()

	s := error_alert_setting.GetSetting()
	if !s.Enabled || strings.TrimSpace(s.WecomWebhookUrl) == "" {
		return
	}

	lastId := readErrorAlertLastId()
	logs, err := model.GetErrorLogsSince(lastId, errorAlertBatchSize)
	if err != nil {
		common.SysError("error alert query failed: " + err.Error())
		return
	}
	if len(logs) == 0 {
		return
	}

	modelFilters := splitFilter(s.ModelFilter)
	channelFilters := splitFilter(s.ChannelFilter)
	maxId := lastId
	matched := make([]*model.Log, 0, len(logs))
	for _, lg := range logs {
		if lg.Id > maxId {
			maxId = lg.Id
		}
		if len(modelFilters) > 0 && !matchesSubstring(modelFilters, lg.ModelName) {
			continue
		}
		if len(channelFilters) > 0 && !containsExact(channelFilters, strconv.Itoa(lg.ChannelId)) {
			continue
		}
		matched = append(matched, lg)
	}

	// 无论是否达到阈值，都推进 lastId，避免下轮重复扫描已处理的旧数据。
	if maxId > lastId {
		if err := model.UpdateOption(errorAlertLastIdOption, strconv.Itoa(maxId)); err != nil {
			common.SysError("error alert cursor persist failed: " + err.Error())
		}
	}

	if len(matched) < error_alert_setting.GetMinCount() {
		return
	}

	content := buildErrorAlertMarkdown(matched, error_alert_setting.GetTopN())
	if err := SendWecomBotMarkdown(s.WecomWebhookUrl, content); err != nil {
		common.SysError("error alert wecom push failed: " + err.Error())
	}
}

type errSig struct {
	status  string
	reason  string
	model   string
	channel string
}

func signatureOf(lg *model.Log) errSig {
	content := strings.TrimSpace(lg.Content)
	status := "-"
	reason := content
	if loc := statusCodeRe.FindStringSubmatchIndex(content); loc != nil {
		status = content[loc[2]:loc[3]]
		reason = content[loc[1]:]
	}
	reason = strings.TrimLeft(reason, " ,，")
	cut := len(reason)
	for _, ch := range []string{":", "(", "：", "（"} {
		if i := strings.Index(reason, ch); i != -1 && i < cut {
			cut = i
		}
	}
	reason = strings.TrimSpace(reason[:cut])
	if reason == "" {
		reason = strings.TrimSpace(content)
	}
	reason = truncateRunes(reason, errorAlertReasonRunes)

	modelName := strings.TrimSpace(lg.ModelName)
	if modelName == "" {
		modelName = "-"
	}
	channel := "-"
	if lg.ChannelId != 0 {
		channel = strconv.Itoa(lg.ChannelId)
	}
	return errSig{status: status, reason: reason, model: modelName, channel: channel}
}

func buildErrorAlertMarkdown(logs []*model.Log, topN int) string {
	counts := make(map[errSig]int)
	order := make([]errSig, 0)
	for _, lg := range logs {
		sig := signatureOf(lg)
		if _, ok := counts[sig]; !ok {
			order = append(order, sig)
		}
		counts[sig]++
	}
	sort.SliceStable(order, func(i, j int) bool {
		return counts[order[i]] > counts[order[j]]
	})

	var b strings.Builder
	b.WriteString("**🚨 new-api 错误告警**\n")
	b.WriteString("时间：" + time.Now().Format("2006-01-02 15:04:05") + "\n")
	b.WriteString(fmt.Sprintf("新增错误：<font color=\"warning\">%d</font> 条\n\n", len(logs)))
	b.WriteString("**Top 错误类型：**\n")

	shown := order
	if len(shown) > topN {
		shown = shown[:topN]
	}
	for _, sig := range shown {
		b.WriteString(fmt.Sprintf("<font color=\"warning\">×%d</font>  `%s`  %s\n", counts[sig], sig.status, sig.reason))
		b.WriteString(fmt.Sprintf("　模型 `%s`｜渠道 `%s`\n", sig.model, sig.channel))
	}
	if len(order) > len(shown) {
		rest := 0
		for _, sig := range order[len(shown):] {
			rest += counts[sig]
		}
		b.WriteString(fmt.Sprintf("\n（另有 %d 类共 %d 条未展示）", len(order)-len(shown), rest))
	}

	content := b.String()
	if len(content) > errorAlertMaxBytes {
		content = truncateBytes(content, errorAlertMaxBytes) + "\n…(已截断)"
	}
	return content
}

func splitFilter(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func matchesSubstring(filters []string, v string) bool {
	lv := strings.ToLower(v)
	for _, f := range filters {
		if strings.Contains(lv, strings.ToLower(f)) {
			return true
		}
	}
	return false
}

func containsExact(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return string(r[:n])
}

func truncateBytes(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}
	b := []byte(s)[:maxBytes]
	for len(b) > 0 && !utf8.Valid(b) {
		b = b[:len(b)-1]
	}
	return string(b)
}
