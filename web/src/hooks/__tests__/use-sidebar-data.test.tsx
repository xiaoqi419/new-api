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
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import * as Lucide from 'lucide-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { NavGroup } from '@/components/layout/types'

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { useSidebarData } = await import('../use-sidebar-data')
const { useAuthStore } = await import('@/stores/auth-store')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })

const lucideComponents = new Set(Object.values(Lucide))

function SidebarDataHarness() {
  const navGroups: NavGroup[] = useSidebarData().navGroups
  const directItems = navGroups.flatMap((group) =>
    group.items.filter((item) => 'url' in item)
  )
  const usesLucideIcons = directItems.every(
    (item) => item.icon && lucideComponents.has(item.icon)
  )

  return createElement('output', {
    'data-direct-item-count': directItems.length,
    'data-group-ids': navGroups.map((group) => group.id).join(','),
    'data-icon-source': usesLucideIcons ? 'lucide' : 'other',
    'data-item-titles': directItems.map((item) => item.title).join(','),
  })
}

function renderSidebarData(): string {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(SidebarDataHarness))
  )
}

describe('root sidebar navigation icons', () => {
  beforeEach(() => {
    useAuthStore.getState().auth.reset()
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'user',
      role: 1,
      is_agent: false,
    })
  })

  test('assigns Lucide components to every direct root navigation item', () => {
    const markup = renderSidebarData()

    assert.match(markup, /data-direct-item-count="[1-9]\d*"/)
    assert.match(markup, /data-icon-source="lucide"/)
  })

  test('keeps AI media and agent application entries out of the sidebar', () => {
    const markup = renderSidebarData()

    assert.doesNotMatch(markup, /data-group-ids="[^"]*media/)
    assert.doesNotMatch(markup, /Asset Library/)
    assert.doesNotMatch(markup, /Infinite Canvas/)
    assert.doesNotMatch(markup, /Become an Agent/)
  })
})
