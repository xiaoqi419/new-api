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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { getTopupInfo } from '@/features/wallet/api'
import { submitPaymentForm } from '@/features/wallet/lib/payment'

import { agentConsolePrepay, getAgentPrepayStatus } from '../api'
import { PrepayCard } from '../components/prepay-card'

vi.mock('@/features/wallet/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/wallet/api')>()
  return {
    ...actual,
    getTopupInfo: vi.fn(),
  }
})

vi.mock('@/features/wallet/lib/payment', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/wallet/lib/payment')>()
  return {
    ...actual,
    submitPaymentForm: vi.fn(),
  }
})

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    agentConsolePrepay: vi.fn(),
    getAgentPrepayStatus: vi.fn(),
  }
})

const nativeCheckout = {
  trade_no: 'AGP7NONATIVE1',
  gateway_trade_no: 'GMPAY-AGENT-1',
  checkout_type: 'crypto',
  payment_method: 'usdt.tron',
  money: '25.00',
  actual_amount: '24.998765',
  receive_address: 'TAgentPrepayAddress123456789',
  token: 'USDT',
  network: 'TRON',
  expiration_time: 1_900_000_300,
  server_time: 1_900_000_000,
}

function renderPrepayCard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <PrepayCard />
    </QueryClientProvider>
  )
  return { invalidateQueries, queryClient }
}

describe('agent platform prepayment checkout', () => {
  beforeEach(() => {
    vi.mocked(getTopupInfo).mockResolvedValue({
      success: true,
      data: {
        pay_methods: [{ type: 'usdt.tron', name: 'GMPay USDT (TRON)' }],
      },
    } as Awaited<ReturnType<typeof getTopupInfo>>)
    vi.mocked(getAgentPrepayStatus).mockResolvedValue({
      success: true,
      data: { status: 'pending' },
    })
    vi.mocked(agentConsolePrepay).mockResolvedValue({
      success: true,
      message: 'success',
      data: nativeCheckout,
      url: 'https://gateway.example/hosted-cashier',
    })
  })

  test('opens native GMPay inside the shared structured crypto modal without submitting a hosted cashier form', async () => {
    const openedWindow = vi.spyOn(window, 'open')
    const { queryClient } = renderPrepayCard()

    expect((await screen.findAllByText('GMPay USDT (TRON)'))[0]).toBeVisible()
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '25' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prepay' }))

    expect(await screen.findByText('24.998765 USDT')).toBeVisible()
    expect(screen.getByText('TAgentPrepayAddress123456789')).toBeVisible()
    await waitFor(() => {
      expect(getAgentPrepayStatus).toHaveBeenCalledWith('AGP7NONATIVE1')
    })
    expect(submitPaymentForm).not.toHaveBeenCalled()
    expect(openedWindow).not.toHaveBeenCalled()
    expect(document.body).not.toHaveTextContent(
      'https://gateway.example/hosted-cashier'
    )

    queryClient.clear()
  })

  test('closes the modal and refreshes agent wallet and ledger after authenticated status polling succeeds', async () => {
    vi.mocked(getAgentPrepayStatus).mockResolvedValue({
      success: true,
      data: { status: 'success' },
    })
    const { invalidateQueries, queryClient } = renderPrepayCard()

    expect((await screen.findAllByText('GMPay USDT (TRON)'))[0]).toBeVisible()
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '25' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prepay' }))

    await waitFor(() => {
      expect(getAgentPrepayStatus).toHaveBeenCalledWith('AGP7NONATIVE1')
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['agent-console-self'],
      })
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['agent-console-ledgers'],
      })
    })
    await waitFor(() => {
      expect(screen.queryByText('24.998765 USDT')).not.toBeInTheDocument()
    })

    queryClient.clear()
  })

  test('keeps legacy form submission when the server returns a legacy EPay checkout', async () => {
    vi.mocked(agentConsolePrepay).mockResolvedValue({
      message: 'success',
      data: { pid: 'merchant', out_trade_no: 'AGP7NOLEGACY1' },
      url: 'https://legacy.example/submit.php',
    })
    const { queryClient } = renderPrepayCard()

    expect((await screen.findAllByText('GMPay USDT (TRON)'))[0]).toBeVisible()
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '25' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prepay' }))

    await waitFor(() => {
      expect(submitPaymentForm).toHaveBeenCalledWith(
        'https://legacy.example/submit.php',
        expect.objectContaining({ out_trade_no: 'AGP7NOLEGACY1' })
      )
    })

    queryClient.clear()
  })
})
