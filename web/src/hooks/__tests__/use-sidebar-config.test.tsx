import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Window } from 'happy-dom'
/*
Copyright (C) 2026 QuantumNous

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
import { afterAll, describe, expect, test } from 'vitest'

import type { NavGroup } from '@/components/layout/types'

const domWindow = new Window({ url: 'http://localhost/dashboard' })
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === 'window' ? domWindow : domWindow[key],
  })
}
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: domWindow.localStorage,
})

const { act, createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { useSidebarConfig } = await import('@/hooks/use-sidebar-config')
const { useAuthStore } = await import('@/stores/auth-store')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const splitPersonalGroups: NavGroup[] = [
  {
    id: 'billing',
    title: 'Billing',
    items: [
      {
        title: 'Finance Center',
        url: '/finance/wallet',
        configUrls: ['/finance/wallet'],
      },
      {
        title: 'Invoices',
        url: '/finance/invoices',
        configUrls: ['/finance/wallet'],
      },
    ],
  },
  {
    id: 'growth',
    title: 'Growth',
    items: [
      {
        title: 'Group Buy Hall',
        url: '/finance/groupbuy',
        activeUrls: ['/groupbuy/detail'],
        configUrls: ['/finance/groupbuy'],
      },
      {
        title: 'Lucky Draw',
        url: '/finance/lottery',
        configUrls: ['/finance/groupbuy'],
      },
      {
        title: 'Invitation',
        url: '/account/invitation',
        configUrls: ['/account/profile'],
      },
    ],
  },
  {
    id: 'personal',
    title: 'Personal',
    items: [
      {
        title: 'Profile',
        url: '/account/profile',
        configUrls: ['/account/profile'],
      },
      {
        title: 'Identity Verification',
        url: '/account/identity-verification',
        configUrls: ['/account/profile'],
      },
      {
        title: 'Tickets',
        url: '/tickets',
        activeUrls: ['/tickets/detail'],
      },
    ],
  },
]

type SidebarConfigFixture = {
  adminPersonal: { topup: boolean; personal: boolean }
  userPersonal?: { topup: boolean; personal: boolean }
}

async function renderFilteredTitles(
  fixture: SidebarConfigFixture
): Promise<string[]> {
  const adminConfig = {
    chat: { enabled: true, playground: true, chat: true },
    console: {
      enabled: true,
      detail: true,
      token: true,
      log: true,
      midjourney: true,
      task: true,
    },
    personal: { enabled: true, ...fixture.adminPersonal },
    admin: {
      enabled: true,
      channel: true,
      models: true,
      redemption: true,
      user: true,
      setting: true,
      subscription: true,
    },
  }
  const userConfig = fixture.userPersonal
    ? { personal: { enabled: true, ...fixture.userPersonal } }
    : undefined
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'sidebar-config-test',
    role: 1,
    sidebar_modules: userConfig ? JSON.stringify(userConfig) : undefined,
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['status'], {
    SidebarModulesAdmin: JSON.stringify(adminConfig),
  })

  let filtered: NavGroup[] | undefined
  function ConfigProbe() {
    filtered = useSidebarConfig(splitPersonalGroups)
    return null
  }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ConfigProbe)
      )
    )
  })
  if (!filtered) throw new Error('Expected configured navigation groups')
  await act(async () => root.unmount())
  container.remove()
  queryClient.clear()

  return filtered.flatMap((group) => group.items.map((item) => item.title))
}

afterAll(() => {
  useAuthStore.getState().auth.reset()
  domWindow.close()
})

describe('sidebar configuration for split personal navigation', () => {
  test('product visibility policy hides group buy from finance tabs while preserving unmarked entries', async () => {
    const titles = await renderFilteredTitles({
      adminPersonal: { topup: true, personal: true },
      userPersonal: { topup: true, personal: true },
    })

    expect(titles).toEqual([
      'Finance Center',
      'Invoices',
      'Lucky Draw',
      'Invitation',
      'Profile',
      'Identity Verification',
      'Tickets',
    ])
  })

  test('admin topup disablement removes all finance entries while tickets remain', async () => {
    const titles = await renderFilteredTitles({
      adminPersonal: { topup: false, personal: true },
      userPersonal: { topup: true, personal: true },
    })

    expect(titles).toEqual([
      'Invitation',
      'Profile',
      'Identity Verification',
      'Tickets',
    ])
  })

  test('admin personal disablement removes profile entries while tickets remain', async () => {
    const titles = await renderFilteredTitles({
      adminPersonal: { topup: true, personal: false },
      userPersonal: { topup: true, personal: true },
    })

    expect(titles).toEqual([
      'Finance Center',
      'Invoices',
      'Lucky Draw',
      'Tickets',
    ])
  })

  test('user overlay can further hide both legacy modules without hiding tickets', async () => {
    const titles = await renderFilteredTitles({
      adminPersonal: { topup: true, personal: true },
      userPersonal: { topup: false, personal: false },
    })

    expect(titles).toEqual(['Tickets'])
  })
})
