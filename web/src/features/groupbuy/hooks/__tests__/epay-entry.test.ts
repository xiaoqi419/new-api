import assert from 'node:assert/strict'

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, test, vi } from 'vitest'

const api = vi.hoisted(() => ({
  cancelGroupBuyPayment: vi.fn(),
  createGroupBuy: vi.fn(),
  getPayInfo: vi.fn(),
  joinGroupBuy: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../api', () => api)

const { useGroupBuyPayment } = await import('../use-group-buy-payment')

function mockCheckout(tradeNo: string, groupNo: string) {
  return {
    message: 'success',
    data: {
      trade_no: tradeNo,
      group_no: groupNo,
      checkout_type: 'payurl' as const,
      checkout_value: `https://pay.example/${tradeNo}`,
      payment_method: 'epay_alipay',
      money: '18.80',
    },
  }
}

describe('useGroupBuyPayment Epay production entries', () => {
  beforeEach(() => {
    api.getPayInfo.mockResolvedValue({
      success: true,
      data: {
        enable_online_topup: true,
        pay_methods: [{ type: 'epay_alipay', name: 'Alipay' }],
      },
    })
  })

  test('create success enters checkout state without browser navigation or form submission', async () => {
    api.createGroupBuy.mockResolvedValue(mockCheckout('GB-CREATE-1', 'GROUP-1'))
    const open = vi.spyOn(window, 'open')
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit')
    const initialLocation = window.location.href
    const view = renderHook(() => useGroupBuyPayment())

    await waitFor(() => assert.equal(view.result.current.payWay, 'epay_alipay'))
    await act(async () => {
      await view.result.current.create(7, '18.80')
    })

    assert.deepEqual(api.createGroupBuy.mock.calls[0], [
      { package_id: 7, payment_method: 'epay_alipay', scene: 'native' },
    ])
    assert.equal(view.result.current.epayCheckout?.trade_no, 'GB-CREATE-1')
    assert.equal(open.mock.calls.length, 0)
    assert.equal(window.location.href, initialLocation)
    assert.equal(submit.mock.calls.length, 0)
  })

  test('join success enters checkout state without browser navigation or form submission', async () => {
    api.joinGroupBuy.mockResolvedValue(mockCheckout('GB-JOIN-1', 'GROUP-2'))
    const open = vi.spyOn(window, 'open')
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit')
    const initialLocation = window.location.href
    const view = renderHook(() => useGroupBuyPayment())

    await waitFor(() => assert.equal(view.result.current.payWay, 'epay_alipay'))
    await act(async () => {
      await view.result.current.join('GROUP-2', '18.80')
    })

    assert.deepEqual(api.joinGroupBuy.mock.calls[0], [
      { group_no: 'GROUP-2', payment_method: 'epay_alipay', scene: 'native' },
    ])
    assert.equal(view.result.current.epayCheckout?.trade_no, 'GB-JOIN-1')
    assert.equal(open.mock.calls.length, 0)
    assert.equal(window.location.href, initialLocation)
    assert.equal(submit.mock.calls.length, 0)
  })
})
