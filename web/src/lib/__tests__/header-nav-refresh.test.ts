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
import { describe, mock, test } from 'node:test'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { statusQueryOptions } from '../api'

function EmptyComponent() {
  return null
}

function TestButton(props: { children?: ReactNode }) {
  return createElement('button', null, props.children)
}

mock.module('@/components/dialog', {
  namedExports: { Dialog: EmptyComponent },
})
mock.module('@/components/language-switcher', {
  namedExports: { LanguageSwitcher: EmptyComponent },
})
mock.module('@/components/notification-popover', {
  namedExports: { NotificationPopover: EmptyComponent },
})
mock.module('@/components/profile-dropdown', {
  namedExports: { ProfileDropdown: EmptyComponent },
})
mock.module('@/components/promo-banner', {
  namedExports: { PromoBanner: EmptyComponent },
})
mock.module('@/components/theme-switch', {
  namedExports: { ThemeSwitch: EmptyComponent },
})
mock.module('@/components/ui/button', {
  namedExports: { Button: TestButton },
})
mock.module('@/components/ui/skeleton', {
  namedExports: { Skeleton: EmptyComponent },
})
mock.module('@/features/community', {
  namedExports: { CommunityMenu: EmptyComponent },
})
mock.module('@/hooks/use-notifications', {
  namedExports: {
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
  },
})
mock.module('@/hooks/use-system-config', {
  namedExports: {
    mapStatusDataToConfig: () => ({}),
    useSystemConfig: () => ({
      systemName: 'New API',
      logo: '',
      loading: false,
      logoLoaded: false,
    }),
  },
})
mock.module('@/components/layout/components/header-logo', {
  namedExports: { HeaderLogo: EmptyComponent },
})
mock.module('@/features/pricing', {
  namedExports: { Pricing: EmptyComponent },
})
mock.module('@/features/pricing/components/model-details', {
  namedExports: { ModelDetails: EmptyComponent },
})
mock.module('@/features/rankings', {
  namedExports: { Rankings: EmptyComponent },
})

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

function createHeaderStatus(pricingEnabled: boolean, rankingsEnabled: boolean) {
  return {
    HeaderNavModules: JSON.stringify({
      pricing: { enabled: pricingEnabled, requireAuth: false },
      rankings: { enabled: rankingsEnabled, requireAuth: false },
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
  for (const publicRoute of publicRoutes) {
    test(
      `refreshes the public Header before ${publicRoute.name} renders`,
      { concurrency: false },
      async () => {
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

          assert.equal(requestCount, 1)
          assert.deepEqual(
            queryClient.getQueryData(statusQueryOptions.queryKey),
            freshStatus
          )
          assert.match(markup, new RegExp(`href="${publicRoute.enabledHref}"`))
          assert.doesNotMatch(
            markup,
            new RegExp(`href="${publicRoute.disabledHref}"`)
          )
        } finally {
          statusQueryOptions.queryFn = originalQueryFn
          queryClient.clear()
        }
      }
    )
  }
})
