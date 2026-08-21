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

function renderHeroRouter(isAuthenticated: boolean) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Hero isAuthenticated={isAuthenticated} />,
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
