import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { useState } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { GroupBuyLaunchCard } from '../group-buy-launch-card'
import { JoinPanel, type PayOption } from '../join-panel'

const hookState = vi.hoisted(() => ({
  launch: {
    enabled: true,
    loading: false,
    packages: [
      {
        id: 42,
        name: 'Starter Group',
        per_share_price: 10,
        required_count: 2,
        total_amount: 20,
      },
    ],
  },
  payment: {
    closeQrPay: vi.fn(),
    create: vi.fn(),
    join: vi.fn(),
    loading: true,
    payOptions: [] as PayOption[],
    payWay: '',
    qrPay: {
      open: false,
      provider: 'wechat' as const,
      qr: '',
      tradeNo: '',
    },
    setPayWay: vi.fn(),
    submittingId: null as string | number | null,
  },
}))

vi.mock('@/features/groupbuy/hooks/use-group-buy-launch', () => ({
  useGroupBuyLaunch: () => hookState.launch,
}))

vi.mock('@/features/groupbuy/hooks/use-group-buy-payment', () => ({
  useGroupBuyPayment: () => hookState.payment,
}))

vi.mock('@/features/wallet/components/dialogs/payment-qr-dialog', () => ({
  PaymentQrDialog: () => null,
}))

const detail = {
  expire_time: Math.floor(Date.now() / 1000) + 3600,
  group_no: 'GB123',
  per_share_amount: 20,
  per_share_price: 10,
  required_count: 2,
  status: 'pending' as const,
}

describe('group-buy payment controls', () => {
  beforeEach(() => {
    hookState.payment.loading = true
    hookState.payment.payOptions = []
    hookState.payment.payWay = ''
  })

  test('launch card disables payment controls while loading and shows the empty state afterwards', () => {
    const { rerender } = render(<GroupBuyLaunchCard />)

    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Start Group Buy' })
    ).toBeDisabled()
    expect(
      screen.queryByText(
        'No payment methods available. Please contact administrator.'
      )
    ).not.toBeInTheDocument()

    hookState.payment.loading = false
    rerender(<GroupBuyLaunchCard />)

    expect(
      screen.getByText(
        'No payment methods available. Please contact administrator.'
      )
    ).toBeVisible()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Start Group Buy' })
    ).toBeDisabled()
  })

  test('join panel disables payment controls while loading and shows the empty state afterwards', () => {
    const props = {
      canJoin: true,
      currentAmount: 20,
      detail,
      onJoin: vi.fn(),
      onPayWayChange: vi.fn(),
      payOptions: [] as PayOption[],
      payWay: '',
      paymentMethodsLoading: true,
      shareLink: 'https://example.com/groupbuy/detail?no=GB123',
      submitting: false,
    }
    const { rerender } = render(<JoinPanel {...props} />)

    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Join Now/ })).toBeDisabled()
    expect(
      screen.queryByText(
        'No payment methods available. Please contact administrator.'
      )
    ).not.toBeInTheDocument()

    rerender(<JoinPanel {...props} paymentMethodsLoading={false} />)

    expect(
      screen.getByText(
        'No payment methods available. Please contact administrator.'
      )
    ).toBeVisible()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Join Now/ })).toBeDisabled()
  })

  test('join panel updates the trigger label after a real payment selection', async () => {
    const user = userEvent.setup()
    const options = [
      { label: 'WeChat Pay', value: 'wechatpay' },
      { label: 'Alipay', value: 'alipay_direct' },
    ]

    function SelectionHarness() {
      const [payWay, setPayWay] = useState('wechatpay')
      return (
        <JoinPanel
          detail={detail}
          currentAmount={20}
          canJoin
          payWay={payWay}
          onPayWayChange={setPayWay}
          payOptions={options}
          paymentMethodsLoading={false}
          submitting={false}
          onJoin={vi.fn()}
          shareLink='https://example.com/groupbuy/detail?no=GB123'
        />
      )
    }

    render(<SelectionHarness />)
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveTextContent('WeChat Pay')

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'Alipay' }))

    expect(trigger).toHaveTextContent('Alipay')
  })
})
