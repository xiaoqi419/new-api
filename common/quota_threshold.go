package common

import (
	"fmt"
	"math"
	"strings"
)

// Quota display units are the units exposed by the dashboard.  Quota values
// persisted in the database remain in the internal token-like unit.
const (
	QuotaDisplayUnitUSD    = "USD"
	QuotaDisplayUnitCNY    = "CNY"
	QuotaDisplayUnitTokens = "TOKENS"
	QuotaDisplayUnitCustom = "CUSTOM"
)

// NormalizeDisplayedQuotaThreshold converts a value entered in the current
// display unit to the internal quota representation.  The caller should save
// the display unit and exchange-rate snapshot alongside the returned value so
// changing site display settings cannot reinterpret an existing threshold.
func NormalizeDisplayedQuotaThreshold(value float64, displayUnit string, quotaPerUnit, usdExchangeRate, customExchangeRate float64) (int, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 {
		return 0, fmt.Errorf("quota threshold must be finite and greater than zero")
	}
	displayUnit = strings.ToUpper(strings.TrimSpace(displayUnit))
	if quotaPerUnit <= 0 || math.IsNaN(quotaPerUnit) || math.IsInf(quotaPerUnit, 0) {
		return 0, fmt.Errorf("quota per unit must be finite and greater than zero")
	}
	factor := float64(1)
	switch displayUnit {
	case QuotaDisplayUnitUSD:
		factor = quotaPerUnit
	case QuotaDisplayUnitCNY:
		if usdExchangeRate <= 0 || math.IsNaN(usdExchangeRate) || math.IsInf(usdExchangeRate, 0) {
			return 0, fmt.Errorf("USD exchange rate must be finite and greater than zero")
		}
		factor = quotaPerUnit / usdExchangeRate
	case QuotaDisplayUnitCustom:
		if customExchangeRate <= 0 || math.IsNaN(customExchangeRate) || math.IsInf(customExchangeRate, 0) {
			return 0, fmt.Errorf("custom exchange rate must be finite and greater than zero")
		}
		factor = quotaPerUnit / customExchangeRate
	case QuotaDisplayUnitTokens:
		factor = 1
	default:
		return 0, fmt.Errorf("unsupported quota display unit %q", displayUnit)
	}
	return QuotaFromFloatStrict(value * factor)
}

// DisplayedQuotaThreshold converts an internal threshold back to the display
// unit semantics that were captured when it was saved.
func DisplayedQuotaThreshold(normalized int, displayUnit string, quotaPerUnit, usdExchangeRate, customExchangeRate float64) (float64, error) {
	if normalized <= 0 {
		return 0, fmt.Errorf("quota threshold must be greater than zero")
	}
	if quotaPerUnit <= 0 || math.IsNaN(quotaPerUnit) || math.IsInf(quotaPerUnit, 0) {
		return 0, fmt.Errorf("quota per unit must be finite and greater than zero")
	}
	displayUnit = strings.ToUpper(strings.TrimSpace(displayUnit))
	switch displayUnit {
	case QuotaDisplayUnitUSD:
		return float64(normalized) / quotaPerUnit, nil
	case QuotaDisplayUnitCNY:
		if usdExchangeRate <= 0 || math.IsNaN(usdExchangeRate) || math.IsInf(usdExchangeRate, 0) {
			return 0, fmt.Errorf("USD exchange rate must be finite and greater than zero")
		}
		return float64(normalized) / quotaPerUnit * usdExchangeRate, nil
	case QuotaDisplayUnitCustom:
		if customExchangeRate <= 0 || math.IsNaN(customExchangeRate) || math.IsInf(customExchangeRate, 0) {
			return 0, fmt.Errorf("custom exchange rate must be finite and greater than zero")
		}
		return float64(normalized) / quotaPerUnit * customExchangeRate, nil
	case QuotaDisplayUnitTokens:
		return float64(normalized), nil
	default:
		return 0, fmt.Errorf("unsupported quota display unit %q", displayUnit)
	}
}
