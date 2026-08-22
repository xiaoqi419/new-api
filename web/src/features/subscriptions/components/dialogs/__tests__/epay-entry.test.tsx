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
  EpayCheckoutDialog: (props: { checkout: { trade_no: string } | null }) => (
    <div data-testid='epay-checkout'>{props.checkout?.trade_no}</div>
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
})
