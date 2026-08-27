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
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { ChannelFailoverPoolsSection } from '../channel-failover-pools-section'

const mutateAsync = vi.fn().mockResolvedValue({ success: true })

vi.mock('../channel-failover-pools-api', () => ({
  getSchedulingPoolChannels: vi.fn().mockResolvedValue([
    {
      id: 11,
      name: 'Primary OpenAI channel with a deliberately long label',
      group: 'standard',
      type: 1,
      status: 1,
    },
    {
      id: 12,
      name: 'Backup OpenAI channel',
      group: 'standard',
      type: 1,
      status: 1,
    },
  ]),
}))

vi.mock('../../hooks/use-update-option', () => ({
  useUpdateOption: () => ({
    mutateAsync,
    isPending: false,
  }),
}))

describe('channel failover pools editor', () => {
  test('lets an administrator remove a deleted member and save the repaired atomic pool list', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ChannelFailoverPoolsSection
          defaultValue={JSON.stringify([
            {
              id: 'standard-openai',
              name: 'Standard OpenAI failover',
              enabled: true,
              group: 'standard',
              channel_type: 1,
              channel_ids: [11, 12, 99],
            },
          ])}
        />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Deleted channel #99')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Edit scheduling pool Standard OpenAI failover',
      })
    )

    const dialog = screen.getByRole('dialog', { name: 'Edit scheduling pool' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Deleted channel #99')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove invalid channel 99' })
    )

    await waitFor(() => {
      expect(
        within(dialog).queryByText('Deleted channel #99')
      ).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save pool' }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        key: 'channel_failover_setting.pools',
        value: JSON.stringify([
          {
            id: 'standard-openai',
            name: 'Standard OpenAI failover',
            enabled: true,
            group: 'standard',
            channel_type: 1,
            channel_ids: [11, 12],
          },
        ]),
      })
    })

    queryClient.clear()
  })

  test('keeps the responsive list and icon actions accessible when names wrap', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ChannelFailoverPoolsSection
          defaultValue={JSON.stringify([
            {
              id: 'standard-openai',
              name: 'A very long pool name that must wrap instead of creating horizontal overflow at narrow widths',
              enabled: true,
              group: 'standard',
              channel_type: 1,
              channel_ids: [11, 12],
            },
          ])}
        />
      </QueryClientProvider>
    )

    const poolName = await screen.findByText(
      'A very long pool name that must wrap instead of creating horizontal overflow at narrow widths'
    )
    expect(poolName).toHaveClass('min-w-0', 'break-words')
    expect(
      screen.getByRole('button', {
        name: 'Edit scheduling pool A very long pool name that must wrap instead of creating horizontal overflow at narrow widths',
      })
    ).toBeEnabled()
    expect(
      screen.getByRole('button', {
        name: 'Delete scheduling pool A very long pool name that must wrap instead of creating horizontal overflow at narrow widths',
      })
    ).toBeEnabled()

    queryClient.clear()
  })
})
