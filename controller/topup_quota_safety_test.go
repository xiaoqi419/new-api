package controller

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTopupQuotaFromAmountPreservesNormalCredits(t *testing.T) {
	quota, err := topupQuotaFromAmount(2)
	require.NoError(t, err)
	assert.Equal(t, 2*int(common.QuotaPerUnit), quota)
}

func TestTopupQuotaFromAmountRejectsSaturatedCredits(t *testing.T) {
	_, err := topupQuotaFromAmount(math.MaxInt64)
	require.Error(t, err)
	assert.ErrorContains(t, err, "QuotaFromDecimal")

	_, err = topupQuotaFromAmount(-math.MaxInt64)
	require.Error(t, err)
	assert.ErrorContains(t, err, "QuotaFromDecimal")
}
