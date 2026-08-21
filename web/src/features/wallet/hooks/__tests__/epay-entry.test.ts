import assert from 'node:assert/strict'

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, test, vi } from 'vitest'

const checkout = {
  trade_no: 'WALLET-EPAY-1',
  checkout_type: 'payurl' as const,
  checkout_value: 'https://pay.example/checkout',
  payment_method: 'alipay',
  money: '12.50',
}

const requestEpayCheckout = vi.fn(async () => ({
  message: 'success',
  data: checkout,
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
})
