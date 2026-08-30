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

import { Window } from 'happy-dom'
// @ts-ignore -- Vitest is provided by the repository verification harness.
import { afterAll, beforeEach, describe, test, vi } from 'vitest'

const { useStatusMock, useSystemConfigMock, navigateMock } = vi.hoisted(() => ({
  useStatusMock: vi.fn(),
  useSystemConfigMock: vi.fn(),
  navigateMock: vi.fn(),
}))

const domWindow = new Window({ url: 'http://localhost/forgot-password' })
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

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, ...props }: React.ComponentProps<'a'> & { to: string }) =>
    createElement('a', { href: to, ...props }),
  useNavigate: () => navigateMock,
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: useStatusMock,
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: useSystemConfigMock,
}))

vi.mock(
  '@/features/auth/forgot-password/components/forgot-password-form',
  () => ({
    ForgotPasswordForm: () =>
      createElement('form', { 'data-testid': 'forgot-password-form' }, 'Email'),
  })
)

vi.mock('@/hooks/use-countdown', () => ({
  useCountdown: () => ({
    secondsLeft: 0,
    isActive: false,
    start: vi.fn(),
  }),
}))

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
}))

vi.mock('@/lib/copy-to-clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

const { ForgotPassword } = await import('../forgot-password')
const { ResetPasswordConfirm } = await import('../reset-password-confirm')
const { authSubmitClassName } = await import('../components/auth-card')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })

async function renderNode(node: React.ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(createElement(I18nextProvider, { i18n }, node))
  })

  return { container, root }
}

async function removeNode({
  container,
  root,
}: Awaited<ReturnType<typeof renderNode>>) {
  await act(async () => root.unmount())
  container.remove()
}

function assertExperienceShell(
  container: HTMLElement,
  page: 'forgot-password' | 'reset-password',
  formLabel: string
) {
  const surface = container.querySelector<HTMLElement>(
    '[data-auth-layout="experience"]'
  )
  const panel = container.querySelector<HTMLElement>(
    '[data-auth-panel="experience"]'
  )
  const formRegion = container.querySelector<HTMLElement>(
    '[data-auth-region="form"]'
  )

  assert.ok(surface)
  assert.ok(panel)
  assert.ok(formRegion)
  assert.equal(surface.dataset.authPage, page)
  assert.equal(formRegion.getAttribute('aria-label'), formLabel)
  assert.match(surface.className, /overflow-x-hidden/)
  assert.match(panel.className, /max-w-\[1120px\]/)
  assert.match(panel.className, /lg:grid-cols-/)
  assert.match(formRegion.className, /min-w-0/)
  const transitionContent = formRegion.querySelector<HTMLElement>(
    '[data-auth-transition="content"]'
  )
  assert.ok(transitionContent)
  assert.equal(transitionContent.dataset.authTransition, 'content')
  assert.match(transitionContent.className, /auth-route-content/)
}

describe('password recovery authentication experience', () => {
  beforeEach(() => {
    useStatusMock.mockReset()
    useSystemConfigMock.mockReset()
    navigateMock.mockReset()
    useStatusMock.mockReturnValue({ status: { login_page_config: {} } })
    useSystemConfigMock.mockReturnValue({
      systemName: 'New API',
      logo: '/logo.png',
      loading: false,
    })
  })

  afterAll(() => domWindow.close())

  test('renders forgot-password in the shared experience shell without losing the form or sign-up route', async () => {
    const view = await renderNode(<ForgotPassword />)

    assertExperienceShell(view.container, 'forgot-password', 'Forgot password')
    assert.ok(view.container.querySelector('.auth-card-canvas'))
    assert.ok(view.container.querySelector('[data-auth-decoration="dot-grid"]'))
    assert.ok(
      view.container.querySelector('[data-testid="forgot-password-form"]')
    )
    assert.ok(
      view.container.querySelector('[data-auth-region="form"] a[href="/"]')
    )
    assert.equal(
      view.container.querySelector('a[href="/sign-up"]')?.textContent,
      'Sign up'
    )

    await removeNode(view)
  })

  test('renders reset-password in the shared experience shell with the existing email and action controls', async () => {
    const view = await renderNode(
      <ResetPasswordConfirm email='member@example.com' token='valid-token' />
    )

    assertExperienceShell(view.container, 'reset-password', 'Reset password')
    assert.ok(view.container.querySelector('.auth-card-canvas'))
    assert.equal(
      view.container.querySelector<HTMLInputElement>('input[type="email"]')
        ?.value,
      'member@example.com'
    )
    const submit = view.container.querySelector<HTMLButtonElement>('button')
    assert.ok(submit)
    assert.ok(submit.classList.contains('auth-submit-button'))
    assert.match(authSubmitClassName, /auth-submit-button/)

    await removeNode(view)
  })
})
