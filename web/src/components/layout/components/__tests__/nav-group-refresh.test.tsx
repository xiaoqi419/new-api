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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { NavGroup } from '../nav-group'

function renderNavigation(initialHref: string, defaultOpen = true) {
  const root = createRootRoute({
    component: () => (
      <SidebarProvider defaultOpen={defaultOpen}>
        <NavGroup
          title='Admin'
          items={[
            {
              title: 'Users',
              url: '/users',
              activeUrls: ['/users/edit'],
            },
            { title: 'Channels', url: '/channels' },
            {
              title: 'Reports',
              items: [{ title: 'Usage', url: '/reports/usage' }],
            },
          ]}
        />
        <Outlet />
      </SidebarProvider>
    ),
  })
  const routes = ['/users', '/users/edit', '/channels', '/reports/usage'].map(
    (path) =>
      createRoute({
        getParentRoute: () => root,
        path,
        component: () => <div>Page content</div>,
      })
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialHref] }),
  })

  render(<RouterProvider router={router} />)
  return router
}

describe('sidebar navigation refresh', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  test('clicking the current menu after navigating to it reloads the current page', async () => {
    const user = userEvent.setup()
    const router = renderNavigation('/channels')

    await user.click(await screen.findByRole('link', { name: 'Users' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/users'))

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
    await user.click(screen.getByRole('link', { name: 'Users' }))

    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ href: '/users', reloadDocument: true })
    )
  })

  test('clicking a current menu with filters reloads its full URL', async () => {
    const user = userEvent.setup()
    const router = renderNavigation('/users?page=2')
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()

    await user.click(await screen.findByRole('link', { name: 'Users' }))

    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ href: '/users?page=2', reloadDocument: true })
    )
  })

  test('clicking a highlighted menu for another route navigates to its destination', async () => {
    const user = userEvent.setup()
    const router = renderNavigation('/users/edit')

    await user.click(await screen.findByRole('link', { name: 'Users' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/users'))
  })

  test('clicking the current submenu reloads its page', async () => {
    const user = userEvent.setup()
    const router = renderNavigation('/reports/usage')
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()

    await user.click(await screen.findByRole('link', { name: 'Usage' }))

    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ href: '/reports/usage', reloadDocument: true })
    )
  })

  test('clicking the current submenu in a collapsed sidebar reloads its page', async () => {
    const user = userEvent.setup()
    const router = renderNavigation('/reports/usage', false)
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()

    await user.click(await screen.findByRole('button', { name: 'Reports' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Usage' }))

    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ href: '/reports/usage', reloadDocument: true })
    )
  })
})
