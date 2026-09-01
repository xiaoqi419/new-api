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
import { describe, expect, test } from 'vitest'

import {
  DEFAULT_GMPAY_FEE_CONFIG_JSON,
  getGMPayFeeConfigError,
  parseGMPayFeeConfig,
} from '../gmpay-fee-config'

describe('GMPay fee fallback configuration', () => {
  test('accepts the safe default and keeps the fallback disabled', () => {
    expect(getGMPayFeeConfigError(DEFAULT_GMPAY_FEE_CONFIG_JSON)).toBeNull()
    expect(parseGMPayFeeConfig(DEFAULT_GMPAY_FEE_CONFIG_JSON)).toMatchObject({
      version: 1,
      enabled: false,
      default: { mode: 'fixed', value: '0.00' },
      max_fee: '20.00',
      max_total: '100000.00',
    })
  })

  test('allows an empty value as an explicit disabled fallback', () => {
    expect(getGMPayFeeConfigError('')).toBeNull()
    expect(parseGMPayFeeConfig('')).toMatchObject({
      version: 1,
      enabled: false,
    })
  })

  test('rejects unsupported modes and out-of-range percentages', () => {
    const unsupportedMode = JSON.stringify({
      version: 1,
      default: { mode: 'tiered', value: '1.00' },
    })
    expect(getGMPayFeeConfigError(unsupportedMode)).toBe(
      'GMPay fee mode must be fixed or percent'
    )

    const excessivePercent = JSON.stringify({
      version: 1,
      default: { mode: 'percent', value: '100.01' },
    })
    expect(getGMPayFeeConfigError(excessivePercent)).toBe(
      'GMPay percentage fee must be between 0 and 100'
    )
  })

  test('validates stablecoin override keys and decimal precision', () => {
    const invalidKey = JSON.stringify({
      version: 1,
      overrides: {
        'TRX:tron': { mode: 'fixed', value: '1.00' },
      },
    })
    expect(getGMPayFeeConfigError(invalidKey)).toBe(
      'GMPay fee override key must use TOKEN:network format'
    )

    const excessivePrecision = JSON.stringify({
      version: 1,
      default: { mode: 'fixed', value: '1.1234567' },
    })
    expect(getGMPayFeeConfigError(excessivePrecision)).toBe(
      'GMPay fee value must be a non-negative decimal with up to 6 decimal places'
    )
  })

  test('normalizes omitted optional fields to safe defaults', () => {
    const parsed = parseGMPayFeeConfig(
      JSON.stringify({
        version: 1,
        enabled: true,
        overrides: {
          'usdc:ethereum': { mode: 'percent', value: '1.50' },
        },
      })
    )

    expect(parsed).toEqual({
      version: 1,
      enabled: true,
      default: { mode: 'fixed', value: '0.00' },
      overrides: {
        'usdc:ethereum': { mode: 'percent', value: '1.50' },
      },
      max_fee: '20.00',
      max_total: '100000.00',
    })
  })

  test('requires the version marker used by the backend schema', () => {
    expect(
      getGMPayFeeConfigError(
        JSON.stringify({
          enabled: true,
          default: { mode: 'fixed', value: '1.00' },
        })
      )
    ).toBe('GMPay fee configuration version must be 1')
  })
})
