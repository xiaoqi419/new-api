package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAssemblePelicanDashboardCountsHealthAndPassRate(t *testing.T) {
	loc := time.FixedZone("CST", 8*3600)
	now := time.Date(2026, 9, 28, 18, 10, 0, 0, loc)
	slots := PelicanWindowSlots("24h", now)
	current := slots[len(slots)-1]
	previous := slots[len(slots)-2]
	targets := []PelicanTarget{
		{Group: "full", Description: "满血", Model: "gpt-6", Ratio: 0.3, HasKey: true},
		{Group: "weak", Description: "降智", Model: "gpt-6", Ratio: 1, HasKey: true},
		{Group: "idle", Description: "idle", Model: "", HasKey: false},
	}
	probes := []model.PelicanProbe{
		{Id: 1, GroupName: "full", Kind: "logic", SlotStart: previous, Status: "fail", LatencyMs: 1000, CreatedAt: previous},
		{Id: 2, GroupName: "full", Kind: "logic", SlotStart: current, Status: "pass", LatencyMs: 3000, CreatedAt: current},
		{Id: 3, GroupName: "weak", Kind: "logic", SlotStart: current, Status: "fail", LatencyMs: 2000, CreatedAt: current},
		{Id: 4, GroupName: "full", Kind: "logic", SlotStart: current, Status: "error", LatencyMs: 50, CreatedAt: current + 1},
	}
	art := map[string]*model.PelicanProbe{
		"full": {Id: 9, DrawingHTML: "<svg viewBox='0 0 1 1'/>", Subject: "小羊", Vehicle: "滑板车", Scene: "湖边", SlotStart: current, LatencyMs: 4000},
	}
	// The later error row shares the current slot and wins by id, so full is empty
	// until a judged status is the latest judged one. Keep pass as the latest judged
	// by giving the error an older slot instead.
	probes[3].SlotStart = slots[0]
	probes[3].Id = 4

	dashboard := assemblePelicanDashboard(targets, probes, art, "24h", now, slots)
	require.Len(t, dashboard.Groups, 3)
	assert.Equal(t, "normal", dashboard.Groups[0].Health)
	assert.Equal(t, "degraded", dashboard.Groups[1].Health)
	assert.Equal(t, "empty", dashboard.Groups[2].Health)
	assert.Equal(t, 1, dashboard.Summary.Normal)
	assert.Equal(t, 1, dashboard.Summary.Degraded)
	assert.Equal(t, 1, dashboard.Summary.Empty)
	require.NotNil(t, dashboard.LogicPassRate)
	assert.InDelta(t, 1.0/3.0, *dashboard.LogicPassRate, 0.0001)
	assert.Equal(t, 1, dashboard.Groups[0].Logic.Passed)
	assert.Equal(t, 2, dashboard.Groups[0].Logic.Judged)
	assert.Equal(t, 2000, dashboard.Groups[0].Logic.AvgLatencyMs)
	require.NotNil(t, dashboard.Groups[0].Artwork)
	assert.Equal(t, "滑板车", dashboard.Groups[0].Artwork.Vehicle)
	assert.Equal(t, "empty", dashboard.Groups[2].Logic.Slots[0].Status)
	assert.Equal(t, current+int64(pelicanSlot.Seconds()), dashboard.NextSlotAt)
}

func TestNormalizePelicanGroupsKeepsGroupAndModel(t *testing.T) {
	got, err := NormalizePelicanGroups("[]")
	require.NoError(t, err)
	assert.Equal(t, "[]", got)

	got, err = NormalizePelicanGroups(`[" vip ","vip"]`)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"group":"vip"}]`, got)

	got, err = NormalizePelicanGroups(`[{"group":"vip","model":" gpt-6-astra "}]`)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"group":"vip","model":"gpt-6-astra"}]`, got)

	_, err = NormalizePelicanGroups(`{"group":"vip"}`)
	require.Error(t, err)
	_, err = NormalizePelicanGroups(`[{"group":"vip","model":1}]`)
	require.Error(t, err)
	_, err = NormalizePelicanGroups(`[{"model":"gpt"}]`)
	require.Error(t, err)
}

func TestPelicanMonitorChoicesReadsSavedModel(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	previous, had := common.OptionMap["PelicanMonitorGroups"]
	common.OptionMap["PelicanMonitorGroups"] = `["vip"]`
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		if had {
			common.OptionMap["PelicanMonitorGroups"] = previous
		} else {
			delete(common.OptionMap, "PelicanMonitorGroups")
		}
		common.OptionMapRWMutex.Unlock()
	})

	assert.Equal(t, []string{"vip"}, PelicanMonitorAllowlist())

	common.OptionMapRWMutex.Lock()
	common.OptionMap["PelicanMonitorGroups"] = `[{"group":"vip","model":"gpt-6-astra"}]`
	common.OptionMapRWMutex.Unlock()
	assert.Equal(t, []PelicanGroupChoice{{Group: "vip", Model: "gpt-6-astra"}}, PelicanMonitorChoices())

	common.OptionMapRWMutex.Lock()
	common.OptionMap["PelicanMonitorGroups"] = `[]`
	common.OptionMapRWMutex.Unlock()
	assert.Nil(t, PelicanMonitorAllowlist())
}
