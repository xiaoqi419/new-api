package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAgentPaymentTest(t *testing.T) {
	t.Helper()
	setupAgentSettleTest(t)
	require.NoError(t, DB.Exec("DELETE FROM agent_payment_configs").Error)
}

func TestAgentPaymentConfigRoundTrip(t *testing.T) {
	setupAgentPaymentTest(t)

	credsJSON := `{"pay_address":"https://pay.example.com","epay_id":"1001","epay_key":"secretkey"}`
	require.NoError(t, SetAgentPaymentConfig(7, AgentPaymentProviderEpay, credsJSON, true, 7.5, 5))

	cfg, err := GetAgentPaymentConfig(7, AgentPaymentProviderEpay)
	require.NoError(t, err)
	require.NotNil(t, cfg)
	assert.True(t, cfg.Enabled)
	assert.Equal(t, 7.5, cfg.UnitPrice)
	assert.Equal(t, 5, cfg.MinTopup)
	// 凭据落库必须是密文，不含明文
	assert.NotEmpty(t, cfg.CredsEncrypted)
	assert.NotContains(t, cfg.CredsEncrypted, "secretkey")

	creds, err := cfg.DecryptCreds()
	require.NoError(t, err)
	assert.Equal(t, "https://pay.example.com", creds["pay_address"])
	assert.Equal(t, "1001", creds["epay_id"])
	assert.Equal(t, "secretkey", creds["epay_key"])
}

func TestSetAgentPaymentConfigPreservesCredsWhenEmpty(t *testing.T) {
	setupAgentPaymentTest(t)

	require.NoError(t, SetAgentPaymentConfig(8, AgentPaymentProviderStripe, `{"api_secret":"sk_live_x","webhook_secret":"whsec_y"}`, true, 8, 1))
	// 二次仅更新开关/定价，凭据传空 → 保留原凭据
	require.NoError(t, SetAgentPaymentConfig(8, AgentPaymentProviderStripe, "", false, 9, 2))

	cfg, err := GetAgentPaymentConfig(8, AgentPaymentProviderStripe)
	require.NoError(t, err)
	require.NotNil(t, cfg)
	assert.False(t, cfg.Enabled)
	assert.Equal(t, 9.0, cfg.UnitPrice)
	assert.Equal(t, 2, cfg.MinTopup)
	creds, err := cfg.DecryptCreds()
	require.NoError(t, err)
	assert.Equal(t, "sk_live_x", creds["api_secret"])
	assert.Equal(t, "whsec_y", creds["webhook_secret"])
}

func TestAgentPaymentConfigProviderValidation(t *testing.T) {
	setupAgentPaymentTest(t)

	_, err := GetAgentPaymentConfig(1, "paypal")
	assert.Error(t, err)

	err = SetAgentPaymentConfig(1, "paypal", `{"x":"y"}`, true, 1, 1)
	assert.Error(t, err)

	err = SetAgentPaymentConfig(0, AgentPaymentProviderEpay, `{"x":"y"}`, true, 1, 1)
	assert.Error(t, err)
}

func TestGetAgentPaymentConfigMissingReturnsNil(t *testing.T) {
	setupAgentPaymentTest(t)

	cfg, err := GetAgentPaymentConfig(999, AgentPaymentProviderEpay)
	require.NoError(t, err)
	assert.Nil(t, cfg)
}

func TestAgentPaymentCredKeys(t *testing.T) {
	assert.Equal(t, []string{"pay_address", "epay_id", "epay_key"}, AgentPaymentCredKeys(AgentPaymentProviderEpay))
	assert.Equal(t, []string{"api_secret", "webhook_secret", "price_id", "promotion_codes"}, AgentPaymentCredKeys(AgentPaymentProviderStripe))
	assert.Nil(t, AgentPaymentCredKeys("paypal"))
}
