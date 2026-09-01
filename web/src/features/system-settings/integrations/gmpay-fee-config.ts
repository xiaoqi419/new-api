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

/**
 * The fee fallback is intentionally stored as one versioned JSON option.  The
 * backend owns the final validation and calculation; these helpers keep the
 * administrator editor fail-closed and provide the same shape in the form.
 */

export type GMPayFeeMode = 'fixed' | 'percent'

export type GMPayFeeRule = {
  mode: GMPayFeeMode
  value: string
}

export type GMPayFeeConfig = {
  version: 1
  enabled: boolean
  default: GMPayFeeRule
  overrides: Record<string, GMPayFeeRule>
  max_fee: string
  max_total: string
}

export const DEFAULT_GMPAY_FEE_CONFIG: GMPayFeeConfig = {
  version: 1,
  enabled: false,
  default: { mode: 'fixed', value: '0.00' },
  overrides: {},
  max_fee: '20.00',
  max_total: '100000.00',
}

export const DEFAULT_GMPAY_FEE_CONFIG_JSON = JSON.stringify(
  DEFAULT_GMPAY_FEE_CONFIG,
  null,
  2
)

const MAX_FEE = 1_000_000_000
const MAX_TOTAL = 1_000_000_000
const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/
const OVERRIDE_KEY_PATTERN = /^(USDT|USDC):[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/i
const FEE_CONFIG_KEYS = new Set([
  'version',
  'enabled',
  'default',
  'overrides',
  'max_fee',
  'max_total',
])
const RULE_KEYS = new Set(['mode', 'value'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDecimalString(value: unknown, maximum: number, allowZero = true) {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) return false
  const number = Number(value)
  if (!Number.isFinite(number) || number > maximum) return false
  return allowZero || number > 0
}

function validateRule(
  value: unknown,
  maxFee: number,
  override: boolean
): string | null {
  if (!isRecord(value)) {
    return override
      ? 'GMPay fee override must be a JSON object'
      : 'GMPay default fee must be a JSON object'
  }

  for (const key of Object.keys(value)) {
    if (!RULE_KEYS.has(key)) return 'GMPay fee rule contains an unknown field'
  }

  if (value.mode !== 'fixed' && value.mode !== 'percent') {
    return 'GMPay fee mode must be fixed or percent'
  }

  if (!isDecimalString(value.value, MAX_FEE)) {
    return 'GMPay fee value must be a non-negative decimal with up to 6 decimal places'
  }

  const numericValue = Number(value.value)
  if (value.mode === 'percent' && numericValue > 100) {
    return 'GMPay percentage fee must be between 0 and 100'
  }
  if (value.mode === 'fixed' && numericValue > maxFee) {
    return 'GMPay fixed fee exceeds max_fee'
  }

  return null
}

/**
 * Return a translated error key when the editor value is invalid. Empty input
 * is treated as the safe disabled configuration so an administrator can clear
 * the option without making other payment settings unsaveable.
 */
export function getGMPayFeeConfigError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return 'GMPay fee configuration must be valid JSON'
  }

  if (!isRecord(parsed)) {
    return 'GMPay fee configuration must be a JSON object'
  }

  for (const key of Object.keys(parsed)) {
    if (!FEE_CONFIG_KEYS.has(key)) {
      return 'GMPay fee configuration contains an unknown field'
    }
  }

  // The backend treats this as a versioned schema and requires the marker;
  // accepting an omitted version here would let the editor report a value as
  // valid only for the save request to be rejected later.
  if (!Object.hasOwn(parsed, 'version') || parsed.version !== 1) {
    return 'GMPay fee configuration version must be 1'
  }

  if (Object.hasOwn(parsed, 'enabled') && typeof parsed.enabled !== 'boolean') {
    return 'GMPay fee configuration enabled must be a boolean'
  }

  const maxFeeValue = parsed.max_fee ?? DEFAULT_GMPAY_FEE_CONFIG.max_fee
  if (!isDecimalString(maxFeeValue, MAX_FEE)) {
    return 'GMPay max_fee must be a non-negative decimal with up to 6 decimal places'
  }
  const maxFee = Number(maxFeeValue)

  const maxTotalValue = parsed.max_total ?? DEFAULT_GMPAY_FEE_CONFIG.max_total
  if (!isDecimalString(maxTotalValue, MAX_TOTAL, false)) {
    return 'GMPay max_total must be a positive decimal with up to 6 decimal places'
  }

  if (Object.hasOwn(parsed, 'default')) {
    const error = validateRule(parsed.default, maxFee, false)
    if (error) return error
  }

  if (Object.hasOwn(parsed, 'overrides')) {
    if (!isRecord(parsed.overrides)) {
      return 'GMPay fee overrides must be a JSON object'
    }

    for (const [key, rule] of Object.entries(parsed.overrides)) {
      if (!OVERRIDE_KEY_PATTERN.test(key)) {
        return 'GMPay fee override key must use TOKEN:network format'
      }
      const token = key.split(':', 1)[0].toUpperCase()
      if (token !== 'USDT' && token !== 'USDC') {
        return 'GMPay fee override token must be USDT or USDC'
      }
      const error = validateRule(rule, maxFee, true)
      if (error) return error
    }
  }

  return null
}

export function isValidGMPayFeeConfig(value: string) {
  return getGMPayFeeConfigError(value) === null
}

/** Normalize valid input for the reset/preview helpers; invalid input returns null. */
export function parseGMPayFeeConfig(value: string): GMPayFeeConfig | null {
  if (!isValidGMPayFeeConfig(value)) return null

  const trimmed = value.trim()
  if (!trimmed) return { ...DEFAULT_GMPAY_FEE_CONFIG, overrides: {} }

  const parsed = JSON.parse(trimmed) as Record<string, unknown>
  const defaultRule = isRecord(parsed.default)
    ? {
        mode: parsed.default.mode as GMPayFeeMode,
        value: parsed.default.value as string,
      }
    : { ...DEFAULT_GMPAY_FEE_CONFIG.default }
  const overrides: Record<string, GMPayFeeRule> = {}
  if (isRecord(parsed.overrides)) {
    for (const [key, rule] of Object.entries(parsed.overrides)) {
      if (isRecord(rule)) {
        overrides[key] = {
          mode: rule.mode as GMPayFeeMode,
          value: rule.value as string,
        }
      }
    }
  }

  return {
    version: 1,
    enabled: parsed.enabled === true,
    default: defaultRule,
    overrides,
    max_fee:
      typeof parsed.max_fee === 'string'
        ? parsed.max_fee
        : DEFAULT_GMPAY_FEE_CONFIG.max_fee,
    max_total:
      typeof parsed.max_total === 'string'
        ? parsed.max_total
        : DEFAULT_GMPAY_FEE_CONFIG.max_total,
  }
}
