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
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import type { SystemStatus } from '../../types'
import { TermsFooter } from '../terms-footer'

interface TermsFooterRouterOptions {
  status: SystemStatus
}

function renderTermsFooterRouter(options: TermsFooterRouterOptions) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TermsFooter status={options.status} />
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const userAgreementRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/user-agreement',
  })
  const privacyPolicyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/privacy-policy',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      userAgreementRoute,
      privacyPolicyRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  return router
}

describe('TermsFooter', () => {
  test('renders only enabled legal links and navigates without leaving the router', async () => {
    const user = userEvent.setup()
    const router = renderTermsFooterRouter({
      status: {
        user_agreement_enabled: true,
        privacy_policy_enabled: false,
      },
    })

    const agreementLink = await screen.findByRole('link', {
      name: 'User Agreement',
    })
    expect(agreementLink).toHaveAttribute('href', '/user-agreement')
    expect(
      screen.queryByRole('link', { name: 'Privacy Policy' })
    ).not.toBeInTheDocument()

    await user.click(agreementLink)

    expect(router.state.location.pathname).toBe('/user-agreement')
  })

  test('renders both legal links when both status flags are enabled', async () => {
    renderTermsFooterRouter({
      status: {
        user_agreement_enabled: true,
        privacy_policy_enabled: true,
      },
    })

    expect(
      await screen.findByRole('link', { name: 'User Agreement' })
    ).toHaveAttribute('href', '/user-agreement')
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' })
    ).toHaveAttribute('href', '/privacy-policy')
  })

  test('renders no footer when every legal link is disabled', () => {
    const { container } = render(
      <TermsFooter
        status={{
          user_agreement_enabled: false,
          privacy_policy_enabled: false,
        }}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
