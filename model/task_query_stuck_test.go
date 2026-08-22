package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

// A non-terminal task whose progress is already "100%" must still be returned by
// the unfinished-task queries; otherwise it is stranded forever at in_progress + 100%.
func TestGetAllUnFinishSyncTasksIncludesNonTerminalHundredProgress(t *testing.T) {
	truncateTables(t)

	insertTask(t, &Task{TaskID: "np_inprogress", Status: TaskStatusInProgress, Progress: "100%", Data: json.RawMessage(`{}`)})
	insertTask(t, &Task{TaskID: "np_success", Status: TaskStatusSuccess, Progress: "100%", Data: json.RawMessage(`{}`)})
	insertTask(t, &Task{TaskID: "np_failure", Status: TaskStatusFailure, Progress: "100%", Data: json.RawMessage(`{}`)})

	ids := map[string]bool{}
	for _, tk := range GetAllUnFinishSyncTasks(100) {
		ids[tk.TaskID] = true
	}

	assert.True(t, ids["np_inprogress"], "non-terminal 100% task must still be polled")
	assert.False(t, ids["np_success"], "terminal success task must not be polled")
	assert.False(t, ids["np_failure"], "terminal failure task must not be polled")
}

func TestGetTimedOutUnfinishedTasksIncludesNonTerminalHundredProgress(t *testing.T) {
	truncateTables(t)

	insertTask(t, &Task{TaskID: "to_stuck", Status: TaskStatusInProgress, Progress: "100%", SubmitTime: 1000, Data: json.RawMessage(`{}`)})
	insertTask(t, &Task{TaskID: "to_fresh", Status: TaskStatusInProgress, Progress: "50%", SubmitTime: 9000, Data: json.RawMessage(`{}`)})
	insertTask(t, &Task{TaskID: "to_done", Status: TaskStatusSuccess, Progress: "100%", SubmitTime: 1000, Data: json.RawMessage(`{}`)})

	ids := map[string]bool{}
	for _, tk := range GetTimedOutUnfinishedTasks(5000, 100) {
		ids[tk.TaskID] = true
	}

	assert.True(t, ids["to_stuck"], "stuck non-terminal 100% task past cutoff must be scavenged")
	assert.False(t, ids["to_fresh"], "task submitted after cutoff must not be selected")
	assert.False(t, ids["to_done"], "terminal task must not be selected")
}
