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

import { PAYMENT_TYPES } from '../../constants'
import type { TopupInfo } from '../../types'
import {
  dispatchSelectedPayment,
  getDefaultPaymentType,
  getMinTopupAmount,
  hasConfigurableTopup,
  isWechatDirectPayment,
} from '../payment'

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

describe('direct WeChat Pay dispatch', () => {
  test('classifies wechatpay as direct without capturing generic wxpay', () => {
    assert.equal(isWechatDirectPayment(PAYMENT_TYPES.WECHAT_DIRECT), true)
    assert.equal(isWechatDirectPayment(PAYMENT_TYPES.WECHAT), false)
  })

  test('sends wechatpay to the dedicated processor', async () => {
    const calls: string[] = []
    const success = await dispatchSelectedPayment(
      { name: 'WeChat Pay', type: PAYMENT_TYPES.WECHAT_DIRECT },
      80,
      null,
      {
        regular: async () => {
          calls.push('regular')
          return false
        },
        waffo: async () => false,
        waffoPancake: async () => false,
        alipay: async () => false,
        wechat: async (amount) => {
          calls.push(`wechat:${amount}`)
          return true
        },
      }
    )

    assert.equal(success, true)
    assert.deepEqual(calls, ['wechat:80'])
  })

  test('keeps wxpay on the generic payment processor', async () => {
    const calls: string[] = []
    const success = await dispatchSelectedPayment(
      { name: 'WeChat Pay', type: PAYMENT_TYPES.WECHAT },
      80,
      null,
      {
        regular: async (amount, paymentType) => {
          calls.push(`regular:${amount}:${paymentType}`)
          return true
        },
        waffo: async () => false,
        waffoPancake: async () => false,
        alipay: async () => false,
        wechat: async () => {
          calls.push('wechat')
          return false
        },
      }
    )

    assert.equal(success, true)
    assert.deepEqual(calls, ['regular:80:wxpay'])
  })
})

describe('direct WeChat Pay availability', () => {
  test('keeps the standard topup controls visible for a WeChat-only setup', () => {
    const topupInfo = buildTopupInfo({
      enable_wechatpay_topup: true,
      min_topup: 6,
      wechatpay_min_topup: 10,
      pay_methods: [
        {
          name: 'WeChat Pay',
          type: PAYMENT_TYPES.WECHAT_DIRECT,
          min_topup: 10,
        },
      ],
    })

    assert.equal(hasConfigurableTopup(topupInfo), true)
    assert.equal(getMinTopupAmount(topupInfo), 6)
    assert.equal(getDefaultPaymentType(topupInfo), PAYMENT_TYPES.WECHAT_DIRECT)
  })

  test('uses direct WeChat Pay as the fallback type when no methods were returned', () => {
    const topupInfo = buildTopupInfo({ enable_wechatpay_topup: true })

    assert.equal(getDefaultPaymentType(topupInfo), PAYMENT_TYPES.WECHAT_DIRECT)
  })
})
