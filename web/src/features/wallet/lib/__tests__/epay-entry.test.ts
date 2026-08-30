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

  test('normalizes GMPay native crypto details without retaining its hosted payment URL', () => {
    const modals: unknown[] = []

    const opened = openWalletEpayCheckout(
      {
        checkout_type: 'crypto',
        trade_no: ' WALLET-CRYPTO-1 ',
        gateway_trade_no: ' GMPAY-ORDER-1 ',
        payment_method: 'usdt.tron',
        money: '25.00',
        actual_amount: '24.998765',
        receive_address: 'TQ1NativeCheckoutAddress123456789',
        token: 'USDT',
        network: 'TRON',
        expiration_time: 1_700_000_300,
        server_time: 1_700_000_000,
        payment_url: 'https://gateway.example/hosted-cashier',
      },
      { paymentMethod: 'usdt.tron', money: 25 },
      (value) => modals.push(value)
    )

    assert.equal(opened, true)
    assert.deepEqual(modals, [
      {
        checkout_type: 'crypto',
        trade_no: 'WALLET-CRYPTO-1',
        gateway_trade_no: 'GMPAY-ORDER-1',
        payment_method: 'usdt.tron',
        money: '25.00',
        actual_amount: '24.998765',
        receive_address: 'TQ1NativeCheckoutAddress123456789',
        token: 'USDT',
        network: 'TRON',
        expiration_time: 1_700_000_300,
        server_time: 1_700_000_000,
      },
    ])
  })
})
