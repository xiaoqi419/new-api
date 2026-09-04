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
import type { CurrencyDisplayType } from '@/stores/system-config-store'

export interface QuotaDisplaySnapshot {
  quotaDisplayType: CurrencyDisplayType
  quotaPerUnit: number
  usdExchangeRate: number
  customCurrencyExchangeRate: number
}

export function quotaThresholdValueForSave(
  currentDisplayedValue: number | null,
  baselineDisplayedValue: number | null,
  persistedValue: number | null
): number | null {
  if (Object.is(currentDisplayedValue, baselineDisplayedValue)) {
    return persistedValue
  }
  return currentDisplayedValue
}

export function convertDisplayedQuotaBetweenSnapshots(
  value: number,
  from: QuotaDisplaySnapshot,
  to: QuotaDisplaySnapshot
): number | null {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isFinite(from.quotaPerUnit) ||
    from.quotaPerUnit <= 0 ||
    !Number.isFinite(to.quotaPerUnit) ||
    to.quotaPerUnit <= 0
  ) {
    return null
  }

  let normalizedQuota = value
  switch (from.quotaDisplayType) {
    case 'USD':
      normalizedQuota *= from.quotaPerUnit
      break
    case 'CNY':
      if (!Number.isFinite(from.usdExchangeRate) || from.usdExchangeRate <= 0) {
        return null
      }
      normalizedQuota *= from.quotaPerUnit / from.usdExchangeRate
      break
    case 'CUSTOM':
      if (
        !Number.isFinite(from.customCurrencyExchangeRate) ||
        from.customCurrencyExchangeRate <= 0
      ) {
        return null
      }
      normalizedQuota *= from.quotaPerUnit / from.customCurrencyExchangeRate
      break
    case 'TOKENS':
      break
  }

  let displayedValue = normalizedQuota
  switch (to.quotaDisplayType) {
    case 'USD':
      displayedValue /= to.quotaPerUnit
      break
    case 'CNY':
      if (!Number.isFinite(to.usdExchangeRate) || to.usdExchangeRate <= 0) {
        return null
      }
      displayedValue = (displayedValue / to.quotaPerUnit) * to.usdExchangeRate
      break
    case 'CUSTOM':
      if (
        !Number.isFinite(to.customCurrencyExchangeRate) ||
        to.customCurrencyExchangeRate <= 0
      ) {
        return null
      }
      displayedValue =
        (displayedValue / to.quotaPerUnit) * to.customCurrencyExchangeRate
      break
    case 'TOKENS':
      break
  }

  if (!Number.isFinite(displayedValue) || displayedValue <= 0) {
    return null
  }
  return Number.parseFloat(displayedValue.toPrecision(12))
}
