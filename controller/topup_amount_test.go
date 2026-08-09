/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func withPaymentAmountOptions(t *testing.T, options []int, displayType string) {
	t.Helper()
	payment := operation_setting.GetPaymentSetting()
	general := operation_setting.GetGeneralSetting()
	originalOptions := payment.AmountOptions
	originalDisplay := general.QuotaDisplayType
	t.Cleanup(func() {
		payment.AmountOptions = originalOptions
		general.QuotaDisplayType = originalDisplay
	})
	payment.AmountOptions = options
	general.QuotaDisplayType = displayType
}

func TestGetMaxTopup(t *testing.T) {
	t.Run("takes the highest configured preset", func(t *testing.T) {
		withPaymentAmountOptions(t, []int{10, 200, 50}, operation_setting.QuotaDisplayTypeUSD)
		assert.Equal(t, int64(200), GetMaxTopup(1))
	})

	t.Run("falls back to the built-in ceiling when presets are cleared", func(t *testing.T) {
		withPaymentAmountOptions(t, nil, operation_setting.QuotaDisplayTypeUSD)
		assert.Equal(t, int64(defaultMaxTopupAmount), GetMaxTopup(1))
	})

	t.Run("never drops below the channel minimum", func(t *testing.T) {
		withPaymentAmountOptions(t, []int{10}, operation_setting.QuotaDisplayTypeUSD)
		// 上限低于下限会让所有金额都被拒，充值直接不可用。
		assert.Equal(t, int64(500), GetMaxTopup(500))
	})

	t.Run("scales with the quota unit when amounts are shown as tokens", func(t *testing.T) {
		withPaymentAmountOptions(t, []int{100}, operation_setting.QuotaDisplayTypeTokens)
		assert.Equal(t, int64(100*common.QuotaPerUnit), GetMaxTopup(1))
	})
}

func TestValidateTopupRange(t *testing.T) {
	withPaymentAmountOptions(t, []int{10, 20, 500}, operation_setting.QuotaDisplayTypeUSD)
	gin.SetMode(gin.TestMode)

	cases := []struct {
		name     string
		amount   int64
		minTopup int64
		accepted bool
	}{
		{name: "below the minimum is rejected", amount: 4, minTopup: 5, accepted: false},
		{name: "at the minimum is accepted", amount: 5, minTopup: 5, accepted: true},
		{name: "at the highest preset is accepted", amount: 500, minTopup: 5, accepted: true},
		{name: "above the highest preset is rejected", amount: 501, minTopup: 5, accepted: false},
		{name: "an absurd amount is rejected instead of reaching the gateway", amount: 999999999, minTopup: 5, accepted: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/user/alipay/pay", nil)

			accepted := validateTopupRange(c, tc.amount, tc.minTopup)

			require.Equal(t, tc.accepted, accepted)
			if tc.accepted {
				assert.Empty(t, recorder.Body.String())
				return
			}
			assert.Contains(t, recorder.Body.String(), "充值")
		})
	}
}
