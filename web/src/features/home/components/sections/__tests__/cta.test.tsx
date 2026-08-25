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
import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { CTA } from '../cta'

const useSystemConfigMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: useSystemConfigMock,
}))

vi.mock('@/components/animate-in-view', () => ({
  AnimateInView: ({
    animation: _animation,
    children,
    ...props
  }: ComponentProps<'div'> & { animation?: string }) => (
    <div {...props}>{children}</div>
  ),
}))

function renderCTARouter() {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CTA />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
}

describe('CTA dynamic site branding', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    useSystemConfigMock.mockReturnValue({
      systemName: 'New API',
      loading: false,
    })
  })

  test('uses the configured system name once in its gradient card without a fixed subtitle', async () => {
    const systemName = 'Acme AI Gateway'
    useSystemConfigMock.mockReturnValue({
      systemName,
      loading: false,
    })

    renderCTARouter()

    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
      systemName
    )

    const brandCard = screen.getByTestId('home-cta-brand-card')
    const cardLabel = within(brandCard).getByText(systemName)
    expect(cardLabel).toHaveClass('truncate')
    expect(within(brandCard).queryByText('New API')).not.toBeInTheDocument()
  })

  test('renders the default system name exactly once in its gradient card while configuration is blank', async () => {
    useSystemConfigMock.mockReturnValue({
      systemName: '   ',
      loading: true,
    })

    renderCTARouter()

    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
      'New API'
    )
    expect(
      within(screen.getByTestId('home-cta-brand-card')).getAllByText('New API')
    ).toHaveLength(1)
  })
})
