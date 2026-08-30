import assert from 'node:assert/strict'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, test, vi } from 'vitest'

import type { PlanRecord } from '../../../types'

const { paySubscriptionEpay } = vi.hoisted(() => ({
  paySubscriptionEpay: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/dialog', () => ({
  Dialog: (props: { children: ReactNode; open?: boolean }) =>
    props.open ? <div>{props.children}</div> : null,
}))

vi.mock('@/features/wallet/components/dialogs/epay-checkout-dialog', () => ({
  EpayCheckoutDialog: (props: {
    checkout: {
      trade_no: string
      checkout_type: string
      receive_address?: string
    } | null
  }) => (
    <div
      data-testid='epay-checkout'
      data-checkout-type={props.checkout?.checkout_type}
      data-receive-address={props.checkout?.receive_address}
    >
      {props.checkout?.trade_no}
    </div>
  ),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    currency: { quotaPerUnit: 500000, symbol: '$', exchangeRate: 1 },
  }),
}))

vi.mock('../../../api', () => ({
  paySubscriptionStripe: vi.fn(),
  paySubscriptionCreem: vi.fn(),
  paySubscriptionEpay,
  paySubscriptionWaffoPancake: vi.fn(),
  paySubscriptionBalance: vi.fn(),
  getSubscriptionEpayStatus: vi.fn(),
}))

const { SubscriptionPurchaseDialog } =
  await import('../subscription-purchase-dialog')

const plan: PlanRecord = {
  plan: {
    id: 31,
    title: 'Monthly plan',
    price_amount: 12.5,
    currency: 'USD',
    duration_unit: 'month',
    duration_value: 1,
    quota_reset_period: 'monthly',
    enabled: true,
    sort_order: 1,
    allow_balance_pay: true,
    allow_wallet_overflow: true,
    max_purchase_per_user: 0,
    total_amount: 100,
  },
}

describe('SubscriptionPurchaseDialog Epay production entry', () => {
  beforeEach(() => {
    paySubscriptionEpay.mockClear()
    paySubscriptionEpay.mockResolvedValue({
      message: 'success',
      data: {
        trade_no: 'SUB-EPAY-1',
        checkout_type: 'payurl',
        checkout_value: 'https://pay.example/subscription',
        payment_method: 'epay_alipay',
        money: '12.50',
      },
    })
  })

  test('successful Epay interaction enters checkout without browser navigation or form submission', async () => {
    const open = vi.spyOn(window, 'open')
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit')
    const initialLocation = window.location.href

    render(
      <SubscriptionPurchaseDialog
        open
        onOpenChange={vi.fn()}
        plan={plan}
        enableOnlineTopUp
        epayMethods={[{ type: 'epay_alipay', name: 'Alipay' }]}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Pay' }))

    await waitFor(() => {
      assert.equal(
        screen.getByTestId('epay-checkout').textContent,
        'SUB-EPAY-1'
      )
    })
    assert.deepEqual(paySubscriptionEpay.mock.calls[0], [
      { plan_id: 31, payment_method: 'epay_alipay' },
    ])
    assert.equal(open.mock.calls.length, 0)
    assert.equal(window.location.href, initialLocation)
    assert.equal(submit.mock.calls.length, 0)
  })

  test('native GMPay response enters the same on-site checkout without navigating to a hosted cashier', async () => {
    paySubscriptionEpay.mockResolvedValueOnce({
      message: 'success',
      data: {
        trade_no: 'SUB-GMPAY-1',
        gateway_trade_no: 'GMPAY-GATEWAY-1',
        checkout_type: 'crypto',
        payment_method: 'usdt.tron',
        money: '12.50',
        actual_amount: '12.5123',
        receive_address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        token: 'USDT',
        network: 'TRON',
        expiration_time: 2_000_000_000,
        server_time: 1_999_999_700,
      },
    })
    const open = vi.spyOn(window, 'open')
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit')
    const initialLocation = window.location.href

    render(
      <SubscriptionPurchaseDialog
        open
        onOpenChange={vi.fn()}
        plan={plan}
        enableOnlineTopUp
        epayMethods={[{ type: 'usdt.tron', name: 'USDT (TRON)' }]}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Pay' }))

    const checkout = await screen.findByTestId('epay-checkout')
    assert.equal(checkout.textContent, 'SUB-GMPAY-1')
    assert.equal(checkout.dataset.checkoutType, 'crypto')
    assert.equal(
      checkout.dataset.receiveAddress,
      'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
    )
    assert.deepEqual(paySubscriptionEpay.mock.calls[0], [
      { plan_id: 31, payment_method: 'usdt.tron' },
    ])
    assert.equal(open.mock.calls.length, 0)
    assert.equal(window.location.href, initialLocation)
    assert.equal(submit.mock.calls.length, 0)
  })
})
