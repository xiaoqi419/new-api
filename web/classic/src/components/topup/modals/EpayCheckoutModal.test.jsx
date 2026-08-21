/*
Copyright (C) 2025 QuantumNous

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

import assert from 'node:assert/strict'

import { Window } from 'happy-dom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeEach, describe, test, vi } from 'vitest'

import { normalizeEpayCheckout } from '../lib/epay-checkout.js'
import EpayCheckoutModal from './EpayCheckoutModal.jsx'

vi.mock('@douyinfe/semi-ui', () => {
  const MockModal = ({ visible, title, footer, children }) =>
    visible
      ? React.createElement(
          'div',
          { role: 'dialog' },
          React.createElement('h1', null, title),
          children,
          React.createElement('div', { 'data-testid': 'modal-footer' }, footer)
        )
      : null
  const MockButton = ({ children, onClick, disabled, icon }) =>
    React.createElement(
      'button',
      { type: 'button', onClick, disabled },
      icon,
      children
    )
  const MockBanner = ({ description, type }) =>
    React.createElement(
      'div',
      { role: 'status', 'data-type': type },
      description
    )
  const MockSpin = () => React.createElement('span', { role: 'progressbar' })
  const MockText = ({ children }) => React.createElement('span', null, children)

  return {
    Banner: MockBanner,
    Button: MockButton,
    Modal: MockModal,
    Spin: MockSpin,
    Typography: { Text: MockText },
  }
})

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, size, className, 'aria-label': ariaLabel }) =>
    React.createElement('svg', {
      'aria-label': ariaLabel,
      'data-value': value,
      'data-size': size,
      className,
    }),
}))

vi.mock('lucide-react', () => ({
  ExternalLink: () => React.createElement('span', { 'aria-hidden': true }),
  RefreshCw: () => React.createElement('span', { 'aria-hidden': true }),
}))

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLFormElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'CustomEvent',
  'MutationObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
]

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const POLL_INTERVAL_MS = 3000
const POLL_MAX_SECONDS = 300
const checkoutQr = {
  trade_no: 'TRADE-QR-1',
  gateway_trade_no: 'GATEWAY-QR-1',
  checkout_type: 'qrcode',
  checkout_value: 'https://pay.example/qr-token',
  payment_method: 'alipay',
  money: '12.50',
}
const checkoutPayUrl = {
  trade_no: 'TRADE-URL-1',
  checkout_type: 'payurl',
  checkout_value: 'https://pay.example/checkout?trade_no=TRADE-URL-1',
  payment_method: 'alipay',
  money: '20.00',
}

const originalSetInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
const originalDateNow = Date.now
const originalWindowOpen = domWindow.open
let rendered = null
let intervalId = 0
let now = 1000000
const activeIntervals = new Map()

function translate(key) {
  return key
}

function tree(props = {}) {
  return React.createElement(EpayCheckoutModal, {
    t: translate,
    visible: props.visible ?? true,
    checkout: props.checkout === undefined ? checkoutQr : props.checkout,
    getStatus: props.getStatus ?? (async () => ({ status: 'pending' })),
    onSuccess: props.onSuccess,
    onCancel: props.onCancel,
    onRetry: props.onRetry,
  })
}

async function renderModal(props = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  rendered = { host, root }
  await act(async () => {
    root.render(tree(props))
  })
  return rendered
}

async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function tickIntervals() {
  await act(async () => {
    for (const callback of activeIntervals.values()) callback()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function buttonByText(label) {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  assert.ok(button, `Expected button "${label}"`)
  return button
}

async function clickButton(label) {
  const button = buttonByText(label)
  await act(async () => {
    button.dispatchEvent(new domWindow.MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

function bodyHas(text) {
  return document.body.textContent?.includes(text) === true
}

beforeEach(() => {
  activeIntervals.clear()
  now = 1000000
  Date.now = () => now
  globalThis.setInterval = (handler, delay) => {
    assert.equal(delay, POLL_INTERVAL_MS)
    const id = ++intervalId
    activeIntervals.set(id, handler)
    return id
  }
  globalThis.clearInterval = (id) => {
    activeIntervals.delete(Number(id))
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  if (rendered) {
    await act(async () => rendered.root.unmount())
    rendered.host.remove()
    rendered = null
  }
  activeIntervals.clear()
  globalThis.setInterval = originalSetInterval
  globalThis.clearInterval = originalClearInterval
  Date.now = originalDateNow
  domWindow.open = originalWindowOpen
  document.body.replaceChildren()
})

afterAll(() => {
  domWindow.close()
})

describe('normalizeEpayCheckout', () => {
  test('trims supported checkout fields and stringifies numeric money', () => {
    assert.deepEqual(
      normalizeEpayCheckout({
        checkout_type: 'payurl',
        checkout_value: ' https://pay.example/checkout ',
        trade_no: ' TRADE-1 ',
        gateway_trade_no: ' GATEWAY-1 ',
        payment_method: ' alipay ',
        money: 12.5,
      }),
      {
        checkout_type: 'payurl',
        checkout_value: 'https://pay.example/checkout',
        trade_no: 'TRADE-1',
        gateway_trade_no: 'GATEWAY-1',
        payment_method: 'alipay',
        money: '12.5',
      }
    )
  })

  test('rejects missing, blank, or unsupported checkout fields', () => {
    for (const value of [
      null,
      {},
      { ...checkoutQr, checkout_type: 'form' },
      { ...checkoutQr, checkout_value: ' ' },
      { ...checkoutQr, trade_no: '' },
      { ...checkoutQr, payment_method: '' },
      { ...checkoutQr, money: undefined },
    ]) {
      assert.equal(normalizeEpayCheckout(value), null)
    }
  })

  test('normalizes safe legacy pay URLs with trusted request context', () => {
    assert.deepEqual(
      normalizeEpayCheckout(
        {
          trade_no: ' TRADE-LEGACY-1 ',
          pay_url: ' https://pay.example/checkout ',
        },
        { paymentMethod: 'alipay', money: 12.5 }
      ),
      {
        checkout_type: 'payurl',
        checkout_value: 'https://pay.example/checkout',
        trade_no: 'TRADE-LEGACY-1',
        gateway_trade_no: undefined,
        payment_method: 'alipay',
        money: '12.5',
      }
    )
  })
})

describe('EpayCheckoutModal', () => {
  test('renders QR checkout and performs an immediate then 3-second status check', async () => {
    const calls = []
    await renderModal({
      getStatus: async (tradeNo) => {
        calls.push(tradeNo)
        return { data: { status: 'pending' } }
      },
    })
    await settle()

    assert.deepEqual(calls, ['TRADE-QR-1'])
    assert.ok(document.querySelector('[aria-label="支付二维码"]'))
    assert.equal(
      document.querySelector('[data-value="https://pay.example/qr-token"]') !==
        null,
      true
    )
    assert.equal(bodyHas('12.50'), true)
    assert.equal(bodyHas('TRADE-QR-1'), true)
    assert.equal(bodyHas('等待支付'), true)
    assert.equal(activeIntervals.size, 1)

    now += POLL_INTERVAL_MS
    await tickIntervals()
    assert.deepEqual(calls, ['TRADE-QR-1', 'TRADE-QR-1'])
  })

  test('stops polling and invokes success callback for a nested success response', async () => {
    const completed = []
    let calls = 0
    await renderModal({
      onSuccess: () => completed.push(true),
      getStatus: async () => {
        calls += 1
        return calls === 1
          ? { data: { status: 'success' } }
          : { status: 'success' }
      },
    })
    await settle()

    assert.equal(calls, 1)
    assert.deepEqual(completed, [true])
    assert.equal(bodyHas('支付成功'), true)
    assert.equal(activeIntervals.size, 0)
    await tickIntervals()
    assert.equal(calls, 1)
  })

  test('shows failed or expired states and invokes retry only after a terminal status', async () => {
    for (const terminal of ['failed', 'expired']) {
      let retries = 0
      const cancellations = []
      await renderModal({
        checkout: { ...checkoutQr, trade_no: `TRADE-${terminal}` },
        getStatus: async () => ({ data: { status: terminal } }),
        onCancel: (paid) => cancellations.push(paid),
        onRetry: () => {
          retries += 1
        },
      })
      await settle()
      assert.equal(
        bodyHas(terminal === 'failed' ? '支付失败' : '支付已过期'),
        true
      )
      assert.equal(activeIntervals.size, 0)
      await clickButton('返回')
      assert.deepEqual(cancellations, [false])
      await clickButton('重试')
      assert.equal(retries, 1)

      await act(async () => rendered.root.unmount())
      rendered.host.remove()
      rendered = null
      document.body.replaceChildren()
    }
  })

  test('transitions to timeout after 300 seconds without retry and refreshes the same trade number', async () => {
    const calls = []
    let retries = 0
    await renderModal({
      getStatus: async (tradeNo) => {
        calls.push(tradeNo)
        return { status: 'pending' }
      },
      onRetry: () => {
        retries += 1
      },
    })
    await settle()
    now += POLL_MAX_SECONDS * 1000
    await tickIntervals()

    assert.deepEqual(calls, ['TRADE-QR-1'])
    assert.equal(bodyHas('支付状态检查超时'), true)
    assert.equal(activeIntervals.size, 0)
    assert.equal(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === '重试'
      ),
      false
    )

    await clickButton('刷新支付状态')
    assert.deepEqual(calls, ['TRADE-QR-1', 'TRADE-QR-1'])
    assert.equal(retries, 0)
  })

  test('keeps waiting after a temporary status error and completes on the next poll or manual refresh', async () => {
    let calls = 0
    const completed = []
    await renderModal({
      onSuccess: () => completed.push(true),
      getStatus: async () => {
        calls += 1
        if (calls === 1) throw new Error('temporary network error')
        return { status: 'success' }
      },
    })
    await settle()
    assert.equal(calls, 1)
    assert.equal(bodyHas('等待支付'), true)
    assert.equal(activeIntervals.size, 1)

    await clickButton('刷新支付状态')
    assert.equal(calls, 2)
    assert.deepEqual(completed, [true])
    assert.equal(activeIntervals.size, 0)
  })

  test('cleans up polling when hidden or unmounted', async () => {
    const calls = []
    const view = await renderModal({
      getStatus: async (tradeNo) => {
        calls.push(tradeNo)
        return { status: 'pending' }
      },
    })
    await settle()
    assert.equal(activeIntervals.size, 1)

    await act(async () => view.root.render(tree({ visible: false })))
    assert.equal(activeIntervals.size, 0)
    await tickIntervals()
    assert.equal(calls.length, 1)

    await act(async () => view.root.unmount())
    view.host.remove()
    rendered = null
  })

  test('renders a pay URL as QR-only checkout without any external action', async () => {
    const openCalls = []
    domWindow.open = (...args) => {
      openCalls.push(args)
      return null
    }
    await renderModal({ checkout: checkoutPayUrl })
    await settle()

    assert.deepEqual(openCalls, [])
    assert.equal(document.querySelector('form'), null)
    assert.equal(document.body.innerHTML.includes('submit.php'), false)
    assert.equal(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === '打开支付宝'
      ),
      false
    )
    assert.ok(document.querySelector('[aria-label="支付二维码"]'))
    assert.deepEqual(openCalls, [])
  })

  test('allows only provider-specific url schemes and never renders an unsafe action', async () => {
    const openCalls = []
    domWindow.open = (...args) => {
      openCalls.push(args)
      return null
    }
    await renderModal({
      checkout: {
        ...checkoutQr,
        checkout_type: 'urlscheme',
        checkout_value: 'javascript:alert(1)',
      },
    })
    await settle()
    assert.equal(
      [...document.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('打开')
      ),
      false
    )
    assert.deepEqual(openCalls, [])

    await act(async () => rendered.root.unmount())
    rendered.host.remove()
    rendered = null
    document.body.replaceChildren()

    await renderModal({
      checkout: {
        ...checkoutQr,
        checkout_type: 'urlscheme',
        checkout_value: 'alipays://platformapi/startapp',
      },
    })
    await settle()
    assert.equal(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === '打开支付宝'
      ),
      false
    )
    assert.deepEqual(openCalls, [])
  })
})
