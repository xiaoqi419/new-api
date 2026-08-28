package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/assert"
)

func TestImageTaskActionOnlyClassifiesSynchronousImageModes(t *testing.T) {
	tests := []struct {
		name       string
		relayMode  int
		wantAction string
		want       bool
	}{
		{name: "generation", relayMode: relayconstant.RelayModeImagesGenerations, wantAction: constant.TaskActionImagesGeneration, want: true},
		{name: "edit", relayMode: relayconstant.RelayModeImagesEdits, wantAction: constant.TaskActionImagesEdit, want: true},
		{name: "chat", relayMode: relayconstant.RelayModeChatCompletions},
		{name: "video", relayMode: relayconstant.RelayModeVideoSubmit},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			action, ok := imageTaskAction(tt.relayMode)
			assert.Equal(t, tt.want, ok)
			assert.Equal(t, tt.wantAction, action)
		})
	}
}
