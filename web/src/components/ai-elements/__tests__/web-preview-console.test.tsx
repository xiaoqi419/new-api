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
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
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
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { WebPreview, WebPreviewConsole } = await import('../web-preview')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Console: 'Console',
        'No console output': 'No console output',
      },
    },
  },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('WebPreviewConsole log identity', () => {
  after(() => {
    domWindow.close()
  })

  test('renders duplicate logs without duplicate-key warnings', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const testConsole = globalThis.console
    const originalConsoleError = testConsole.error
    const consoleErrors: unknown[][] = []
    const timestamp = new Date('2026-08-19T00:00:00.000Z')
    const logs = [
      { level: 'warn' as const, message: 'Repeated warning', timestamp },
      { level: 'warn' as const, message: 'Repeated warning', timestamp },
    ]

    testConsole.error = (...args: unknown[]) => {
      consoleErrors.push(args)
    }

    try {
      await act(async () => {
        root.render(
          <I18nextProvider i18n={i18n}>
            <WebPreview>
              <WebPreviewConsole logs={logs} />
            </WebPreview>
          </I18nextProvider>
        )
      })

      const trigger = container.querySelector<HTMLButtonElement>(
        '[data-slot="collapsible-trigger"]'
      )
      assert.ok(trigger)
      await act(async () => {
        trigger.click()
      })

      const timestampNodes = container.querySelectorAll(
        'span.text-muted-foreground'
      )
      assert.equal(timestampNodes.length, 2)
      assert.equal(
        [...timestampNodes].every((node) =>
          node.parentElement?.textContent?.includes('Repeated warning')
        ),
        true
      )
      assert.equal(
        consoleErrors.some((args) => args.join(' ').includes('same key')),
        false
      )
    } finally {
      testConsole.error = originalConsoleError
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
