/*
Copyright (C) 2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { HeroContent } from '../../../types'
import { Hero } from '../hero'

vi.mock('@lobehub/icons', () => ({
  CherryStudio: { Color: () => null },
}))

const useStatusMock = vi.hoisted(() =>
  vi.fn(() => ({
    status: { docs_link: 'https://external.example/docs' },
  }))
)

vi.mock('@/hooks/use-status', () => ({
  useStatus: useStatusMock,
}))

vi.stubGlobal('scrollTo', vi.fn())

function renderHeroRouter(
  isAuthenticated: boolean,
  content?: Partial<HeroContent>
) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <Hero isAuthenticated={isAuthenticated} content={content} />
    ),
  })
  const docsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/docs',
    component: () => <div>Documentation</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, docsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  return router
}

describe('Hero documentation link', () => {
  test.each([
    ['signed-out', false],
    ['signed-in', true],
  ])(
    'uses the internal docs route for %s visitors even when status advertises an external URL',
    async (_scenario, isAuthenticated) => {
      const user = userEvent.setup()
      const router = renderHeroRouter(isAuthenticated)

      const docsLink = await screen.findByRole('button', { name: 'Docs' })
      expect(docsLink).toHaveAttribute('href', '/docs')
      expect(docsLink).not.toHaveAttribute('target')
      expect(docsLink).not.toHaveAttribute(
        'href',
        'https://external.example/docs'
      )
      expect(useStatusMock).not.toHaveBeenCalled()

      await user.click(docsLink)

      expect(router.state.location.pathname).toBe('/docs')
    }
  )
})

describe('Hero supported applications layout', () => {
  test('contains a long application name within the responsive app region', async () => {
    const longAppName =
      'A very long supported application name for layout testing'

    renderHeroRouter(false, {
      apps: [
        {
          name: longAppName,
          url: 'https://example.test/application',
        },
      ],
    })

    const appsRegion = await screen.findByTestId('home-hero-supported-apps')
    expect(appsRegion).toHaveClass('min-w-0', 'max-w-full')

    const apps = screen.getByTestId('home-hero-app-chips')
    expect(apps).toHaveClass('min-w-0', 'max-w-full')

    const appLink = screen.getByRole('link', { name: new RegExp(longAppName) })
    expect(appLink).toHaveClass('min-w-0', 'max-w-full')
    expect(appLink.lastElementChild).toHaveClass('min-w-0', 'truncate')
  })

  test('keeps the desktop hero rhythm inside the fixed background', async () => {
    renderHeroRouter(false)

    expect(await screen.findByTestId('home-hero')).toHaveClass('xl:h-[897px]')
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(
      'lg:min-h-[210px]',
      'lg:leading-[70px]'
    )
    expect(screen.getByTestId('home-hero-actions')).toHaveClass('lg:mt-[24px]')
    expect(screen.getByTestId('home-hero-supported-apps')).toHaveClass(
      'lg:mt-[24px]'
    )
    expect(screen.getByTestId('home-hero-card-art')).not.toHaveClass(
      'translate-x-[210px]'
    )
  })
})
