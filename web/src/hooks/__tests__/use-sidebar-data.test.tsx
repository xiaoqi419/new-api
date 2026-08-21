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
import { afterAll, describe, test } from 'vitest'

import { Window } from 'happy-dom'

const domWindow = new Window()
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
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { useSidebarData } = await import('../use-sidebar-data')
const { useAuthStore } = await import('@/stores/auth-store')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })

function SidebarDataHarness() {
  const data = useSidebarData()
  const links = data.navGroups.flatMap((group) =>
    group.items.map((item) => `${item.title}|${item.url}`)
  )
  return createElement('output', { 'data-sidebar-links': links.join('\n') })
}

describe('useSidebarData feature visibility', () => {
  afterAll(() => {
    useAuthStore.getState().auth.reset()
    domWindow.close()
  })

  test('removes retired feature links while retaining agent links', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'agent',
      role: 1,
      is_agent: true,
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n },
          createElement(SidebarDataHarness)
        )
      )
    })

    const links = container.querySelector('output')?.dataset.sidebarLinks ?? ''
    assert.equal(links.includes('/asset-library'), false)
    assert.equal(links.includes('/canvas'), false)
    assert.equal(links.includes('/agent-apply'), false)
    assert.equal(links.includes('/agent-console'), true)
    assert.equal(links.includes('/agents'), true)

    await act(async () => root.unmount())
    container.remove()
  })
})
