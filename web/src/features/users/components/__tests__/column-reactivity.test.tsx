import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, it, vi } from 'vitest'

import { useApiKeysColumns } from '@/features/keys/components/api-keys-columns'
import { useDrawingLogsColumns } from '@/features/usage-logs/components/columns/drawing-logs-columns'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { useUsersColumns } from '../users-columns'

vi.mock('@/features/keys/api', () => ({
  getTokensConcurrency: async () => ({
    success: true,
    data: { supported: true, items: {} },
  }),
}))
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  getUserGroups: async () => ({
    success: true,
    data: { default: { ratio: 1 } },
  }),
}))
afterEach(() => {
  cleanup()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

it('keeps stable columns on unrelated rerenders but refreshes currency, language, time and live concurrency', async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    resources: {
      en: { translation: {} },
      fr: { translation: { Username: 'Utilisateur' } },
    },
    initAsync: false,
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  )
  const { result, rerender } = renderHook(
    ({ now }) => ({
      users: useUsersColumns(),
      drawing: useDrawingLogsColumns(false),
      keys: useApiKeysColumns(now),
    }),
    { initialProps: { now: 1000 }, wrapper }
  )
  await waitFor(() =>
    expect(client.getQueryData(['user-groups'])).toBeDefined()
  )
  const before = result.current
  rerender({ now: 1000 })
  expect(result.current.users).toBe(before.users)
  expect(result.current.drawing).toBe(before.drawing)
  expect(result.current.keys).toBe(before.keys)
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
  )
  expect(result.current.users).not.toBe(before.users)
  expect(result.current.drawing).not.toBe(before.drawing)
  expect(result.current.keys).not.toBe(before.keys)
  await act(() => i18n.changeLanguage('fr'))
  expect(
    result.current.users.find(
      (c) => 'accessorKey' in c && c.accessorKey === 'username'
    )?.header
  ).toBe('Utilisateur')
  const keys = result.current.keys
  act(() =>
    client.setQueryData(['tokens-concurrency'], {
      success: true,
      data: { supported: true, items: { '1': { in_use: 2, max: 4 } } },
    })
  )
  await waitFor(() => expect(result.current.keys).not.toBe(keys))
  const liveKeys = result.current.keys
  rerender({ now: 2000 })
  expect(result.current.keys).not.toBe(liveKeys)
  client.clear()
})
