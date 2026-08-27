package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeCacheTelemetry(t *testing.T) {
	tests := []struct {
		name  string
		input cacheTelemetryInput
		want  cacheTokenTelemetry
	}{
		{
			name: "reliable input tokens take precedence for OpenAI",
			input: cacheTelemetryInput{
				ReliableInputTokens: 120,
				PromptTokens:        100,
				CacheReadTokens:     30,
				CacheWriteTokens:    10,
			},
			want: cacheTokenTelemetry{InputTokens: 120, CacheReadTokens: 30, CacheWriteTokens: 10, Valid: true},
		},
		{
			name: "Gemini falls back to normalized prompt input",
			input: cacheTelemetryInput{
				PromptTokens:    100,
				CacheReadTokens: 20,
			},
			want: cacheTokenTelemetry{InputTokens: 100, CacheReadTokens: 20, Valid: true},
		},
		{
			name: "Anthropic includes ordinary cache read and cache write input",
			input: cacheTelemetryInput{
				PromptTokens:     70,
				CacheReadTokens:  20,
				CacheWriteTokens: 10,
				IsAnthropic:      true,
			},
			want: cacheTokenTelemetry{InputTokens: 100, CacheReadTokens: 20, CacheWriteTokens: 10, Valid: true},
		},
		{
			name: "overlapping cache totals are not eligible telemetry",
			input: cacheTelemetryInput{
				PromptTokens:     100,
				CacheReadTokens:  70,
				CacheWriteTokens: 40,
			},
			want: cacheTokenTelemetry{InputTokens: 100, CacheReadTokens: 70, CacheWriteTokens: 40, Valid: false},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, normalizeCacheTelemetry(tt.input))
		})
	}
}
