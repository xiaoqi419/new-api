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
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
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

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { AssetUrlInput } = await import('../asset-url-input')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('AssetUrlInput', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps manual asset URLs without a selector', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let value = 'asset://existing'

    await act(async () => {
      root.render(
        <AssetUrlInput
          value={value}
          onChange={(nextValue) => {
            value = nextValue
          }}
          placeholder='https:// or asset://'
          assetOptions={[{ value: 'asset://library', label: 'Library asset' }]}
        />
      )
    })

    const input = container.querySelector<HTMLInputElement>('input')
    assert.ok(input)
    assert.equal(input.value, 'asset://existing')
    assert.equal(input.getAttribute('placeholder'), 'https:// or asset://')
    assert.equal(container.querySelector('[role="combobox"]'), null)
    assert.equal(container.querySelector('button'), null)

    await act(async () => root.unmount())
    container.remove()
  })
})
