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
  'Blob',
  'File',
  'FileReader',
  'FormData',
  'URL',
  'HTMLElement',
  'HTMLFormElement',
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
const {
  PromptInput,
  PromptInputAttachments,
} = await import('../prompt-input')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: { 'Upload files': 'Upload files' } } },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('PromptInput attachment conversion', () => {
  after(() => {
    domWindow.close()
  })

  test('reports a blob conversion rejection without submitting or clearing the attachment', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const testConsole = globalThis.console
    const originalFetch = globalThis.fetch
    const originalConsoleError = testConsole.error
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const consoleErrors: unknown[][] = []
    let rejectFetch: ((reason?: unknown) => void) | undefined
    const pendingFetch = new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject
    })
    let submissionCount = 0

    globalThis.fetch = () => pendingFetch
    URL.createObjectURL = () => 'blob:rejected-attachment'
    URL.revokeObjectURL = () => {}
    testConsole.error = (...args: unknown[]) => {
      consoleErrors.push(args)
    }

    try {
      await act(async () => {
        root.render(
          <I18nextProvider i18n={i18n}>
            <PromptInput onSubmit={() => {
              submissionCount += 1
            }}>
              <PromptInputAttachments>
                {(attachment) => (
                  <div data-testid='attachment'>{attachment.filename}</div>
                )}
              </PromptInputAttachments>
            </PromptInput>
          </I18nextProvider>
        )
      })

      const fileInput = container.querySelector<HTMLInputElement>(
        'input[type="file"]'
      )
      assert.ok(fileInput)
      const attachment = new File(['attachment'], 'attachment.txt', {
        type: 'text/plain',
      })
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [attachment],
      })

      await act(async () => {
        fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      })

      assert.equal(container.textContent?.includes('attachment.txt'), true)

      const form = container.querySelector('form')
      assert.ok(form)
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await Promise.resolve()
      })
      if (!rejectFetch) {
        throw new Error('Blob conversion did not invoke fetch')
      }
      const rejectPendingFetch = rejectFetch

      await act(async () => {
        rejectPendingFetch(new Error('conversion failed'))
        await Promise.resolve()
        await Promise.resolve()
      })

      assert.equal(submissionCount, 0)
      assert.equal(container.textContent?.includes('attachment.txt'), true)
      assert.equal(
        consoleErrors.some((args) =>
          args.includes('Prompt input attachment conversion failed:')
        ),
        true
      )
    } finally {
      testConsole.error = originalConsoleError
      globalThis.fetch = originalFetch
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
