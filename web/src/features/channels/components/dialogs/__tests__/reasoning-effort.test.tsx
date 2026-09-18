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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { channelSchema } from '../../../types'
import { ChannelsProvider, useChannels } from '../../channels-provider'
import { ChannelTestDialog } from '../channel-test-dialog'

function TestHarness() {
  const channels = useChannels()
  return (
    <>
      <button
        type='button'
        onClick={() =>
          channels.setCurrentRow(
            channelSchema.parse({
              id: 12,
              type: 1,
              key: '',
              status: 1,
              name: 'Reasoning upstream',
              created_time: 0,
              test_time: 0,
              response_time: 0,
              balance_updated_time: 0,
              used_quota: 0,
              models: 'gpt-5.6-sol',
            })
          )
        }
      >
        Open test
      </button>
      <ChannelTestDialog open onOpenChange={() => undefined} />
    </>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

async function openChannelTest() {
  const user = userEvent.setup()
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, time: 0.2 } })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ChannelsProvider>
        <TestHarness />
      </ChannelsProvider>
    </QueryClientProvider>
  )
  await user.click(screen.getByRole('button', { name: 'Open test' }))
  const effort = await screen.findByRole('combobox', {
    name: 'Test reasoning effort (Chat / Responses only)',
  })
  expect(effort).toHaveTextContent('Default (no override)')
  return { user, get, queryClient, effort }
}

test.each(['Test Connection', 'Test all 1 models'])(
  'selecting effort sends the standard parameter when using %s',
  async (buttonName) => {
    const { user, get, queryClient, effort } = await openChannelTest()
    await user.click(effort)
    await user.click(await screen.findByRole('option', { name: 'low' }))
    await user.click(screen.getByRole('button', { name: buttonName }))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/api/channel/test/12',
        expect.objectContaining({
          params: { model: 'gpt-5.6-sol', reasoning_effort: 'low' },
        })
      )
    )
    queryClient.clear()
  }
)

test('an unsupported endpoint disables effort and omits it from the request', async () => {
  const { user, get, queryClient, effort } = await openChannelTest()
  await user.click(effort)
  await user.click(await screen.findByRole('option', { name: 'low' }))
  await user.click(screen.getByRole('combobox', { name: 'Endpoint Type' }))
  await user.click(
    await screen.findByRole('option', {
      name: 'Embeddings (/v1/embeddings)',
    })
  )
  expect(effort).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Test Connection' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith(
      '/api/channel/test/12',
      expect.objectContaining({
        params: { model: 'gpt-5.6-sol', endpoint_type: 'embeddings' },
      })
    )
  )
  queryClient.clear()
})
