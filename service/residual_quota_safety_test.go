package service

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
)

func TestCalcViolationFeeQuotaRejectsNonFiniteAndOverflow(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })
	common.QuotaPerUnit = 500000

	assert.Equal(t, 500000, calcViolationFeeQuota(1, 1))
	assert.Zero(t, calcViolationFeeQuota(math.NaN(), 1))
	assert.Zero(t, calcViolationFeeQuota(1, math.Inf(1)))
	assert.Zero(t, calcViolationFeeQuota(math.MaxFloat64, 1))

	common.QuotaPerUnit = math.NaN()
	assert.Zero(t, calcViolationFeeQuota(1, 1))
}
