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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { afterEach, expect, test, vi } from 'vitest'

import { Form } from '@/components/ui/form'
import { api } from '@/lib/api'

import {
  CHANNEL_FORM_DEFAULT_VALUES,
  buildSettingJSON,
  type ChannelFormValues,
} from '../../lib/channel-form'
import { ChannelPluginFields } from '../channel-plugin-fields'

const plugins = [
  {
    key: 'video-a',
    name: 'Video A',
    baseUrl: 'https://a.example',
    models: ['video-a-1'],
    upstreams: ['new_api'],
  },
  {
    key: 'video-b',
    name: 'Video B',
    baseUrl: 'https://b.example',
    models: ['video-b-1'],
    upstreams: ['new_api'],
  },
]
const clients: QueryClient[] = []
function Fixture(props: {
  values?: Partial<ChannelFormValues>
  disabled?: boolean
  onSave: (value: ChannelFormValues) => void
}) {
  const form = useForm<ChannelFormValues>({
    defaultValues: {
      ...CHANNEL_FORM_DEFAULT_VALUES,
      type: 61,
      ...props.values,
    },
  })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(props.onSave)}>
        <ChannelPluginFields
          channelType={form.watch('type')}
          disabled={props.disabled ?? false}
        />
        <label>
          Base URL
          <input {...form.register('base_url')} />
        </label>
        <label>
          Models
          <input {...form.register('models')} />
        </label>
        <button type='submit'>Save</button>
      </form>
    </Form>
  )
}
function mount(values: Partial<ChannelFormValues> = {}, disabled = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: plugins } })
  const save = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <Fixture values={values} disabled={disabled} onSave={save} />
    </QueryClientProvider>
  )
  return { save, get, user: userEvent.setup() }
}
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

test('selecting a plugin prefills its models and default URL and saves an explicit binding', async () => {
  const { user, save } = mount()
  const selector = screen.getByRole('combobox')
  await user.click(selector)
  await user.click(await screen.findByRole('option', { name: 'Video A' }))
  expect(screen.getByLabelText('Base URL')).toHaveValue('https://a.example')
  expect(screen.getByLabelText('Models')).toHaveValue('video-a-1')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(JSON.parse(buildSettingJSON(save.mock.calls[0][0]))).toMatchObject({
    task_plugin_key: 'video-a',
  })
})

test('changing a plugin preserves a custom URL and credentials while replacing the plugin models', async () => {
  const { user, save } = mount({
    task_plugin_key: 'video-a',
    base_url: 'https://custom.example',
    key: 'private-key',
    models: 'custom-model',
  })
  await user.click(screen.getByRole('combobox'))
  await user.click(await screen.findByRole('option', { name: 'Video B' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(save.mock.calls[0][0]).toMatchObject({
    base_url: 'https://custom.example',
    key: 'private-key',
    models: 'video-b-1',
  })
})

test('an unchanged plugin preserves custom model selections when saving', async () => {
  const { user, save } = mount({
    task_plugin_key: 'video-a',
    models: 'custom-model',
  })
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(save.mock.calls[0][0]).toMatchObject({
    task_plugin_key: 'video-a',
    models: 'custom-model',
  })
})

test('a locked plugin binding does not load credentials-related plugin options', () => {
  const { get } = mount({}, true)
  expect(get).not.toHaveBeenCalled()
  expect(screen.getByRole('combobox')).toBeDisabled()
})

test('Ollama compatibility and Responses WebSocket changes save independently of the fork transport', async () => {
  const { user, save } = mount({ type: 23 })
  await user.click(
    screen.getByRole('switch', {
      name: 'Use OpenAI-compatible Ollama chat API',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(save).toHaveBeenCalled())
  expect(save.mock.calls[0][0].ollama_openai_chat).toBe(true)
})
