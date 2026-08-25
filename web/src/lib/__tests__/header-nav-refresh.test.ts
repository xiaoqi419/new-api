import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
import { describe, expect, test, vi } from 'vitest'

import { statusQueryOptions } from '../api'

function EmptyComponent() {
  return null
}

function TestButton(props: { children?: ReactNode }) {
  return createElement('button', null, props.children)
}

vi.mock('@/components/dialog', () => ({ Dialog: EmptyComponent }))
vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: EmptyComponent,
}))
vi.mock('@/components/notification-popover', () => ({
  NotificationPopover: EmptyComponent,
}))
vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: EmptyComponent,
}))
vi.mock('@/components/promo-banner', () => ({ PromoBanner: EmptyComponent }))
vi.mock('@/components/theme-switch', () => ({ ThemeSwitch: EmptyComponent }))
vi.mock('@/components/ui/button', () => ({ Button: TestButton }))
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: EmptyComponent }))
vi.mock('@/features/community', () => ({ CommunityMenu: EmptyComponent }))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    announcements: [],
    versions: [],
    loading: false,
    unreadCount: 0,
    popoverOpen: false,
    setPopoverOpen: () => undefined,
    activeTab: 'announcements',
    setActiveTab: () => undefined,
  }),
}))
vi.mock('@/hooks/use-system-config', () => ({
  mapStatusDataToConfig: () => ({}),
  useSystemConfig: () => ({
    systemName: 'New API',
    logo: '',
    loading: false,
    logoLoaded: false,
  }),
}))
vi.mock('@/components/layout/components/header-logo', () => ({
  HeaderLogo: EmptyComponent,
}))
vi.mock('@/features/pricing', () => ({ Pricing: EmptyComponent }))
vi.mock('@/features/pricing/components/model-details', () => ({
  ModelDetails: EmptyComponent,
}))
vi.mock('@/features/rankings', () => ({ Rankings: EmptyComponent }))

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { PublicHeader } =
  await import('@/components/layout/components/public-header')
const { Route: pricingRoute } = await import('@/routes/pricing')
const { Route: modelDetailsRoute } = await import('@/routes/pricing/$modelId')
const { Route: rankingsRoute } = await import('@/routes/rankings')

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })

type RouteGuard = (options: {
  context: { queryClient: QueryClient }
  location: { href: string }
}) => Promise<void>

type PublicRoute = {
  name: string
  href: string
  guard: RouteGuard
  pricingEnabled: boolean
  rankingsEnabled: boolean
  enabledHref: string
  disabledHref: string
}

const publicRoutes: PublicRoute[] = [
  {
    name: 'Model Square',
    href: '/pricing',
    guard: pricingRoute.options.beforeLoad as unknown as RouteGuard,
    pricingEnabled: true,
    rankingsEnabled: false,
    enabledHref: '/pricing',
    disabledHref: '/rankings',
  },
  {
    name: 'model detail',
    href: '/pricing/gpt-5',
    guard: modelDetailsRoute.options.beforeLoad as unknown as RouteGuard,
    pricingEnabled: true,
    rankingsEnabled: false,
    enabledHref: '/pricing',
    disabledHref: '/rankings',
  },
  {
    name: 'rankings',
    href: '/rankings',
    guard: rankingsRoute.options.beforeLoad as unknown as RouteGuard,
    pricingEnabled: false,
    rankingsEnabled: true,
    enabledHref: '/rankings',
    disabledHref: '/pricing',
  },
]

function createHeaderStatus(
  pricingEnabled: boolean,
  rankingsEnabled: boolean,
  docsEnabled = true
) {
  return {
    HeaderNavModules: JSON.stringify({
      pricing: { enabled: pricingEnabled, requireAuth: false },
      rankings: { enabled: rankingsEnabled, requireAuth: false },
      docs: docsEnabled,
    }),
  }
}

async function renderPublicHeader(queryClient: QueryClient): Promise<string> {
  const rootRoute = createRootRoute({
    component: () =>
      createElement(PublicHeader, {
        showAuthButtons: false,
        showLanguageSwitcher: false,
        showNotifications: false,
        showThemeSwitch: false,
      }),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient },
  })

  await router.load()

  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        I18nextProvider,
        { i18n },
        createElement(RouterProvider, { router })
      )
    )
  )
}

describe('header navigation refresh', () => {
  test('keeps in-app docs in desktop and mobile navigation when status disables docs', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const status = createHeaderStatus(false, false, false)

    queryClient.setQueryData(statusQueryOptions.queryKey, status)

    try {
      const markup = await renderPublicHeader(queryClient)
      const desktopNavigationIndex = markup.indexOf(
        'public-header-desktop public-header-links'
      )
      const mobileNavigationIndex = markup.indexOf(
        'id="public-mobile-navigation"'
      )

      expect(markup.indexOf('href="/docs"')).toBeGreaterThan(
        desktopNavigationIndex
      )
      expect(markup.indexOf('href="/docs"')).toBeLessThan(mobileNavigationIndex)
      expect(
        markup.indexOf('href="/docs"', mobileNavigationIndex)
      ).toBeGreaterThan(mobileNavigationIndex)
    } finally {
      queryClient.clear()
    }
  })

  for (const publicRoute of publicRoutes) {
    test(`refreshes the public Header before ${publicRoute.name} renders`, async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const staleStatus = createHeaderStatus(false, false)
      const freshStatus = createHeaderStatus(
        publicRoute.pricingEnabled,
        publicRoute.rankingsEnabled
      )
      const originalQueryFn = statusQueryOptions.queryFn
      let requestCount = 0

      queryClient.setQueryData(statusQueryOptions.queryKey, staleStatus, {
        updatedAt: 1,
      })
      statusQueryOptions.queryFn = async () => {
        requestCount += 1
        return freshStatus
      }

      try {
        await publicRoute.guard({
          context: { queryClient },
          location: { href: publicRoute.href },
        })
        const markup = await renderPublicHeader(queryClient)

        expect(requestCount).toBe(1)
        expect(queryClient.getQueryData(statusQueryOptions.queryKey)).toEqual(
          freshStatus
        )
        expect(markup).toMatch(new RegExp(`href="${publicRoute.enabledHref}"`))
        expect(markup).not.toMatch(
          new RegExp(`href="${publicRoute.disabledHref}"`)
        )
      } finally {
        statusQueryOptions.queryFn = originalQueryFn
        queryClient.clear()
      }
    })
  }
})
