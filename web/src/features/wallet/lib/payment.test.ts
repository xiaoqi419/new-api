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

import { describe, expect, test } from 'vitest'

import { PAYMENT_TYPES } from '../constants'
import type { TopupInfo } from '../types'
import {
  dispatchSelectedPayment,
  getEpayCheckoutData,
  getDefaultPaymentType,
  getMinTopupAmount,
  isAlipayDirectPayment,
  isNativeCryptoPayment,
  isSafeEpayCheckoutTarget,
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

function buildCryptoCheckout(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    trade_no: 'TRADE-CRYPTO-1',
    payment_method: 'usdt.tron',
    money: '35.00',
    checkout_type: 'crypto',
    actual_amount: '35.000000',
    receive_address: 'TWalletAddress',
    token: 'usdt',
    network: 'tron',
    expiration_time: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  }
}

describe('payment type classification', () => {
  test('keeps Waffo and Waffo Pancake on their dedicated flows', () => {
    expect(isWaffoPayment(PAYMENT_TYPES.WAFFO)).toBe(true)
    expect(isWaffoPayment(PAYMENT_TYPES.WAFFO_PANCAKE)).toBe(false)
    expect(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO_PANCAKE)).toBe(true)
    expect(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO)).toBe(false)
    expect(isStripePayment(PAYMENT_TYPES.STRIPE)).toBe(true)
  })

  test('separates the direct Alipay merchant from the epay Alipay channel', () => {
    assert.equal(isAlipayDirectPayment(PAYMENT_TYPES.ALIPAY_DIRECT), true)
    assert.equal(isAlipayDirectPayment(PAYMENT_TYPES.ALIPAY), false)
  })

  test('keeps legacy TRON on EPay when Native asset capabilities are absent', () => {
    assert.equal(isNativeCryptoPayment('usdt.tron', buildTopupInfo({})), false)
    assert.equal(
      isNativeCryptoPayment(
        'usdt.tron',
        buildTopupInfo({ crypto_assets: undefined })
      ),
      false
    )
  })

  test('recognizes Native crypto when the asset capability is present', () => {
    assert.equal(
      isNativeCryptoPayment('usdt.tron', buildTopupInfo({ crypto_assets: [] })),
      true
    )
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
    assert.equal(isSafePaymentRedirectUrl('https:checkout.example.com'), false)
    assert.equal(isSafePaymentRedirectUrl('http:checkout.example.com'), false)
    assert.equal(isSafePaymentRedirectUrl('   '), false)
  })
})

describe('Epay checkout target safety', () => {
  test('accepts the allowlisted app schemes for their matching payment methods', () => {
    assert.equal(
      isSafeEpayCheckoutTarget(
        'urlscheme',
        'alipay://platformapi/startapp',
        PAYMENT_TYPES.ALIPAY
      ),
      true
    )
    assert.equal(
      isSafeEpayCheckoutTarget(
        'urlscheme',
        'alipays://platformapi/startapp',
        PAYMENT_TYPES.ALIPAY
      ),
      true
    )
    assert.equal(
      isSafeEpayCheckoutTarget(
        'urlscheme',
        'weixin://dl/business',
        PAYMENT_TYPES.WECHAT
      ),
      true
    )
    assert.equal(
      isSafeEpayCheckoutTarget('urlscheme', 'wxp://f2f0', PAYMENT_TYPES.WECHAT),
      true
    )
  })

  test('rejects executable, data, unknown, and mismatched app schemes', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'unknown://checkout',
    ]) {
      assert.equal(
        isSafeEpayCheckoutTarget('urlscheme', value, PAYMENT_TYPES.ALIPAY),
        false
      )
    }
    assert.equal(
      isSafeEpayCheckoutTarget(
        'urlscheme',
        'alipays://platformapi/startapp',
        PAYMENT_TYPES.WECHAT
      ),
      false
    )
  })
})

describe('Epay checkout normalization', () => {
  test('normalizes a legacy pay_url into in-modal checkout data', () => {
    assert.deepEqual(
      getEpayCheckoutData(
        {
          trade_no: ' TRADE-LEGACY-1 ',
          pay_url: ' https://pay.example.com/checkout?id=1 ',
        },
        { paymentMethod: PAYMENT_TYPES.ALIPAY, money: '12.50' }
      ),
      {
        trade_no: 'TRADE-LEGACY-1',
        checkout_type: 'payurl',
        checkout_value: 'https://pay.example.com/checkout?id=1',
        payment_method: PAYMENT_TYPES.ALIPAY,
        money: '12.50',
      }
    )
  })

  test('normalizes a legacy qr_code without navigating to it', () => {
    assert.deepEqual(
      getEpayCheckoutData(
        { trade_no: 'TRADE-LEGACY-2', qr_code: 'weixin://wxpay/token' },
        { paymentMethod: PAYMENT_TYPES.WECHAT, money: 8 }
      ),
      {
        trade_no: 'TRADE-LEGACY-2',
        checkout_type: 'qrcode',
        checkout_value: 'weixin://wxpay/token',
        payment_method: PAYMENT_TYPES.WECHAT,
        money: '8',
      }
    )
  })

  test('rejects unsafe or incomplete legacy checkout data', () => {
    assert.equal(
      getEpayCheckoutData(
        { trade_no: 'TRADE-UNSAFE', pay_url: 'javascript:alert(1)' },
        { paymentMethod: PAYMENT_TYPES.ALIPAY, money: '10.00' }
      ),
      null
    )
    assert.equal(
      getEpayCheckoutData({
        trade_no: 'TRADE-INCOMPLETE',
        pay_url: 'https://pay.example.com/checkout',
      }),
      null
    )
  })

  test('preserves validated crypto amount breakdown and fee provenance', () => {
    const checkout = getEpayCheckoutData(
      buildCryptoCheckout({
        base_amount: '30.00',
        fee_amount: 5,
        total_amount: '35.00',
        fee_source: 'admin_fixed',
      }),
      { paymentMethod: 'usdt.tron' }
    )

    expect(checkout).toMatchObject({
      checkout_type: 'crypto',
      base_amount: '30.00',
      fee_amount: '5',
      total_amount: '35.00',
      fee_source: 'admin_fixed',
    })
  })

  test('keeps optional crypto fields absent when the gateway omits them', () => {
    const checkout = getEpayCheckoutData(buildCryptoCheckout(), {
      paymentMethod: 'usdt.tron',
    })

    expect(checkout).not.toBeNull()
    expect(checkout && 'base_amount' in checkout).toBe(false)
    expect(checkout && 'fee_amount' in checkout).toBe(false)
    expect(checkout && 'total_amount' in checkout).toBe(false)
    expect(checkout && 'fee_source' in checkout).toBe(false)
  })

  test('rejects malformed or untrusted optional crypto fee fields', () => {
    const invalidFields: Array<[string, unknown]> = [
      ['base_amount', '-1'],
      ['fee_amount', Number.NaN],
      ['total_amount', Number.POSITIVE_INFINITY],
      ['fee_amount', '1.0000001'],
      ['total_amount', '1000000000.01'],
      ['fee_source', 'custom_source'],
      ['fee_source', 5],
    ]

    for (const [field, value] of invalidFields) {
      expect(
        getEpayCheckoutData(buildCryptoCheckout({ [field]: value }), {
          paymentMethod: 'usdt.tron',
        })
      ).toBeNull()
    }
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
        wechat: async () => {
          calls.push('wechat')
          return false
        },
      }
    )

    expect(success).toBe(true)
    expect(calls).toEqual(['waffo:120:3'])
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
        wechat: async () => false,
      }
    )

    expect(success).toBe(false)
    expect(called).toBe(false)
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
        wechat: async () => false,
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
        wechat: async () => false,
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
