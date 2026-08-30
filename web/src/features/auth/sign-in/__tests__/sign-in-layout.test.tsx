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

import zh from '@/i18n/locales/zh.json'

const { useStatusMock, useSystemConfigMock } = vi.hoisted(() => ({
  useStatusMock: vi.fn(),
  useSystemConfigMock: vi.fn(),
}))

const domWindow = new Window({ url: 'http://localhost/sign-in' })
Object.defineProperty(domWindow, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    media: query,
    matches: query === '(min-width: 1024px)',
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
})
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
  useSearch: () => ({ redirect: undefined }),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: useStatusMock,
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: useSystemConfigMock,
}))

vi.mock('@/features/auth/hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => ({
    handleLoginSuccess: vi.fn(),
    redirectTo2FA: vi.fn(),
  }),
}))

vi.mock('@/features/auth/hooks/use-turnstile', () => ({
  useTurnstile: () => ({
    isTurnstileEnabled: false,
    turnstileSiteKey: '',
    turnstileToken: '',
    setTurnstileToken: vi.fn(),
    validateTurnstile: () => true,
  }),
}))

vi.mock('@/features/auth/hooks/use-click-captcha', () => ({
  toCaptchaQuery: () => undefined,
  useClickCaptchaEnabled: () => false,
}))

vi.mock('@/features/auth/hooks/use-oauth-login', () => ({
  useOAuthLogin: () => ({
    isLoading: false,
    githubButtonText: 'Continue with GitHub',
    githubButtonDisabled: false,
    handleGitHubLogin: vi.fn(),
    handleDiscordLogin: vi.fn(),
    handleOIDCLogin: vi.fn(),
    handleLinuxDOLogin: vi.fn(),
    handleTelegramLogin: vi.fn(),
    handleCustomOAuthLogin: vi.fn(),
    isTelegramDialogOpen: false,
    isTelegramPending: false,
    handleTelegramAuthorization: vi.fn(),
    setIsTelegramDialogOpen: vi.fn(),
    isClickCaptchaEnabled: false,
    isCaptchaDialogOpen: false,
    setIsCaptchaDialogOpen: vi.fn(),
    handleCaptchaSolved: vi.fn(),
  }),
}))

vi.mock('@/features/auth/sign-up/components/sign-up-form', () => ({
  SignUpForm: () =>
    createElement('form', { 'data-testid': 'sign-up-form' }, 'Registration'),
}))

vi.mock('@/lib/passkey', () => ({
  isPasskeySupported: () => Promise.resolve(false),
  buildAssertionResult: vi.fn(),
  prepareCredentialRequestOptions: vi.fn(),
}))

const { AuthLayout } = await import('../../auth-layout')
const { AuthCard, authSubmitClassName } =
  await import('../../components/auth-card')
const { AuthExperienceLayout } =
  await import('../../components/auth-experience-layout')
const { AuthTabs } = await import('../../components/auth-tabs')
const { SignUp } = await import('../../sign-up')
const { SignIn } = await import('../index')
const { UserAuthForm } = await import('../components/user-auth-form')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} }, zh } })

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

describe('authentication experience layout', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    document.documentElement.className = ''
    useStatusMock.mockReset()
    useSystemConfigMock.mockReset()
    useStatusMock.mockReturnValue({
      status: {
        login_page_config: {
          background_image: '/auth-background.jpg',
          title: 'One account for every model',
          description: 'ConfiguredDescription'.repeat(20),
          stats: [{ value: '40+', label: 'providers' }],
        },
      },
    })
    useSystemConfigMock.mockReturnValue({
      systemName: 'New API',
      logo: '/logo.png',
      loading: false,
    })
  })

  afterAll(() => domWindow.close())

  test('renders the bounded desktop panel with configured narrative and direct form region', async () => {
    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div data-testid='auth-form'>Authentication</div>
      </AuthExperienceLayout>
    )

    const surface = view.container.querySelector<HTMLElement>(
      '[data-auth-layout="experience"]'
    )
    const panel = view.container.querySelector<HTMLElement>(
      '[data-auth-panel="experience"]'
    )
    const brand = view.container.querySelector<HTMLElement>(
      '[data-auth-region="brand"]'
    )
    const form = view.container.querySelector<HTMLElement>(
      '[data-auth-region="form"]'
    )
    assert.ok(surface)
    assert.ok(panel)
    assert.ok(brand)
    assert.ok(form)
    assert.equal(surface.dataset.authPage, 'sign-in')
    assert.match(surface.className, /overflow-x-hidden/)
    assert.match(panel.className, /max-w-\[1120px\]/)
    assert.match(panel.className, /rounded-\[8px\]/)
    assert.match(panel.className, /lg:grid-cols-/)
    assert.match(brand.className, /hidden/)
    assert.match(brand.className, /lg:flex/)
    assert.match(form.className, /min-w-0/)
    const transitionContent = form.querySelector<HTMLElement>(
      '[data-auth-transition="content"]'
    )
    assert.ok(transitionContent)
    assert.match(transitionContent.className, /auth-route-content/)
    assert.equal(
      transitionContent.querySelector('[data-testid="auth-form"]')?.textContent,
      'Authentication'
    )
    assert.equal(
      view.container.querySelector('[data-testid="auth-form"]')?.textContent,
      'Authentication'
    )

    const heading = brand.querySelector('h2')
    const description = brand.querySelector('p')
    assert.equal(heading?.textContent, 'One account for every model')
    assert.match(heading?.className ?? '', /break-words/)
    assert.equal(description?.textContent, 'ConfiguredDescription'.repeat(20))
    assert.match(description?.className ?? '', /break-words/)
    assert.equal(
      brand.querySelector('img[aria-hidden="true"]')?.getAttribute('src'),
      '/auth-background.jpg'
    )
    const video = brand.querySelector<HTMLVideoElement>(
      '[data-auth-media="video"]'
    )
    assert.ok(video)
    assert.equal(video.autoplay, true)
    assert.equal(video.muted, true)
    assert.equal(video.loop, true)
    assert.equal(video.getAttribute('playsinline'), '')
    assert.equal(video.preload, 'auto')
    assert.equal(
      video.querySelector('source')?.getAttribute('src'),
      '/assets/iconsax-sec1-new.mp4'
    )
    assert.equal(video.querySelector('source')?.getAttribute('media'), null)
    assert.equal(video.getAttribute('aria-hidden'), 'true')
    assert.equal(brand.querySelector('dt')?.textContent, 'providers')
    assert.equal(brand.querySelector('dd')?.textContent, '40+')

    const models = brand.querySelector('[aria-label="AI models supported"]')
    assert.ok(models)
    for (const model of ['Claude', 'Codex', 'Gemini', '40+']) {
      assert.ok(models.textContent?.includes(model))
    }
    const motion = brand.querySelector<HTMLElement>(
      '[data-auth-motion="model-connection"]'
    )
    const motionStyles = brand.querySelector<HTMLStyleElement>(
      'style[data-auth-motion-styles="model-connection"]'
    )
    assert.ok(motion)
    assert.equal(motion.getAttribute('aria-hidden'), 'true')
    assert.match(motion.className, /pointer-events-none/)
    assert.match(motion.className, /absolute/)
    assert.equal(motion.closest('a,button'), null)
    assert.ok(motionStyles)
    assert.match(motionStyles.textContent ?? '', /var\(--primary\)/)
    assert.match(
      motionStyles.textContent ?? '',
      /@keyframes auth-model-connection-flow/
    )
    assert.match(
      motionStyles.textContent ?? '',
      /@media \(prefers-reduced-motion: reduce\)/
    )
    assert.match(motionStyles.textContent ?? '', /animation: none/)
    assert.equal(
      brand.textContent?.includes('AI Development Tools Gateway'),
      false
    )

    await removeNode(view)
  })

  test('keeps auth background media out of reduced-motion layouts', async () => {
    const originalMatchMedia = domWindow.matchMedia
    Object.defineProperty(domWindow, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        media: query,
        matches: query === '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })

    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    const brand = view.container.querySelector<HTMLElement>(
      '[data-auth-region="brand"]'
    )
    assert.ok(brand)
    assert.equal(brand.querySelector('[data-auth-media="video"]'), null)

    await removeNode(view)
    Object.defineProperty(domWindow, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    })
  })

  test('shows the first headline word as a static fallback when reduced motion is enabled', async () => {
    const originalMatchMedia = domWindow.matchMedia
    Object.defineProperty(domWindow, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        media: query,
        matches:
          query === '(min-width: 1024px)' ||
          query === '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })

    useStatusMock.mockReturnValue({ status: { login_page_config: {} } })
    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    const brand = view.container.querySelector<HTMLElement>(
      '[data-auth-region="brand"]'
    )
    assert.ok(brand)
    assert.equal(brand.querySelector('[data-auth-title="ticker"]'), null)
    assert.equal(
      brand.querySelector('[data-auth-title="static-word"]')?.textContent,
      'design'
    )

    await removeNode(view)
    Object.defineProperty(domWindow, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    })
  })

  test('does not mount the auth background video below the desktop breakpoint', async () => {
    const originalMatchMedia = domWindow.matchMedia
    Object.defineProperty(domWindow, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        media: query,
        matches: false,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })

    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    assert.equal(
      view.container.querySelector('[data-auth-media="video"]'),
      null
    )

    await removeNode(view)
    Object.defineProperty(domWindow, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    })
  })

  test('mounts the local desktop video on every auth page', async () => {
    for (const page of [
      'sign-in',
      'sign-up',
      'forgot-password',
      'reset-password',
    ] as const) {
      const view = await renderNode(
        <AuthExperienceLayout page={page}>
          <div>Form</div>
        </AuthExperienceLayout>
      )
      const video = view.container.querySelector<HTMLVideoElement>(
        '[data-auth-media="video"]'
      )
      assert.ok(video, `Expected video on ${page}`)
      assert.equal(
        video.querySelector('source')?.getAttribute('src'),
        '/assets/iconsax-sec1-new.mp4'
      )
      await removeNode(view)
    }
  })

  test('uses translated defaults when login page narrative is not configured', async () => {
    useStatusMock.mockReturnValue({ status: { login_page_config: {} } })

    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    const brand = view.container.querySelector<HTMLElement>(
      '[data-auth-region="brand"]'
    )
    assert.ok(brand)
    assert.ok(
      brand.querySelector('h2')?.textContent?.includes('Built for developers,')
    )
    assert.ok(
      brand.querySelector('h2')?.textContent?.includes('designed for scale')
    )
    assert.ok(
      brand.textContent?.includes(
        'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
      )
    )

    await removeNode(view)
  })

  test('renders the default headline as an accessible vertical word ticker', async () => {
    useStatusMock.mockReturnValue({ status: { login_page_config: {} } })

    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    const brand = view.container.querySelector<HTMLElement>(
      '[data-auth-region="brand"]'
    )
    assert.ok(brand)

    const ticker = brand.querySelector<HTMLElement>(
      '[data-auth-title="ticker"]'
    )
    assert.ok(ticker)
    assert.equal(ticker.getAttribute('aria-hidden'), 'true')
    assert.match(ticker.className, /h-\[1em\]/)
    assert.match(ticker.className, /overflow-hidden/)

    const words = [
      ...ticker.querySelectorAll<HTMLElement>('[data-auth-title-word]'),
    ]
    assert.deepEqual(
      words.map((word) => word.dataset.authTitleWord),
      ['design', 'build', 'integrate', 'scale', 'orchestrate']
    )
    assert.ok(
      words.every(
        (word) =>
          word.className.includes('col-start-1') &&
          word.className.includes('row-start-1')
      )
    )

    const accessibleTitle = brand.querySelector<HTMLElement>(
      '[data-auth-title="accessible"]'
    )
    assert.ok(accessibleTitle)
    assert.equal(accessibleTitle.getAttribute('aria-hidden'), null)
    assert.equal(
      accessibleTitle.textContent,
      'Built for developers, designed for scale'
    )

    const titleStyles = brand.querySelector<HTMLStyleElement>(
      'style[data-auth-motion-styles="title-ticker"]'
    )
    assert.ok(titleStyles)
    assert.match(
      titleStyles.textContent ?? '',
      /@keyframes auth-title-ticker-word/
    )
    assert.match(titleStyles.textContent ?? '', /transform:/)
    assert.match(titleStyles.textContent ?? '', /opacity:/)
    assert.match(
      titleStyles.textContent ?? '',
      /\[data-auth-title-word='design'\].*animation-delay/s
    )
    assert.match(
      titleStyles.textContent ?? '',
      /\[data-auth-title-word='orchestrate'\].*animation-delay/s
    )
    assert.match(
      titleStyles.textContent ?? '',
      /@media \(prefers-reduced-motion: reduce\)/
    )

    await removeNode(view)
  })

  test('keeps localized long headline words on one stable line without a fixed character clip', async () => {
    await i18n.changeLanguage('zh')
    useStatusMock.mockReturnValue({ status: { login_page_config: {} } })

    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    const brand = view.container.querySelector<HTMLElement>(
      '[data-auth-region="brand"]'
    )
    assert.ok(brand)
    const ticker = brand.querySelector<HTMLElement>(
      '[data-auth-title="ticker"]'
    )
    assert.ok(ticker)
    const titleWindow = ticker.parentElement
    assert.ok(titleWindow)
    assert.match(titleWindow.className, /inline-grid/)
    assert.match(titleWindow.className, /overflow-hidden/)
    assert.match(titleWindow.className, /min-w-0/)
    assert.equal(titleWindow.className.includes('w-[14ch]'), false)
    assert.match(
      brand.querySelector('h2')?.parentElement?.className ?? '',
      /justify-center/
    )
    assert.ok(ticker.textContent?.includes('编排'))

    await removeNode(view)
  })

  test('keeps the local desktop video mounted after a media error and exposes a dark fallback state', async () => {
    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    const video = view.container.querySelector<HTMLVideoElement>(
      '[data-auth-media="video"]'
    )
    assert.ok(video)
    await act(async () => {
      video.dispatchEvent(new Event('error'))
    })
    assert.ok(view.container.querySelector('[data-auth-media="video"]'))
    assert.equal(
      view.container
        .querySelector('[data-auth-media="video"]')
        ?.getAttribute('data-auth-media-state'),
      'error'
    )
    assert.match(
      view.container.querySelector('[data-auth-media="video"]')?.className ??
        '',
      /opacity-75/
    )

    await removeNode(view)
  })

  test('keeps the local desktop video mounted when the locale changes', async () => {
    useStatusMock.mockReturnValue({ status: { login_page_config: {} } })

    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    const videoBefore = view.container.querySelector<HTMLVideoElement>(
      '[data-auth-media="video"]'
    )
    assert.ok(videoBefore)

    await act(async () => {
      await i18n.changeLanguage('zh')
    })

    const videoAfter = view.container.querySelector<HTMLVideoElement>(
      '[data-auth-media="video"]'
    )
    assert.equal(videoAfter, videoBefore)
    assert.equal(videoAfter?.getAttribute('data-auth-media-state'), 'ready')
    assert.equal(
      videoAfter?.querySelector('source')?.getAttribute('src'),
      '/assets/iconsax-sec1-new.mp4'
    )

    await removeNode(view)
  })

  test('keeps the configured title static without mounting the ticker', async () => {
    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <div>Form</div>
      </AuthExperienceLayout>
    )
    const brand = view.container.querySelector<HTMLElement>(
      '[data-auth-region="brand"]'
    )
    assert.ok(brand)
    assert.equal(brand.querySelector('[data-auth-title="ticker"]'), null)
    assert.equal(
      brand.querySelector('h2')?.textContent,
      'One account for every model'
    )

    await removeNode(view)
  })

  test('renders the confirmed Simplified Chinese welcome copy with wrapping safeguards', async () => {
    await i18n.changeLanguage('zh')

    const view = await renderNode(createElement(SignIn))
    const title = view.container.querySelector('h1')
    const description = view.container.querySelector('h1 + p')

    assert.equal(title?.textContent, '欢迎回来 ！👋')
    assert.equal(description?.textContent, '登录后进入AI的汪洋大海中~')
    assert.match(title?.className ?? '', /min-w-0/)
    assert.match(title?.className ?? '', /break-words/)
    assert.match(title?.querySelector('span')?.className ?? '', /text-2xl/)
    assert.match(description?.className ?? '', /min-w-0/)
    assert.match(description?.className ?? '', /break-words/)

    await removeNode(view)
  })

  test('scopes dark semantic controls without changing the global light theme', async () => {
    document.documentElement.className = 'light'
    useStatusMock.mockReturnValue({
      status: {
        register_enabled: true,
        password_login_enabled: true,
        linuxdo_oauth: true,
        linuxdo_client_id: 'linuxdo-client',
      },
    })

    const view = await renderNode(
      <AuthExperienceLayout page='sign-in'>
        <AuthCard showBrand={false}>
          <UserAuthForm />
        </AuthCard>
      </AuthExperienceLayout>
    )
    const surface = view.container.querySelector<HTMLElement>(
      '[data-auth-layout="experience"]'
    )
    const formRegion = view.container.querySelector<HTMLElement>(
      '[data-auth-region="form"]'
    )
    const card = [
      ...(formRegion?.querySelectorAll<HTMLElement>('div') ?? []),
    ].find((element) => element.classList.contains('bg-card'))
    const username = formRegion?.querySelector<HTMLInputElement>(
      'input[name="username"]'
    )
    const forgotPassword = formRegion?.querySelector<HTMLAnchorElement>(
      'a[href="/forgot-password"]'
    )
    const divider = [...(formRegion?.querySelectorAll('span') ?? [])].find(
      (element) => element.classList.contains('bg-border')
    )
    const submit = formRegion?.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    )

    assert.ok(surface)
    assert.ok(formRegion)
    assert.equal(card, undefined)
    assert.ok(username)
    assert.ok(forgotPassword)
    assert.ok(divider)
    assert.ok(submit)
    assert.ok(submit.querySelector('[data-auth-capsule="canvas"]'))
    assert.ok(submit.querySelector('.auth-submit-content'))
    assert.ok(surface.classList.contains('dark'))
    assert.ok(surface.classList.contains('[color-scheme:dark]'))
    assert.ok(document.documentElement.classList.contains('light'))
    assert.equal(document.documentElement.classList.contains('dark'), false)
    assert.ok(formRegion.classList.contains('bg-background'))
    assert.ok(formRegion.classList.contains('text-foreground'))
    assert.ok(username.classList.contains('bg-muted'))
    assert.ok(forgotPassword.classList.contains('text-muted-foreground'))
    assert.ok(submit.classList.contains('bg-primary'))
    assert.ok(submit.classList.contains('text-primary-foreground'))
    assert.ok(submit.classList.contains('auth-submit-button'))
    assert.ok(submit.classList.contains('relative'))
    assert.ok(submit.classList.contains('isolate'))
    assert.ok(submit.classList.contains('overflow-hidden'))

    await removeNode(view)
  })

  test('renders sign-up inside the shared shell without duplicate card branding', async () => {
    const view = await renderNode(createElement(SignUp))
    const surface = view.container.querySelector<HTMLElement>(
      '[data-auth-layout="experience"]'
    )
    const formRegion = view.container.querySelector<HTMLElement>(
      '[data-auth-region="form"]'
    )

    assert.ok(surface)
    assert.ok(formRegion)
    assert.equal(surface.dataset.authPage, 'sign-up')
    assert.equal(formRegion.getAttribute('aria-label'), 'Sign up')
    assert.match(surface.className, /overflow-x-hidden/)
    assert.match(formRegion.className, /min-w-0/)
    assert.ok(view.container.querySelector('[data-testid="sign-up-form"]'))
    assert.equal(view.container.querySelectorAll('a[href="/"]').length, 2)
    assert.match(authSubmitClassName, /auth-submit-button/)

    await removeNode(view)
  })

  test('keeps the shared auth layout unchanged and lets only the sign-in card hide duplicate branding', async () => {
    const defaultView = await renderNode(
      createElement(
        AuthLayout,
        null,
        createElement(AuthCard, null, 'Default auth page')
      )
    )
    assert.match(
      defaultView.container.firstElementChild?.className ?? '',
      /h-svh/
    )
    assert.ok(defaultView.container.querySelector('a[href="/"]'))
    await removeNode(defaultView)

    const signInCardView = await renderNode(
      <AuthCard
        showBrand={false}
        title='Welcome back!'
        description='Sign in to continue to your workspace.'
      >
        Sign-in form
      </AuthCard>
    )
    assert.equal(signInCardView.container.querySelector('a[href="/"]'), null)
    assert.equal(
      signInCardView.container.querySelector('h1')?.textContent,
      'Welcome back!'
    )
    assert.match(
      signInCardView.container.querySelector('h1')?.className ?? '',
      /break-words/
    )
    await removeNode(signInCardView)
  })

  test('keeps sign-in and sign-up route links visible from both auth pages', async () => {
    useStatusMock.mockReturnValue({
      status: { register_enabled: false, self_use_mode_enabled: false },
    })
    const signInView = await renderNode(
      createElement(AuthTabs, { active: 'sign-in' })
    )
    assert.ok(signInView.container.querySelector('a[href="/sign-in"]'))
    assert.ok(signInView.container.querySelector('a[href="/sign-up"]'))
    await removeNode(signInView)

    const signUpView = await renderNode(
      createElement(AuthTabs, { active: 'sign-up' })
    )
    assert.ok(signUpView.container.querySelector('a[href="/sign-in"]'))
    assert.ok(signUpView.container.querySelector('a[href="/sign-up"]'))
    await removeNode(signUpView)
  })

  test('keeps configured OAuth and password login methods while allowing password login to be disabled', async () => {
    useStatusMock.mockReturnValue({
      status: {
        register_enabled: true,
        password_login_enabled: true,
        passkey_login: true,
        linuxdo_oauth: true,
        linuxdo_client_id: 'linuxdo-client',
        custom_oauth_providers: [
          {
            name: 'Enterprise Identity Provider With A Long Name',
            slug: 'enterprise',
            client_id: 'custom-client',
            authorization_endpoint: 'https://identity.example.com/oauth',
          },
        ],
      },
    })
    const enabledView = await renderNode(
      createElement(UserAuthForm, { redirectTo: '/dashboard' })
    )
    assert.ok(enabledView.container.querySelector('input[name="username"]'))
    assert.ok(enabledView.container.querySelector('input[name="password"]'))
    assert.ok(enabledView.container.querySelector('a[href="/forgot-password"]'))
    assert.ok(enabledView.container.querySelector('a[href="/sign-up"]'))
    assert.ok(
      enabledView.container.querySelector(
        'button[title="Continue with LinuxDO"]'
      )
    )
    assert.ok(
      enabledView.container.querySelector(
        'button[title="Continue with Enterprise Identity Provider With A Long Name"]'
      )
    )
    assert.ok(
      [...enabledView.container.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Sign in with Passkey')
      )
    )
    await removeNode(enabledView)

    useStatusMock.mockReturnValue({
      status: {
        register_enabled: true,
        password_login_enabled: false,
        linuxdo_oauth: true,
        linuxdo_client_id: 'linuxdo-client',
      },
    })
    const disabledView = await renderNode(createElement(UserAuthForm))
    assert.equal(
      disabledView.container.querySelector('input[name="username"]'),
      null
    )
    assert.equal(
      disabledView.container.querySelector('input[name="password"]'),
      null
    )
    assert.ok(disabledView.container.querySelector('a[href="/sign-up"]'))
    assert.ok(
      disabledView.container.querySelector(
        'button[title="Continue with LinuxDO"]'
      )
    )
    await removeNode(disabledView)
  })
})
