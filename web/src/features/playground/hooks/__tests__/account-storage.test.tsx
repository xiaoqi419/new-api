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
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { loadConfig, loadMessages, loadParameterEnabled } from '../../lib'
import type { Message } from '../../types'
import { usePlaygroundState } from '../use-playground-state'

const privateMessage: Message = {
  key: 'account-a-message',
  from: 'user',
  versions: [
    { id: 'account-a-version', content: 'Private draft for account A' },
  ],
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.reset()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'A', role: 1 })
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  useAuthStore.getState().auth.reset()
})

test('unmounting an account with a pending message save keeps the draft with its original owner', async () => {
  const state = renderHook(usePlaygroundState)
  await waitFor(() =>
    expect(state.result.current.isLoadingMessages).toBe(false)
  )
  act(() => state.result.current.updateMessages([privateMessage]))

  act(() =>
    useAuthStore.getState().auth.setUser({ id: 2, username: 'B', role: 1 })
  )
  state.unmount()
  expect(loadMessages()).toBeNull()

  useAuthStore.getState().auth.setUser({ id: 1, username: 'A', role: 1 })
  expect(loadMessages()).toEqual([privateMessage])
})

test('a pending debounce and in-flight callbacks after an account switch never write to the next account', async () => {
  const state = renderHook(usePlaygroundState)
  await waitFor(() =>
    expect(state.result.current.isLoadingMessages).toBe(false)
  )
  vi.useFakeTimers()
  act(() => state.result.current.updateMessages([privateMessage]))
  act(() =>
    useAuthStore.getState().auth.setUser({ id: 2, username: 'B', role: 1 })
  )
  act(() => {
    state.result.current.updateConfig('model', 'account-a-model')
    state.result.current.updateParameterEnabled('temperature', true)
    vi.runAllTimers()
  })
  expect(loadConfig()).toEqual({})
  expect(loadParameterEnabled()).toEqual({})
  expect(loadMessages()).toBeNull()

  state.unmount()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'A', role: 1 })
  expect(loadConfig()).toMatchObject({ model: 'account-a-model' })
  expect(loadParameterEnabled()).toMatchObject({ temperature: true })
  expect(loadMessages()).toEqual([privateMessage])
})
