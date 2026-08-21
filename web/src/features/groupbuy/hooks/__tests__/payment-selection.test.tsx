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
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { detectGroupBuyScene } from '../../lib/payment-scene'
import {
  normalizePaymentMethods,
  useGroupBuyPayment,
} from '../use-group-buy-payment'

const mocks = vi.hoisted(() => ({
  cancelGroupBuyPayment: vi.fn(),
  createGroupBuy: vi.fn(),
  getGroupBuyInfo: vi.fn(),
  joinGroupBuy: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/features/groupbuy/api', () => ({
  cancelGroupBuyPayment: mocks.cancelGroupBuyPayment,
  createGroupBuy: mocks.createGroupBuy,
  getGroupBuyInfo: mocks.getGroupBuyInfo,
  joinGroupBuy: mocks.joinGroupBuy,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}))

describe('group-buy payment selection', () => {
  beforeEach(() => {
    mocks.getGroupBuyInfo.mockResolvedValue({
      success: true,
      data: { enabled: true, packages: [], payment_methods: [] },
    })
    mocks.createGroupBuy.mockResolvedValue({ message: 'cancelled' })
    mocks.joinGroupBuy.mockResolvedValue({ message: 'cancelled' })
  })

  test('selects a scene that matches the browser capability', () => {
    expect(detectGroupBuyScene('Mozilla/5.0 (X11; Linux x86_64)')).toBe(
      'native'
    )
    expect(
      detectGroupBuyScene(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile'
      )
    ).toBe('h5')
    expect(
      detectGroupBuyScene(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile MicroMessenger'
      )
    ).toBe('native')
  })

  test.each([
    ['Mozilla/5.0 (X11; Linux x86_64)', 'native'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile', 'h5'],
  ] as const)(
    'requests payment methods with the detected %s browser scene',
    async (userAgent, expectedScene) => {
      vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)

      const { result } = renderHook(() => useGroupBuyPayment())

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.scene).toBe(expectedScene)
      expect(mocks.getGroupBuyInfo).toHaveBeenCalledWith(expectedScene)
    }
  )

  test('drops blank methods and keeps the first method for each trimmed type', () => {
    expect(
      normalizePaymentMethods([
        { name: ' WeChat Pay ', type: ' wechatpay ' },
        { name: 'Duplicate', type: 'wechatpay' },
        { name: '', type: 'alipay_direct' },
        { name: 'Alipay', type: '   ' },
        { name: 'Epay', type: 'epay' },
      ])
    ).toEqual([
      { label: 'WeChat Pay', value: 'wechatpay' },
      { label: 'Epay', value: 'epay' },
    ])
  })

  test('translates official provider labels and preserves custom Epay names', () => {
    expect(
      normalizePaymentMethods([
        { name: '微信支付', type: 'wechatpay' },
        { name: '支付宝', type: 'alipay_direct' },
        { name: '站点自定义支付', type: 'epay' },
      ])
    ).toEqual([
      { label: 'WeChat Pay', value: 'wechatpay' },
      { label: 'Alipay', value: 'alipay_direct' },
      { label: '站点自定义支付', value: 'epay' },
    ])
  })

  test('starts empty and selects the first valid method when loading finishes', async () => {
    mocks.getGroupBuyInfo.mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        packages: [],
        payment_methods: [
          { name: 'Epay', type: 'epay' },
          { name: 'Alipay', type: 'alipay_direct' },
        ],
      },
    })

    const { result } = renderHook(() => useGroupBuyPayment())

    expect(result.current.payWay).toBe('')
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.payWay).toBe('epay')
    expect(result.current.payOptions).toEqual([
      { label: 'Epay', value: 'epay' },
      { label: 'Alipay', value: 'alipay_direct' },
    ])
  })

  test('uses the changed payment method in the create payload', async () => {
    mocks.getGroupBuyInfo.mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        packages: [],
        payment_methods: [
          { name: 'Epay', type: 'epay' },
          { name: 'Alipay', type: 'alipay_direct' },
        ],
      },
    })
    const { result } = renderHook(() => useGroupBuyPayment())
    await waitFor(() => expect(result.current.payWay).toBe('epay'))

    act(() => result.current.setPayWay('alipay_direct'))
    await act(async () => result.current.create(42))

    expect(mocks.createGroupBuy).toHaveBeenCalledWith({
      package_id: 42,
      payment_method: 'alipay_direct',
      scene: 'native',
    })
  })

  test('uses the changed payment method in the join payload', async () => {
    mocks.getGroupBuyInfo.mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        packages: [],
        payment_methods: [
          { name: 'WeChat Pay', type: 'wechatpay' },
          { name: 'Epay', type: 'epay' },
        ],
      },
    })
    const { result } = renderHook(() => useGroupBuyPayment())
    await waitFor(() => expect(result.current.payWay).toBe('wechatpay'))

    act(() => result.current.setPayWay('epay'))
    await act(async () => result.current.join('GB123'))

    expect(mocks.joinGroupBuy).toHaveBeenCalledWith({
      group_no: 'GB123',
      payment_method: 'epay',
      scene: 'native',
    })
  })

  test('does not send create or join requests when no method is available', async () => {
    const { result } = renderHook(() => useGroupBuyPayment())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.create(42))
    await act(async () => result.current.join('GB123'))

    expect(result.current.payWay).toBe('')
    expect(mocks.createGroupBuy).not.toHaveBeenCalled()
    expect(mocks.joinGroupBuy).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledTimes(2)
    expect(mocks.toastError).toHaveBeenNthCalledWith(
      1,
      'No payment methods available. Please contact administrator.'
    )
  })
})
