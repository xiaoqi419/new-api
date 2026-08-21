import assert from 'node:assert/strict'

import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('lottie-web', () => ({
  default: { loadAnimation: vi.fn() },
}))
vi.mock('../../../helpers', () => ({
  API: {},
  copy: vi.fn(),
  getQuotaPerUnit: () => 500000,
  renderQuota: vi.fn(),
  renderQuotaWithAmount: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSuccess: vi.fn(),
  timestamp2string: vi.fn(),
}))
vi.mock('../../../helpers/render', () => ({
  getCurrencyConfig: () => ({ symbol: '$', exchangeRate: 1 }),
}))

const { requestClassicGroupBuyJoinEpayCheckout } =
  await import('../../../pages/GroupBuy/index.jsx')
const { requestClassicGroupBuyCreateEpayCheckout } =
  await import('../GroupBuyCard.jsx')
const { requestClassicSubscriptionEpayCheckout } =
  await import('../SubscriptionPlansCard.jsx')
const { requestClassicWalletEpayCheckout } = await import('../index.jsx')

const checkout = {
  trade_no: 'CLASSIC-EPAY-1',
  checkout_type: 'payurl',
  checkout_value: 'https://pay.example/classic',
  payment_method: 'epay_alipay',
  money: '12.50',
}

function browserBoundary() {
  return {
    open: vi.spyOn(window, 'open'),
    submit: vi.spyOn(HTMLFormElement.prototype, 'submit'),
    initialLocation: window.location.href,
  }
}

function assertInSiteCheckout(boundary, checkoutCalls) {
  assert.equal(checkoutCalls.length, 1)
  assert.equal(checkoutCalls[0].trade_no, 'CLASSIC-EPAY-1')
  assert.equal(boundary.open.mock.calls.length, 0)
  assert.equal(window.location.href, boundary.initialLocation)
  assert.equal(boundary.submit.mock.calls.length, 0)
}

describe('classic Epay production entries', () => {
  let api

  beforeEach(() => {
    api = {
      post: vi.fn(async () => ({
        data: { message: 'success', data: checkout },
      })),
    }
  })

  test('wallet API success enters checkout without browser navigation or form submission', async () => {
    const boundary = browserBoundary()
    const checkoutCalls = []
    const result = await requestClassicWalletEpayCheckout({
      api,
      topUpCount: 12,
      paymentMethod: 'epay_alipay',
      money: 12.5,
      onCheckout: (value) => checkoutCalls.push(value),
    })

    assert.equal(result.opened, true)
    assert.deepEqual(api.post.mock.calls[0], [
      '/api/user/epay/checkout',
      { amount: 12, payment_method: 'epay_alipay' },
    ])
    assertInSiteCheckout(boundary, checkoutCalls)
  })

  test('subscription API success enters checkout without browser navigation or form submission', async () => {
    const boundary = browserBoundary()
    const checkoutCalls = []
    const result = await requestClassicSubscriptionEpayCheckout({
      api,
      planId: 31,
      paymentMethod: 'epay_alipay',
      money: 12.5,
      onCheckout: (value) => checkoutCalls.push(value),
    })

    assert.equal(result.opened, true)
    assert.deepEqual(api.post.mock.calls[0], [
      '/api/subscription/epay/pay',
      { plan_id: 31, payment_method: 'epay_alipay' },
    ])
    assertInSiteCheckout(boundary, checkoutCalls)
  })

  test('group-create API success enters checkout without browser navigation or form submission', async () => {
    const boundary = browserBoundary()
    const checkoutCalls = []
    const result = await requestClassicGroupBuyCreateEpayCheckout({
      api,
      packageId: 7,
      paymentMethod: 'epay_alipay',
      scene: 'native',
      money: 12.5,
      onCheckout: (value) => checkoutCalls.push(value),
    })

    assert.equal(result.opened, true)
    assert.deepEqual(api.post.mock.calls[0], [
      '/api/user/groupbuy/create',
      {
        package_id: 7,
        payment_method: 'epay_alipay',
        scene: 'native',
      },
    ])
    assertInSiteCheckout(boundary, checkoutCalls)
  })

  test('group-join API success enters checkout without browser navigation or form submission', async () => {
    const boundary = browserBoundary()
    const checkoutCalls = []
    const result = await requestClassicGroupBuyJoinEpayCheckout({
      api,
      groupNo: 'GROUP-2',
      paymentMethod: 'epay_alipay',
      scene: 'native',
      money: 12.5,
      onCheckout: (value) => checkoutCalls.push(value),
    })

    assert.equal(result.opened, true)
    assert.deepEqual(api.post.mock.calls[0], [
      '/api/user/groupbuy/join',
      {
        group_no: 'GROUP-2',
        payment_method: 'epay_alipay',
        scene: 'native',
      },
    ])
    assertInSiteCheckout(boundary, checkoutCalls)
  })
})
