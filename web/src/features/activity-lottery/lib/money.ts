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
import { formatNumber } from '@/lib/format'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
  type CurrencyConfig,
} from '@/stores/system-config-store'

import type { ActivityLotteryCampaign } from '../types'

export interface ActivityLotteryCurrency {
  displayType: CurrencyConfig['quotaDisplayType']
  symbol: string
  rate: number
  label: string
  usesMinorUnits: boolean
  minAmount: number
  maxAmount: number
}

const LEGACY_CNY_CURRENCY: ActivityLotteryCurrency = {
  displayType: 'CNY',
  symbol: '¥',
  rate: 1,
  label: 'CNY',
  usesMinorUnits: true,
  minAmount: 1,
  maxAmount: 10_000_000,
}

function normalizeRate(value: number | undefined, fallback: number): number {
  return value && Number.isFinite(value) && value > 0 ? value : fallback
}

export function activityLotteryCurrencyFromConfig(
  config: CurrencyConfig = DEFAULT_CURRENCY_CONFIG
): ActivityLotteryCurrency {
  switch (config.quotaDisplayType) {
    case 'CNY':
      return {
        ...LEGACY_CNY_CURRENCY,
        rate: normalizeRate(config.usdExchangeRate, 1),
      }
    case 'CUSTOM': {
      const symbol = config.customCurrencySymbol?.trim() || '¤'
      return {
        displayType: 'CUSTOM',
        symbol,
        rate: normalizeRate(config.customCurrencyExchangeRate, 1),
        label: symbol,
        usesMinorUnits: true,
        minAmount: 1,
        maxAmount: 10_000_000,
      }
    }
    case 'TOKENS':
      return {
        displayType: 'TOKENS',
        symbol: '',
        rate: 1,
        label: 'Tokens',
        usesMinorUnits: false,
        minAmount: 1,
        maxAmount: 10_000_000,
      }
    case 'USD':
    default:
      return {
        displayType: 'USD',
        symbol: '$',
        rate: 1,
        label: 'USD',
        usesMinorUnits: true,
        minAmount: 1,
        maxAmount: 10_000_000,
      }
  }
}

export function getCurrentActivityLotteryCurrency(): ActivityLotteryCurrency {
  return activityLotteryCurrencyFromConfig(
    useSystemConfigStore.getState().config.currency
  )
}

export function activityLotteryCurrencyFromCampaign(
  campaign?: Pick<
    ActivityLotteryCampaign,
    'display_currency' | 'display_currency_symbol' | 'display_currency_rate'
  >
): ActivityLotteryCurrency {
  if (!campaign?.display_currency) return LEGACY_CNY_CURRENCY

  const displayType = campaign.display_currency
  if (displayType === 'USD') {
    return activityLotteryCurrencyFromConfig({
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'USD',
    })
  }
  if (displayType === 'CNY') {
    return {
      ...LEGACY_CNY_CURRENCY,
      rate: normalizeRate(campaign.display_currency_rate, 1),
    }
  }
  if (displayType === 'TOKENS') {
    return activityLotteryCurrencyFromConfig({
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'TOKENS',
    })
  }

  const symbol = campaign.display_currency_symbol?.trim() || '¤'
  return {
    displayType: 'CUSTOM',
    symbol,
    rate: normalizeRate(campaign.display_currency_rate, 1),
    label: symbol,
    usesMinorUnits: true,
    minAmount: 1,
    maxAmount: 10_000_000,
  }
}

const CURRENCY_INPUT_RE = /^(0|[1-9]\d{0,5})(?:\.(\d{1,2}))?$/
const TOKEN_INPUT_RE = /^(0|[1-9]\d{0,7})$/

export function parseActivityPrizeAmount(
  value: string,
  currency: ActivityLotteryCurrency
): number | null {
  const normalized = value.trim()
  if (currency.usesMinorUnits) {
    const match = CURRENCY_INPUT_RE.exec(normalized)
    if (!match) return null
    const amount =
      Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
    return amount >= currency.minAmount && amount <= currency.maxAmount
      ? amount
      : null
  }

  if (!TOKEN_INPUT_RE.test(normalized)) return null
  const amount = Number(normalized)
  return amount >= currency.minAmount && amount <= currency.maxAmount
    ? amount
    : null
}

export function formatActivityPrizeAmount(
  amount: number,
  currency: ActivityLotteryCurrency,
  locale: Intl.LocalesArgument
): string {
  const value = currency.usesMinorUnits ? amount / 100 : amount
  const formatted = formatNumber(value, locale)
  return currency.symbol ? `${currency.symbol}${formatted}` : formatted
}

export function formatActivityPrizeLimit(
  amount: number,
  currency: ActivityLotteryCurrency,
  locale: Intl.LocalesArgument = 'en-US'
): string {
  return formatActivityPrizeAmount(amount, currency, locale)
}
