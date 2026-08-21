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
import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { PublicHeader } from '../public-header'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: React.ComponentProps<'a'> & { to: string }) => {
    const { to, ...anchorProps } = props
    return <a href={to} {...anchorProps} />
  },
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: '/pricing' } }),
}))

vi.mock('@/components/dialog', () => ({
  Dialog: (props: { children: React.ReactNode }) => props.children,
}))

vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => <div data-testid='language-switcher' />,
}))

vi.mock('@/components/notification-popover', () => ({
  NotificationPopover: () => <div data-testid='notifications' />,
}))

vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: () => <div data-testid='profile-dropdown' />,
}))

vi.mock('@/components/promo-banner', () => ({
  PromoBanner: () => null,
}))

vi.mock('@/components/theme-switch', () => ({
  ThemeSwitch: () => <div data-testid='theme-switch' />,
}))

vi.mock('@/features/community', () => ({
  CommunityMenu: () => <div data-testid='community-menu' />,
}))

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    popoverOpen: false,
    setPopoverOpen: vi.fn(),
    unreadCount: 0,
    activeTab: 'announcements',
    setActiveTab: vi.fn(),
    announcements: [],
    versions: [],
    loading: false,
  }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'New API',
    logo: '/logo.png',
    loading: false,
    logoLoaded: true,
  }),
}))

vi.mock('@/hooks/use-top-nav-links', () => ({
  useTopNavLinks: () => [
    { title: 'Model Square', href: '/pricing' },
    { title: 'Docs', href: '/docs' },
  ],
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ auth: { user: null } }),
}))

describe('PublicHeader', () => {
  test('uses the home visual frame for pricing without changing its sign-in behavior', () => {
    const { container } = render(<PublicHeader visualSurface='home' />)

    expect(container.querySelector('.public-header-frame')).toHaveClass(
      'w-full',
      'max-w-[1392px]',
      'pt-4',
      'sm:pt-6'
    )
    expect(container.querySelector('.public-header-nav')).toHaveClass(
      'h-16',
      'px-0'
    )
    expect(
      container.querySelector('.public-header-controls a')
    ).toHaveAttribute('href', '/sign-in')
    expect(
      container.querySelector('.public-header-links a[href="/pricing"]')
    ).toHaveClass('public-header-nav-link-active')
  })

  test('keeps the business frame when the visual surface is business', () => {
    const { container } = render(<PublicHeader visualSurface='business' />)

    expect(container.querySelector('.public-header-frame')).toHaveClass(
      'max-w-7xl',
      'pt-0'
    )
    expect(container.querySelector('.public-header-nav')).toHaveClass(
      'h-16',
      'px-2'
    )
  })
})
