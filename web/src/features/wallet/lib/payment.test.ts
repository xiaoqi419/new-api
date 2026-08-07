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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { PAYMENT_TYPES } from '../constants'
import type { TopupInfo } from '../types'
import {
  dispatchSelectedPayment,
  getDefaultPaymentType,
  getMinTopupAmount,
  isAlipayDirectPayment,
  isSafePaymentRedirectUrl,
  isStripePayment,
  isWaffoPayment,
  isWaffoPancakePayment,
} from './payment'

function buildTopupInfo(overrides: Partial<TopupInfo>): TopupInfo {
  return {
    enable_online_topup: false,
    enable_stripe_topup: false,
    pay_methods: [],
    min_topup: 1,
    stripe_min_topup: 1,
    amount_options: [],
    discount: {},
    ...overrides,
  }
}

describe('payment type classification', () => {
  test('keeps Waffo and Waffo Pancake on their dedicated flows', () => {
    assert.equal(isWaffoPayment(PAYMENT_TYPES.WAFFO), true)
    assert.equal(isWaffoPayment(PAYMENT_TYPES.WAFFO_PANCAKE), false)
    assert.equal(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO_PANCAKE), true)
    assert.equal(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO), false)
    assert.equal(isStripePayment(PAYMENT_TYPES.STRIPE), true)
  })

  test('separates the direct Alipay merchant from the epay Alipay channel', () => {
    assert.equal(isAlipayDirectPayment(PAYMENT_TYPES.ALIPAY_DIRECT), true)
    assert.equal(isAlipayDirectPayment(PAYMENT_TYPES.ALIPAY), false)
  })
})

describe('payment redirect URL safety', () => {
  test('accepts http and https targets only', () => {
    assert.equal(
      isSafePaymentRedirectUrl('https://openapi.alipay.com/gateway.do?x=1'),
      true
    )
    assert.equal(isSafePaymentRedirectUrl('http://pay.example.com'), true)
    assert.equal(isSafePaymentRedirectUrl('javascript:alert(1)'), false)
    assert.equal(isSafePaymentRedirectUrl('/console/log'), false)
    assert.equal(isSafePaymentRedirectUrl('   '), false)
  })
})

describe('payment dispatch', () => {
  test('keeps the selected Waffo method index through confirmation', async () => {
    const calls: string[] = []
    const success = await dispatchSelectedPayment(
      { name: 'Waffo Card', type: PAYMENT_TYPES.WAFFO },
      120,
      3,
      {
        regular: async () => {
          calls.push('regular')
          return false
        },
        waffo: async (amount, index) => {
          calls.push(`waffo:${amount}:${index}`)
          return true
        },
        waffoPancake: async () => {
          calls.push('pancake')
          return false
        },
        alipay: async () => {
          calls.push('alipay')
          return false
        },
      }
    )

    assert.equal(success, true)
    assert.deepEqual(calls, ['waffo:120:3'])
  })

  test('does not create a Waffo order without a selected method index', async () => {
    let called = false
    const success = await dispatchSelectedPayment(
      { name: 'Waffo Card', type: PAYMENT_TYPES.WAFFO },
      120,
      null,
      {
        regular: async () => false,
        waffo: async () => {
          called = true
          return true
        },
        waffoPancake: async () => false,
        alipay: async () => false,
      }
    )

    assert.equal(success, false)
    assert.equal(called, false)
  })

  test('sends the direct Alipay merchant method to its own processor', async () => {
    const calls: string[] = []
    const success = await dispatchSelectedPayment(
      { name: '支付宝', type: PAYMENT_TYPES.ALIPAY_DIRECT },
      50,
      null,
      {
        regular: async () => {
          calls.push('regular')
          return false
        },
        waffo: async () => false,
        waffoPancake: async () => false,
        alipay: async (amount) => {
          calls.push(`alipay:${amount}`)
          return true
        },
      }
    )

    assert.equal(success, true)
    assert.deepEqual(calls, ['alipay:50'])
  })

  test('keeps the epay Alipay channel on the generic epay form flow', async () => {
    const calls: string[] = []
    await dispatchSelectedPayment(
      { name: '支付宝', type: PAYMENT_TYPES.ALIPAY },
      50,
      null,
      {
        regular: async (amount, paymentType) => {
          calls.push(`regular:${amount}:${paymentType}`)
          return true
        },
        waffo: async () => false,
        waffoPancake: async () => false,
        alipay: async () => {
          calls.push('alipay')
          return true
        },
      }
    )

    assert.deepEqual(calls, ['regular:50:alipay'])
  })
})

describe('direct Alipay availability', () => {
  test('keeps the topup form usable when Alipay is the only enabled gateway', () => {
    const topupInfo = buildTopupInfo({
      enable_alipay_topup: true,
      min_topup: 6,
      alipay_min_topup: 10,
      pay_methods: [
        { name: '支付宝', type: PAYMENT_TYPES.ALIPAY_DIRECT, min_topup: 10 },
      ],
    })

    assert.equal(getMinTopupAmount(topupInfo), 6)
    assert.equal(getDefaultPaymentType(topupInfo), PAYMENT_TYPES.ALIPAY_DIRECT)
  })

  test('falls back to direct Alipay when the backend returned no pay methods', () => {
    const topupInfo = buildTopupInfo({ enable_alipay_topup: true })

    assert.equal(getDefaultPaymentType(topupInfo), PAYMENT_TYPES.ALIPAY_DIRECT)
  })
})
