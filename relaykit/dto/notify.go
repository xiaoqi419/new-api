package dto

type Notify struct {
	Type    string `json:"type"`
	Title   string `json:"title"`
	Content string `json:"content"`
	Values  []any  `json:"values"`
}

const ContentValueParam = "{{value}}"

const (
	NotifyTypeQuotaExceed   = "quota_exceed"
	NotifyTypeChannelUpdate = "channel_update"
	NotifyTypeChannelTest   = "channel_test"
	// NotifyTypeChannelSuspectModel 用于「上游给的模型与声称不一致」的告警。
	NotifyTypeChannelSuspectModel = "channel_suspect_model"
)

func NewNotify(t string, title string, content string, values []any) Notify {
	return Notify{
		Type:    t,
		Title:   title,
		Content: content,
		Values:  values,
	}
}
