package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"

	"github.com/stretchr/testify/assert"
)

// A non-terminal status carrying a 100% progress must not be applied, otherwise the
// task is saved as (in_progress + 100%) and gets excluded from all polling queries.
func TestShouldApplyTaskResultProgressSkipsNonTerminalComplete(t *testing.T) {
	assert.False(t, shouldApplyTaskResultProgress(model.TaskStatusInProgress, taskcommon.ProgressComplete))
	assert.False(t, shouldApplyTaskResultProgress(model.TaskStatusQueued, taskcommon.ProgressComplete))
	assert.False(t, shouldApplyTaskResultProgress(model.TaskStatusSubmitted, taskcommon.ProgressComplete))

	// Terminal states may carry 100%.
	assert.True(t, shouldApplyTaskResultProgress(model.TaskStatusSuccess, taskcommon.ProgressComplete))
	assert.True(t, shouldApplyTaskResultProgress(model.TaskStatusFailure, taskcommon.ProgressComplete))

	// Non-terminal partial progress is applied normally.
	assert.True(t, shouldApplyTaskResultProgress(model.TaskStatusInProgress, "50%"))
	assert.True(t, shouldApplyTaskResultProgress(model.TaskStatusQueued, "10%"))
}
