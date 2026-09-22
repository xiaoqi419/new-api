package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
)

func TestModelPricingTierChangesAreAtomicAndVersioned(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}, &Channel{}, &Ability{}, &Model{}, &Vendor{}))
	previousDB, previousOptions := DB, common.OptionMap
	DB = db
	common.OptionMap = map[string]string{}
	original := map[string]string{
		"ModelPrice": ratio_setting.ModelPrice2JSONString(), "ModelRatio": ratio_setting.ModelRatio2JSONString(),
		"CompletionRatio": ratio_setting.CompletionRatio2JSONString(), "CacheRatio": ratio_setting.CacheRatio2JSONString(),
		"CreateCacheRatio": ratio_setting.CreateCacheRatio2JSONString(), "ImageRatio": ratio_setting.ImageRatio2JSONString(),
		"AudioRatio": ratio_setting.AudioRatio2JSONString(), "AudioCompletionRatio": ratio_setting.AudioCompletionRatio2JSONString(),
		"ImagePriceTiers": ratio_setting.ImagePrice2JSONString(), "VideoPriceTiers": ratio_setting.VideoPrice2JSONString(),
	}
	for key, value := range map[string]any{"billing_setting.billing_mode": billing_setting.GetBillingModeCopy(), "billing_setting.billing_expr": billing_setting.GetBillingExprCopy(), billing_setting.PluginBillingExprOption: billing_setting.GetPluginBillingExprCopy()} {
		encoded, err := common.Marshal(value)
		require.NoError(t, err)
		original[key] = string(encoded)
	}
	t.Cleanup(func() {
		for key, raw := range original {
			if raw != "" {
				require.NoError(t, updateOptionMap(key, raw))
			}
		}
		DB, common.OptionMap = previousDB, previousOptions
		InvalidatePricingCache()
	})
	image := map[string]any{"base_size": "1024x1024", "base_price": float64(1), "tiers": []any{map[string]any{"size": "2048x2048", "price": float64(2)}}}
	video := map[string]any{"base_price": float64(8), "tiers": []any{map[string]any{"has_audio": true, "price": float64(16)}}}
	values := PricingValues{"ModelPrice": float64(1), "ImagePriceTiers": image, "VideoPriceTiers": video}
	require.NoError(t, UpdateModelPricing([]ModelPricingChange{{ModelName: "tier-test-model", ExpectedVersion: ModelPricingVersion(PricingValues{}), Pricing: values}}))
	snapshot, err := GetModelPricingSnapshot([]string{"tier-test-model"})
	require.NoError(t, err)
	require.Len(t, snapshot.Entries, 1)
	entry := snapshot.Entries[0]
	assert.Equal(t, ModelPricingVersion(values), entry.Version)
	assert.Equal(t, image, entry.Configured["ImagePriceTiers"])
	assert.Equal(t, video, entry.Configured["VideoPriceTiers"])
	ratio, found := ratio_setting.GetVideoPriceRatio("tier-test-model", ratio_setting.VideoRequestShape{HasAudio: true})
	assert.True(t, found)
	assert.Equal(t, float64(2), ratio)
	invalid := PricingValues{"ModelPrice": float64(9), "ImagePriceTiers": image, "VideoPriceTiers": map[string]any{"base_price": float64(0), "tiers": []any{map[string]any{"price": float64(2)}}}}
	require.Error(t, UpdateModelPricing([]ModelPricingChange{{ModelName: "tier-test-model", ExpectedVersion: entry.Version, Pricing: invalid}}))
	// A stale editor must not overwrite the tier configuration or the fixed price.
	require.ErrorIs(t, UpdateModelPricing([]ModelPricingChange{{ModelName: "tier-test-model", ExpectedVersion: ModelPricingVersion(PricingValues{}), Pricing: values}}), ErrModelPricingConflict)
	latest, err := GetModelPricingSnapshot([]string{"tier-test-model"})
	require.NoError(t, err)
	assert.Equal(t, entry.Version, latest.Entries[0].Version)
	assert.Equal(t, entry.Configured, latest.Entries[0].Configured)
	for _, key := range []string{"ImagePriceTiers", "VideoPriceTiers"} {
		preview, err := PreviewModelPricingConversion("tier-test-model", PricingValues{"ModelPrice": float64(1), key: values[key]})
		require.NoError(t, err)
		assert.Contains(t, preview.UnsupportedReason, "Media tier pricing")
		assert.Empty(t, preview.Expression, "automatic conversion must not lose media tiers")
	}

}
