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
*/
import assert from 'node:assert/strict'

import { Window } from 'happy-dom'
import { afterAll, afterEach, beforeEach, describe, test } from 'vitest'

import type { EpayCheckoutData, TradeStatusResponse } from '../../types'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLFormElement',
  'HTMLInputElement',
  'HTMLIFrameElement',
  'SVGElement',
  'Node',
  'Element',
  'Text',
  'Comment',
  'DocumentFragment',
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
] as const

// React DOM needs constructors from the same realm as the document it renders
// into. Restore the original descriptors after this file so its jsdom/Bun
// environment is not leaked to other test files.
const originalDomDescriptors = new Map<string, PropertyDescriptor | undefined>()
for (const key of domGlobals) {
  originalDomDescriptors.set(
    key,
    Object.getOwnPropertyDescriptor(globalThis, key)
  )
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
    writable: true,
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { EpayCheckoutDialog } = await import('./epay-checkout-dialog')
const { POLL_INTERVAL_MS, POLL_MAX_SECONDS } = await import('../../constants')

const translationKeys = [
  'Amount Due',
  'Complete this payment without leaving the current page.',
  'Open Alipay',
  'Open payment page',
  'Open WeChat',
  'Order number',
  'Payment checkout',
  'Payment completed. Returning to the previous page.',
  'Payment failed',
  'Payment failed. You can retry or return.',
  'Payment expired',
  'Payment expired. You can retry or return.',
  'Payment Method',
  'Payment QR code',
  'Payment status check timed out',
  'Payment status check timed out. You can refresh manually.',
  'Payment successful',
  'Refresh payment status',
  'Retry',
  'Return',
  'Scan the QR code to complete your payment.',
  'Send the exact amount to the address shown.',
  'Waiting for payment',
] as const

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: Object.fromEntries(translationKeys.map((key) => [key, key])),
    },
    zh: {
      translation: { Return: '返回' },
    },
  },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
const originalReactActDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'IS_REACT_ACT_ENVIRONMENT'
)
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

type DialogProps = {
  open?: boolean
  checkout?: EpayCheckoutData | null
  getStatus?: (tradeNo: string) => Promise<TradeStatusResponse>
  onClose?: () => void
  onSuccess?: () => void | Promise<void>
  onRetry?: () => void | Promise<void>
}

type RenderedDialog = {
  host: HTMLDivElement
  root: ReturnType<typeof createRoot>
}

const checkoutQr: EpayCheckoutData = {
  checkout_type: 'qrcode',
  checkout_value: 'https://pay.example/qr-token',
  trade_no: 'TRADE-QR-1',
  payment_method: 'alipay',
  money: '$12.50',
}

const checkoutUrl: EpayCheckoutData = {
  checkout_type: 'payurl',
  checkout_value: 'https://pay.example/checkout?trade_no=TRADE-URL-1',
  trade_no: 'TRADE-URL-1',
  payment_method: 'alipay',
  money: '$20.00',
}

const originalLocationAssign = domWindow.location.assign
const originalWindowOpen = domWindow.open
const originalSetInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
const originalDateNow = Date.now

let renderedDialog: RenderedDialog | null = null
let now = 1_000_000
let intervalId = 0
const activeIntervals = new Map<number, () => void>()

function statusResponse(status: string): TradeStatusResponse {
  return { success: true, data: { status } }
}

function dialogTree(props: DialogProps = {}) {
  return (
    <I18nextProvider i18n={i18n}>
      <EpayCheckoutDialog
        open={props.open ?? true}
        checkout={props.checkout === undefined ? checkoutQr : props.checkout}
        getStatus={props.getStatus ?? (async () => statusResponse('pending'))}
        onClose={props.onClose ?? (() => undefined)}
        onSuccess={props.onSuccess ?? (() => undefined)}
        onRetry={props.onRetry}
      />
    </I18nextProvider>
  )
}

async function renderDialog(props: DialogProps = {}): Promise<RenderedDialog> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const rendered = { host, root }
  renderedDialog = rendered

  await act(async () => {
    root.render(dialogTree(props))
  })
  return rendered
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function tickIntervals(): Promise<void> {
  await act(async () => {
    now += POLL_INTERVAL_MS
    for (const callback of activeIntervals.values()) callback()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function buttonByText(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  assert.ok(button, `Expected button "${label}"`)
  return button as HTMLButtonElement
}

function hasButton(label: string): boolean {
  return [...document.querySelectorAll('button')].some(
    (candidate) => candidate.textContent?.trim() === label
  )
}

async function clickButton(label: string): Promise<void> {
  const button = buttonByText(label)
  await act(async () => {
    button.dispatchEvent(
      new domWindow.MouseEvent('click', { bubbles: true }) as unknown as Event
    )
    await Promise.resolve()
    await Promise.resolve()
  })
}

function bodyHas(text: string): boolean {
  return document.body.textContent?.includes(text) === true
}

beforeEach(async () => {
  activeIntervals.clear()
  now = 1_000_000
  await i18n.changeLanguage('en')
  Date.now = () => now
  globalThis.setInterval = ((handler: unknown) => {
    const id = ++intervalId
    activeIntervals.set(
      id,
      typeof handler === 'function' ? (handler as () => void) : () => undefined
    )
    return id as unknown as ReturnType<typeof setInterval>
  }) as typeof setInterval
  globalThis.clearInterval = ((id: unknown) => {
    activeIntervals.delete(Number(id))
  }) as typeof clearInterval
})

afterEach(async () => {
  if (renderedDialog) {
    await act(async () => renderedDialog?.root.unmount())
    renderedDialog.host.remove()
    renderedDialog = null
  }
  activeIntervals.clear()
  globalThis.setInterval = originalSetInterval
  globalThis.clearInterval = originalClearInterval
  Date.now = originalDateNow
  domWindow.location.assign = originalLocationAssign
  domWindow.open = originalWindowOpen
  document.body.replaceChildren()
})

afterAll(() => {
  if (originalReactActDescriptor) {
    Object.defineProperty(
      globalThis,
      'IS_REACT_ACT_ENVIRONMENT',
      originalReactActDescriptor
    )
  } else {
    delete reactTestGlobals.IS_REACT_ACT_ENVIRONMENT
  }
  for (const key of domGlobals) {
    const descriptor = originalDomDescriptors.get(key)
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor)
    } else {
      delete (globalThis as Record<string, unknown>)[key]
    }
  }
  domWindow.close()
})

describe('EpayCheckoutDialog', () => {
  test('translates the return action for Chinese users', async () => {
    await i18n.changeLanguage('zh')
    await renderDialog()
    await settle()

    assert.equal(bodyHas('返回'), true)
    assert.equal(hasButton('Return'), false)
  })

  test('renders QR checkout content and performs an immediate then 3-second status check', async () => {
    const calls: string[] = []
    await renderDialog({
      getStatus: async (tradeNo) => {
        calls.push(tradeNo)
        return statusResponse('pending')
      },
    })
    await settle()

    assert.deepEqual(calls, ['TRADE-QR-1'])
    assert.ok(document.querySelector('[aria-label="Payment QR code"]'))
    assert.equal(bodyHas('$12.50'), true)
    assert.equal(bodyHas('TRADE-QR-1'), true)
    assert.equal(bodyHas('Waiting for payment'), true)

    await tickIntervals()
    assert.deepEqual(calls, ['TRADE-QR-1', 'TRADE-QR-1'])
  })

  test('shows success and stops polling when an immediate status check succeeds', async () => {
    let calls = 0
    let successes = 0
    await renderDialog({
      onSuccess: () => {
        successes += 1
      },
      getStatus: async () => {
        calls += 1
        return statusResponse('success')
      },
    })
    await settle()

    assert.equal(calls, 1)
    assert.equal(successes, 1)
    assert.equal(bodyHas('Payment successful'), true)

    await tickIntervals()
    assert.equal(calls, 1)
  })

  test('shows failed state and exposes return and retry actions', async () => {
    let closed = 0
    let retries = 0
    await renderDialog({
      onClose: () => {
        closed += 1
      },
      onRetry: () => {
        retries += 1
      },
      getStatus: async () => statusResponse('failed'),
    })
    await settle()

    assert.equal(bodyHas('Payment failed'), true)
    await clickButton('Retry')
    assert.equal(retries, 1)
    await clickButton('Return')
    assert.equal(closed, 1)

    await tickIntervals()
    assert.equal(retries, 1)
  })

  test('shows expired state and offers retry without reporting a successful close', async () => {
    let closed = 0
    let retries = 0
    await renderDialog({
      onClose: () => {
        closed += 1
      },
      onRetry: () => {
        retries += 1
      },
      getStatus: async () => statusResponse('expired'),
    })
    await settle()

    assert.equal(bodyHas('Payment expired'), true)
    assert.equal(bodyHas('Payment successful'), false)
    await clickButton('Retry')
    assert.equal(retries, 1)
    assert.equal(closed, 0)
  })

  test('transitions to timeout without retry and keeps manual refresh available', async () => {
    const calls: string[] = []
    let retries = 0
    let successes = 0
    await renderDialog({
      onRetry: () => {
        retries += 1
      },
      onSuccess: () => {
        successes += 1
      },
      getStatus: async (tradeNo) => {
        calls.push(tradeNo)
        return statusResponse(calls.length === 1 ? 'pending' : 'success')
      },
    })
    await settle()
    assert.deepEqual(calls, ['TRADE-QR-1'])

    now += POLL_MAX_SECONDS * 1000
    await tickIntervals()
    assert.equal(bodyHas('Payment status check timed out'), true)
    assert.equal(hasButton('Retry'), false)
    assert.equal(hasButton('Refresh payment status'), true)

    await clickButton('Refresh payment status')
    assert.deepEqual(calls, ['TRADE-QR-1', 'TRADE-QR-1'])
    assert.equal(successes, 1)
    assert.equal(retries, 0)
    assert.equal(bodyHas('Payment successful'), true)

    await tickIntervals()
    assert.deepEqual(calls, ['TRADE-QR-1', 'TRADE-QR-1'])
  })

  test('keeps waiting after a transient status request error and retries on the next tick', async () => {
    let calls = 0
    let successes = 0
    await renderDialog({
      onSuccess: () => {
        successes += 1
      },
      getStatus: async () => {
        calls += 1
        if (calls === 1) throw new Error('temporary network failure')
        return statusResponse('success')
      },
    })
    await settle()

    assert.equal(calls, 1)
    assert.equal(bodyHas('Waiting for payment'), true)
    assert.equal(successes, 0)

    await tickIntervals()
    assert.equal(calls, 2)
    assert.equal(successes, 1)
  })

  test('manual refresh checks status immediately and can complete the payment', async () => {
    let calls = 0
    let successes = 0
    await renderDialog({
      onSuccess: () => {
        successes += 1
      },
      getStatus: async () => {
        calls += 1
        return statusResponse(calls === 1 ? 'pending' : 'success')
      },
    })
    await settle()
    assert.equal(calls, 1)
    assert.equal(bodyHas('Waiting for payment'), true)

    await clickButton('Refresh payment status')
    assert.equal(calls, 2)
    assert.equal(successes, 1)
    assert.equal(bodyHas('Payment successful'), true)
    await tickIntervals()
    assert.equal(calls, 2)
  })

  test('cleans up polling when the dialog is unmounted', async () => {
    const calls: string[] = []
    const rendered = await renderDialog({
      getStatus: async (tradeNo) => {
        calls.push(tradeNo)
        return statusResponse('pending')
      },
    })
    await settle()
    assert.deepEqual(calls, ['TRADE-QR-1'])

    await act(async () => rendered.root.unmount())
    renderedDialog = null
    await tickIntervals()
    assert.deepEqual(calls, ['TRADE-QR-1'])
  })

  test('renders a pay URL only as a QR code without any navigation action', async () => {
    let openCalls = 0
    const assigned: string[] = []
    domWindow.open = (() => {
      openCalls += 1
      return null
    }) as typeof domWindow.open
    domWindow.location.assign = ((value: string | URL) => {
      assigned.push(String(value))
    }) as typeof domWindow.location.assign

    await renderDialog({ checkout: checkoutUrl })
    await settle()

    assert.equal(openCalls, 0)
    assert.deepEqual(assigned, [])
    assert.equal(document.querySelector('form'), null)
    assert.equal(document.body.innerHTML.includes('submit.php'), false)
    assert.equal(hasButton('Open Alipay'), false)
    assert.ok(document.querySelector('[aria-label="Payment QR code"]'))
    assert.deepEqual(assigned, [])
    assert.equal(openCalls, 0)
  })

  test('rejects unsafe checkout schemes instead of rendering an actionable link', async () => {
    let assigned = false
    domWindow.location.assign = (() => {
      assigned = true
    }) as typeof domWindow.location.assign

    await renderDialog({
      checkout: { ...checkoutUrl, checkout_value: 'javascript:alert(1)' },
    })
    await settle()

    assert.equal(hasButton('Open Alipay'), false)
    assert.equal(document.querySelector('form'), null)
    assert.equal(document.body.innerHTML.includes('submit.php'), false)
    assert.equal(assigned, false)
  })
})
