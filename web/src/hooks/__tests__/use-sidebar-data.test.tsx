import { Window } from 'happy-dom'
import { createInstance } from 'i18next'
import {
  BadgeCheck,
  Box,
  Building2,
  Dices,
  FileText,
  FlaskConical,
  Gauge,
  Gift,
  History,
  Key,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Radio,
  ReceiptText,
  Rocket,
  ServerCog,
  Settings,
  Share2,
  TriangleAlert,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
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

import type { NavGroup, NavLink, SidebarData } from '@/components/layout/types'
import { useSidebarData } from '@/hooks/use-sidebar-data'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

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
    value: domWindow[key],
  })
}

const { act, createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: {} } },
  parseMissingKeyHandler: (key) => key,
})

async function renderSidebarData(isAgent = false): Promise<SidebarData> {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'sidebar-test',
    role: ROLE.USER,
    is_agent: isAgent,
  })

  let sidebarData: SidebarData | undefined
  function SidebarProbe() {
    sidebarData = useSidebarData()
    return null
  }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(I18nextProvider, { i18n }, createElement(SidebarProbe))
    )
  })
  if (!sidebarData) throw new Error('Expected sidebar navigation data')
  await act(async () => root.unmount())
  container.remove()
  return sidebarData
}

function getGroup(data: SidebarData, id: string): NavGroup {
  const group = data.navGroups.find((candidate) => candidate.id === id)
  if (!group) throw new Error(`Missing sidebar group: ${id}`)
  return group
}

function getLinks(group: NavGroup): NavLink[] {
  return group.items.map((item) => {
    if (!('url' in item) || !item.url) {
      throw new Error(`Expected ${item.title} to be a link`)
    }
    return item
  })
}

function linkContract(group: NavGroup) {
  return getLinks(group).map((item) => ({
    title: item.title,
    url: item.url,
    activeUrls: item.activeUrls,
    configUrls: item.configUrls,
    icon: item.icon,
  }))
}

afterAll(() => {
  useAuthStore.getState().auth.reset()
  domWindow.close()
})

describe('root sidebar navigation data', () => {
  test('exposes the confirmed groups and link contracts in exact order', async () => {
    const data = await renderSidebarData()

    expect(data.navGroups.map((group) => group.id)).toEqual([
      'chat',
      'general',
      'billing',
      'growth',
      'personal',
      'admin',
    ])
    expect(linkContract(getGroup(data, 'chat'))).toEqual([
      {
        title: 'Workbench',
        url: '/workbench',
        activeUrls: undefined,
        configUrls: undefined,
        icon: Rocket,
      },
      {
        title: 'Playground',
        url: '/playground/chat',
        activeUrls: ['/playground/image', '/playground/video'],
        configUrls: ['/playground'],
        icon: FlaskConical,
      },
    ])
    expect(linkContract(getGroup(data, 'general'))).toEqual([
      {
        title: 'Analytics',
        url: '/dashboard/overview',
        activeUrls: [
          '/dashboard/models',
          '/dashboard/flow',
          '/dashboard/users',
        ],
        configUrls: undefined,
        icon: LayoutDashboard,
      },
      {
        title: 'API Keys',
        url: '/keys',
        activeUrls: undefined,
        configUrls: undefined,
        icon: Key,
      },
      {
        title: 'Consumption Logs',
        url: '/usage-logs/common',
        activeUrls: ['/usage-logs/drawing', '/usage-logs/task'],
        configUrls: [
          '/usage-logs/common',
          '/usage-logs/drawing',
          '/usage-logs/task',
        ],
        icon: FileText,
      },
      {
        title: 'Channel Monitor',
        url: '/channel-monitor',
        activeUrls: ['/channel-monitor/detail'],
        configUrls: undefined,
        icon: Gauge,
      },
      {
        title: 'Announcements',
        url: '/announcements',
        activeUrls: undefined,
        configUrls: undefined,
        icon: Megaphone,
      },
    ])
    expect(linkContract(getGroup(data, 'billing'))).toEqual([
      {
        title: 'Finance Center',
        url: '/finance/wallet',
        activeUrls: undefined,
        configUrls: ['/finance/wallet'],
        icon: Wallet,
      },
      {
        title: 'Invoices',
        url: '/finance/invoices',
        activeUrls: undefined,
        configUrls: ['/finance/wallet'],
        icon: ReceiptText,
      },
    ])
    expect(linkContract(getGroup(data, 'growth'))).toEqual([
      {
        title: 'Lucky Draw',
        url: '/finance/lottery',
        activeUrls: undefined,
        configUrls: ['/finance/groupbuy'],
        icon: Dices,
      },
      {
        title: 'Invitation',
        url: '/account/invitation',
        activeUrls: undefined,
        configUrls: ['/account/profile'],
        icon: Gift,
      },
    ])
    expect(linkContract(getGroup(data, 'personal'))).toEqual([
      {
        title: 'Profile',
        url: '/account/profile',
        activeUrls: undefined,
        configUrls: ['/account/profile'],
        icon: User,
      },
      {
        title: 'Identity Verification',
        url: '/account/identity-verification',
        activeUrls: undefined,
        configUrls: ['/account/profile'],
        icon: BadgeCheck,
      },
      {
        title: 'Tickets',
        url: '/tickets',
        activeUrls: ['/tickets/detail'],
        configUrls: undefined,
        icon: LifeBuoy,
      },
    ])
  })

  test('preserves the administrator entries and their order', async () => {
    const adminLinks = getLinks(getGroup(await renderSidebarData(), 'admin'))

    expect(adminLinks.map((item) => [item.title, item.url, item.icon])).toEqual(
      [
        ['Channels', '/channels', Radio],
        ['Models', '/models/metadata', Box],
        ['Users', '/users', Users],
        ['Agent Management', '/agents', Building2],
        ['Error Reports', '/error-reports', TriangleAlert],
        ['Invoice Management', '/invoices/admin', ReceiptText],
        ['Lottery Management', '/lottery/admin', Dices],
        ['Ticket Management', '/tickets/admin', LifeBuoy],
        ['Announcement Management', '/announcements/admin', Megaphone],
        ['Changelog', '/changelog', History],
        ['System Info', '/system-info', ServerCog],
        ['System Settings', '/system-settings/site', Settings],
      ]
    )
    expect(adminLinks.map((item) => item.activeUrls)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ['/tickets/admin-detail'],
      undefined,
      undefined,
      undefined,
      ['/system-settings'],
    ])
    expect(adminLinks.every((item) => item.configUrls === undefined)).toBe(true)
    expect(
      adminLinks.find((item) => item.title === 'System Info')?.requiredRole
    ).toBe(ROLE.SUPER_ADMIN)
  })

  test('keeps the agent console group without exposing retired root entries', async () => {
    const data = await renderSidebarData(true)

    expect(data.navGroups.map((group) => group.id)).toEqual([
      'agent',
      'chat',
      'general',
      'billing',
      'growth',
      'personal',
      'admin',
    ])
    expect(linkContract(getGroup(data, 'agent'))).toEqual([
      {
        title: 'Agent Console',
        url: '/agent-console',
        activeUrls: undefined,
        configUrls: undefined,
        icon: Share2,
      },
    ])

    const links = data.navGroups.flatMap((group) => getLinks(group))
    expect(data.navGroups.some((group) => group.id === 'media')).toBe(false)
    expect(
      links.some(
        (item) =>
          item.title === 'AI Media' ||
          item.title === 'Become an Agent' ||
          item.url === '/asset-library' ||
          item.url === '/canvas' ||
          item.url === '/agent-apply'
      )
    ).toBe(false)
  })
})
