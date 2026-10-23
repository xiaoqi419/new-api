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
  createRouter,
  createRootRoute,
  createMemoryHistory,
  RouterContextProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { channelSchema, type Channel } from '../../types'
import { ChannelsProvider } from '../channels-provider'
import { ChannelMutateDrawer } from '../drawers/channel-mutate-drawer'

const originalAuth = useAuthStore.getState().auth
let client: QueryClient
let editingChannel: Channel

function ConfigurationHarness(props: { currentRow?: Channel }) {
  const [open, setOpen] = useState(true)
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  )
  return (
    <QueryClientProvider client={client}>
      <RouterContextProvider router={router}>
        <ChannelsProvider>
          <button type='button' onClick={() => setOpen(true)}>
            Open channel
          </button>
          <ChannelMutateDrawer
            open={open}
            onOpenChange={setOpen}
            currentRow={props.currentRow}
          />
        </ChannelsProvider>
      </RouterContextProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  editingChannel = channelSchema.parse({
    id: 42,
    name: 'Existing channel',
    type: 1,
    key: '',
    status: 1,
    created_time: 1,
    test_time: 0,
    response_time: 0,
    balance_updated_time: 0,
    models: 'custom-model',
    group: 'default',
    base_url: 'https://saved.example',
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  useAuthStore.setState({
    auth: {
      ...originalAuth,
      user: { id: 1, username: 'root', role: ROLE.SUPER_ADMIN },
    },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/channel/42') {
      return { data: { success: true, data: editingChannel } }
    }
    if (url === '/api/task_plugin_options') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/channel/models') {
      return { data: { success: true, data: [{ id: 'custom-model' }] } }
    }
    if (url === '/api/group/') {
      return { data: { success: true, data: ['default'] } }
    }
    return { data: { success: true, data: {} } }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState({ auth: originalAuth })
  vi.restoreAllMocks()
  window.localStorage.clear()
})

test('a saved upstream TLS verification skip expands Advanced Settings and turning it off saves the setting without it', async () => {
  editingChannel = {
    ...editingChannel,
    setting: '{"tls_insecure_skip_verify":true}',
  }
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const user = userEvent.setup()
  render(<ConfigurationHarness currentRow={editingChannel} />)
  await screen.findByDisplayValue('Existing channel')
  expect(
    screen.getByRole('button', { name: /Advanced Settings/, expanded: true })
  ).toBeVisible()
  const toggle = screen.getByRole('switch', {
    name: 'Skip Upstream TLS Verification',
  })
  expect(toggle).toBeChecked()
  await user.click(toggle)
  expect(toggle).not.toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Update Channel' }))
  await waitFor(() => expect(put).toHaveBeenCalled())
  const payload = put.mock.calls[0]?.[1] as { setting: string }
  expect(JSON.parse(payload.setting)).not.toHaveProperty(
    'tls_insecure_skip_verify'
  )
})

test('turning on the upstream TLS verification skip saves it in the channel setting', async () => {
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const user = userEvent.setup()
  render(<ConfigurationHarness currentRow={editingChannel} />)
  await screen.findByDisplayValue('Existing channel')
  const collapsedSettings = screen.queryByRole('button', {
    name: /Advanced Settings/,
    expanded: false,
  })
  if (collapsedSettings) await user.click(collapsedSettings)
  const toggle = screen.getByRole('switch', {
    name: 'Skip Upstream TLS Verification',
  })
  expect(toggle).not.toBeChecked()
  await user.click(toggle)
  await user.click(screen.getByRole('button', { name: 'Update Channel' }))
  await waitFor(() => expect(put).toHaveBeenCalled())
  const payload = put.mock.calls[0]?.[1] as { setting: string }
  expect(JSON.parse(payload.setting)).toMatchObject({
    tls_insecure_skip_verify: true,
  })
})

test.each([
  {
    saved: undefined,
    shown: 'InvokeModel (legacy)',
    next: 'Mantle (Messages API)',
    value: 'mantle',
  },
  {
    saved: 'mantle',
    shown: 'Mantle (Messages API)',
    next: 'InvokeModel (legacy)',
    value: 'invoke_model',
  },
])(
  'AWS API defaults or restores $shown and saves the selected interface',
  async ({ saved, shown, next, value }) => {
    editingChannel = {
      ...editingChannel,
      type: 33,
      base_url: '',
      models: 'claude-opus-4-7',
      settings: JSON.stringify({
        aws_key_type: 'api_key',
        aws_api_type: saved,
      }),
    }
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const user = userEvent.setup()
    render(<ConfigurationHarness currentRow={editingChannel} />)
    const selector = await screen.findByRole('combobox', { name: 'AWS API' })
    await waitFor(() => expect(selector).toHaveTextContent(shown))
    await user.click(selector)
    await user.click(screen.getByRole('option', { name: next }))
    expect(selector).toHaveTextContent(next)
    await user.click(screen.getByRole('button', { name: 'Update Channel' }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    const payload = put.mock.calls[0]?.[1] as { settings: string }
    expect(JSON.parse(payload.settings)).toMatchObject({
      aws_key_type: 'api_key',
      aws_api_type: value,
    })
  }
)

test('AWS interface selection is disabled without sensitive channel write permission', async () => {
  editingChannel = {
    ...editingChannel,
    type: 33,
    settings: '{"aws_api_type":"mantle"}',
  }
  useAuthStore.setState({
    auth: {
      ...originalAuth,
      user: {
        id: 10,
        username: 'operator',
        role: ROLE.ADMIN,
        permissions: {
          admin_permissions: { channel: { read: true, write: true } },
        },
      },
    },
  })
  render(<ConfigurationHarness currentRow={editingChannel} />)
  expect(
    await screen.findByRole('combobox', { name: 'AWS API' })
  ).toBeDisabled()
})

test('Vertex API key project ID is editable and saved without changing the fork channel editor layout', async () => {
  editingChannel = {
    ...editingChannel,
    type: 41,
    models: 'gemini-4-argon',
    other: '{"default":"global"}',
    settings:
      '{"vertex_key_type":"api_key","vertex_project_id":"saved-project"}',
  }
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const user = userEvent.setup()
  render(<ConfigurationHarness currentRow={editingChannel} />)
  const project = await screen.findByRole('textbox', {
    name: 'Vertex AI Project ID',
  })
  expect(project).toHaveValue('saved-project')
  await user.clear(project)
  await user.type(project, 'new-project')
  await user.click(screen.getByRole('button', { name: 'Update Channel' }))
  await waitFor(() => expect(put).toHaveBeenCalled())
  const payload = put.mock.calls[0]?.[1] as { settings: string }
  expect(JSON.parse(payload.settings)).toMatchObject({
    vertex_key_type: 'api_key',
    vertex_project_id: 'new-project',
  })
})
