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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { POLL_INTERVAL_MS, POLL_MAX_SECONDS } from '../../../constants'
import type {
  EpayCryptoCheckoutData,
  TradeStatusResponse,
} from '../../../types'
import { EpayCheckoutDialog } from '../epay-checkout-dialog'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: { value: string; 'aria-label'?: string }) =>
    createElement('svg', {
      'aria-label': props['aria-label'],
      'data-qr-value': props.value,
    }),
}))

const cryptoCheckout = {
  checkout_type: 'crypto',
  trade_no: 'WALLET-CRYPTO-1',
  gateway_trade_no: 'GMPAY-ORDER-1',
  payment_method: 'usdt.tron',
  money: '25.00',
  actual_amount: '24.998765',
  receive_address: 'TQ1NativeCheckoutAddress123456789',
  token: 'USDT',
  network: 'TRON',
  expiration_time: 1_700_000_300,
  server_time: 1_700_000_000,
  payment_url: 'https://gateway.example/hosted-cashier',
} as EpayCryptoCheckoutData

function pendingStatus(): Promise<TradeStatusResponse> {
  return Promise.resolve({ success: true, data: { status: 'pending' } })
}

describe('native GMPay checkout dialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1_700_000_000_000))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('renders the structured address QR and payment instructions without using the hosted cashier URL', async () => {
    const openedWindow = vi.spyOn(window, 'open')
    const initialLocation = window.location.href
    const getStatus = vi.fn(pendingStatus)

    render(
      <EpayCheckoutDialog
        open
        checkout={cryptoCheckout}
        getStatus={getStatus}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('24.998765 USDT')).toBeVisible()
    expect(screen.getByText('TRON')).toBeVisible()
    expect(screen.getByText('TQ1NativeCheckoutAddress123456789')).toBeVisible()
    expect(screen.getByText('WALLET-CRYPTO-1')).toBeVisible()
    expect(screen.getByText('00:05:00')).toBeVisible()
    expect(screen.getByLabelText('Payment QR code')).toHaveAttribute(
      'data-qr-value',
      'TQ1NativeCheckoutAddress123456789'
    )
    expect(document.body).not.toHaveTextContent(
      'https://gateway.example/hosted-cashier'
    )
    expect(openedWindow).not.toHaveBeenCalled()
    expect(window.location.href).toBe(initialLocation)
  })

  test('localizes the fee source while showing the server-authoritative amount breakdown', async () => {
    const getStatus = vi.fn(pendingStatus)
    render(
      <EpayCheckoutDialog
        open
        checkout={{
          ...cryptoCheckout,
          base_amount: '30.00',
          fee_amount: '5.00',
          total_amount: '35.00',
          fee_source: 'admin_fixed',
        }}
        getStatus={getStatus}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    )

    expect(screen.getByText('30.00')).toBeVisible()
    expect(screen.getByText('5.00')).toBeVisible()
    expect(screen.getByText('35.00')).toBeVisible()
    expect(
      screen.getByText('Fee source: Administrator fixed fee')
    ).toBeVisible()
    expect(screen.queryByText('admin_fixed')).not.toBeInTheDocument()
  })

  test('copies the exact crypto amount and receive address from accessible icon buttons', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(
      <EpayCheckoutDialog
        open
        checkout={cryptoCheckout}
        getStatus={pendingStatus}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    )

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy payment amount' })
      )
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy payment address' })
      )
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenNthCalledWith(1, '24.998765')
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      'TQ1NativeCheckoutAddress123456789'
    )
  })

  test('marks a native order expired at its server-derived deadline and stops automatic polling', async () => {
    const getStatus = vi.fn(pendingStatus)
    render(
      <EpayCheckoutDialog
        open
        checkout={cryptoCheckout}
        getStatus={getStatus}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    )

    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(300_000)
    })

    expect(screen.getByText('Payment expired')).toBeVisible()
    const callsAtExpiry = getStatus.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(getStatus).toHaveBeenCalledTimes(callsAtExpiry)
  })

  test('stops the native countdown interval when the checkout expires', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    render(
      <EpayCheckoutDialog
        open
        checkout={{
          ...cryptoCheckout,
          expiration_time: 1_700_000_001,
        }}
        getStatus={pendingStatus}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    )

    await act(async () => {
      await Promise.resolve()
    })
    const countdownTimer = setIntervalSpy.mock.results.find(
      (_result, index) => setIntervalSpy.mock.calls[index]?.[1] === 1_000
    )?.value
    expect(countdownTimer).toBeDefined()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(clearIntervalSpy).toHaveBeenCalledWith(countdownTimer)
  })

  test.each(['success', 'failed', 'expired'] as const)(
    'clears native intervals when local status becomes %s',
    async (terminalStatus) => {
      const getStatus = vi.fn(() =>
        Promise.resolve({ success: true, data: { status: terminalStatus } })
      )
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      render(
        <EpayCheckoutDialog
          open
          checkout={cryptoCheckout}
          getStatus={getStatus}
          onClose={() => undefined}
          onSuccess={() => undefined}
        />
      )

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      const checkoutTimerHandles = setIntervalSpy.mock.results
        .filter(
          (_result, index) =>
            setIntervalSpy.mock.calls[index]?.[1] === POLL_INTERVAL_MS ||
            setIntervalSpy.mock.calls[index]?.[1] === 1_000
        )
        .map((result) => result.value)
      expect(checkoutTimerHandles).toHaveLength(2)
      for (const timerHandle of checkoutTimerHandles) {
        expect(clearIntervalSpy).toHaveBeenCalledWith(timerHandle)
      }

      const callsAtTerminalStatus = getStatus.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(getStatus).toHaveBeenCalledTimes(callsAtTerminalStatus)
    }
  )

  test('clears native intervals when status polling times out', async () => {
    const getStatus = vi.fn(pendingStatus)
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    render(
      <EpayCheckoutDialog
        open
        checkout={{
          ...cryptoCheckout,
          expiration_time: 1_700_001_000,
        }}
        getStatus={getStatus}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    )

    await act(async () => {
      await Promise.resolve()
    })
    const checkoutTimerHandles = setIntervalSpy.mock.results
      .filter(
        (_result, index) =>
          setIntervalSpy.mock.calls[index]?.[1] === POLL_INTERVAL_MS ||
          setIntervalSpy.mock.calls[index]?.[1] === 1_000
      )
      .map((result) => result.value)
    expect(checkoutTimerHandles).toHaveLength(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MAX_SECONDS * 1_000)
    })
    for (const timerHandle of checkoutTimerHandles) {
      expect(clearIntervalSpy).toHaveBeenCalledWith(timerHandle)
    }

    const callsAtTimeout = getStatus.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(getStatus).toHaveBeenCalledTimes(callsAtTimeout)
  })

  test('uses the browser clock when GMPay omits server time', async () => {
    const getStatus = vi.fn(pendingStatus)
    const checkoutWithoutServerTime = {
      ...cryptoCheckout,
      server_time: undefined,
    } as EpayCryptoCheckoutData
    render(
      <EpayCheckoutDialog
        open
        checkout={checkoutWithoutServerTime}
        getStatus={getStatus}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('00:05:00')).toBeVisible()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000)
    })
    expect(screen.getByText('Payment expired')).toBeVisible()
  })

  test('clears native polling and countdown intervals when the dialog unmounts', async () => {
    const getStatus = vi.fn(pendingStatus)
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const rendered = render(
      <EpayCheckoutDialog
        open
        checkout={cryptoCheckout}
        getStatus={getStatus}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />
    )

    await act(async () => {
      await Promise.resolve()
    })
    const checkoutTimerHandles = setIntervalSpy.mock.results
      .filter(
        (_result, index) =>
          setIntervalSpy.mock.calls[index]?.[1] === POLL_INTERVAL_MS ||
          setIntervalSpy.mock.calls[index]?.[1] === 1_000
      )
      .map((result) => result.value)
    expect(checkoutTimerHandles).toHaveLength(2)

    rendered.unmount()
    for (const timerHandle of checkoutTimerHandles) {
      expect(clearIntervalSpy).toHaveBeenCalledWith(timerHandle)
    }
  })
})
