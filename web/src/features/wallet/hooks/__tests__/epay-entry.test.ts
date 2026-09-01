import assert from 'node:assert/strict'

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, test, vi } from 'vitest'

import type { EpayCheckoutData, EpayCryptoCheckoutData } from '../../types'

const checkout = {
  trade_no: 'WALLET-EPAY-1',
  checkout_type: 'payurl' as const,
  checkout_value: 'https://pay.example/checkout',
  payment_method: 'alipay',
  money: '12.50',
}

const requestEpayCheckout = vi.fn(async (_request: unknown) => ({
  message: 'success',
  data: checkout as EpayCheckoutData,
}))

vi.mock('../../api', () => ({
  calculateAmount: vi.fn(),
  calculateStripeAmount: vi.fn(),
  calculateWaffoAmount: vi.fn(),
  calculateWaffoPancakeAmount: vi.fn(),
  requestPayment: vi.fn(),
  requestEpayCheckout,
  requestStripePayment: vi.fn(),
  isApiSuccess: (response: { message?: string; success?: boolean }) =>
    response.message === 'success' || response.success === true,
}))

const { usePayment } = await import('../use-payment')

describe('wallet Epay production entry', () => {
  beforeEach(() => requestEpayCheckout.mockClear())

  test('opens checkout state without external navigation or form submission', async () => {
    const open = vi.spyOn(window, 'open')
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit')
    const initialLocation = window.location.href
    const view = renderHook(() => usePayment())

    await act(async () => {
      await view.result.current.processPayment(10, 'alipay')
    })

    assert.equal(requestEpayCheckout.mock.calls.length, 1)
    assert.equal(view.result.current.epayCheckout?.trade_no, 'WALLET-EPAY-1')
    assert.equal(open.mock.calls.length, 0)
    assert.equal(window.location.href, initialLocation)
    assert.equal(submit.mock.calls.length, 0)
  })

  test('passes the selected native crypto asset as a pair to checkout', async () => {
    const cryptoCheckout: EpayCryptoCheckoutData = {
      trade_no: 'WALLET-CRYPTO-1',
      checkout_type: 'crypto',
      payment_method: 'usdt.solana',
      money: '10.00',
      actual_amount: '9.99',
      receive_address: 'So11111111111111111111111111111111111111112',
      token: 'USDT',
      network: 'SOLANA',
      expiration_time: 1_700_000_300,
    }
    requestEpayCheckout.mockResolvedValueOnce({
      message: 'success',
      data: cryptoCheckout,
    })
    const view = renderHook(() => usePayment())

    await act(async () => {
      await view.result.current.processPayment(10, 'usdt.solana', {
        network: 'solana',
        token: 'USDT',
        display_name: 'Solana',
      })
    })

    assert.deepEqual(requestEpayCheckout.mock.calls[0]?.[0], {
      amount: 10,
      payment_method: 'usdt.solana',
      network: 'solana',
      token: 'usdt',
    })
    const checkout = view.result.current.epayCheckout
    assert.equal(checkout?.checkout_type, 'crypto')
    if (checkout?.checkout_type === 'crypto') {
      assert.equal(checkout.network, 'SOLANA')
      assert.equal(checkout.token, 'USDT')
    }
  })
})
