import assert from 'node:assert/strict'

import { afterEach, describe, test, vi } from 'vitest'

import {
  openGroupBuyEpayCheckout,
  openSubscriptionEpayCheckout,
  openWalletEpayCheckout,
} from '../payment'

const response = {
  trade_no: 'TRADE-MODERN-1',
  checkout_type: 'payurl',
  checkout_value: 'https://pay.example/checkout',
  payment_method: 'alipay',
  money: '12.50',
}

afterEach(() => vi.restoreAllMocks())

describe('modern Epay entry behavior', () => {
  test.each([
    ['wallet', openWalletEpayCheckout],
    ['subscription', openSubscriptionEpayCheckout],
    ['group-buy create', openGroupBuyEpayCheckout],
    ['group-buy join', openGroupBuyEpayCheckout],
  ])(
    '%s resolves successful Epay data into the in-site modal',
    (_name, enterPayment) => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null)
      const submit = vi
        .spyOn(HTMLFormElement.prototype, 'submit')
        .mockImplementation(() => undefined)
      const locationBefore = window.location.href
      const modals: unknown[] = []
      const opened = enterPayment(
        response,
        { paymentMethod: 'alipay', money: '12.50' },
        (value) => modals.push(value)
      )

      assert.equal(opened, true)
      assert.equal(modals.length, 1)
      assert.equal(open.mock.calls.length, 0)
      assert.equal(submit.mock.calls.length, 0)
      assert.equal(window.location.href, locationBefore)
    }
  )
})
