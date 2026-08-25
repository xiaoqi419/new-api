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
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { AppHeader } from '../app-header'

vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => (
    <button type='button' data-slot='button'>
      Language
    </button>
  ),
}))

vi.mock('@/components/notification-popover', () => ({
  NotificationPopover: () => (
    <button type='button' data-slot='button'>
      Notifications
    </button>
  ),
}))

vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: () => (
    <button type='button' data-slot='button'>
      Profile
    </button>
  ),
}))

vi.mock('@/components/promo-banner', () => ({
  PromoBanner: () => null,
}))

vi.mock('@/components/search', () => ({
  Search: (props: { className?: string }) => (
    <button
      type='button'
      className={props.className}
      data-testid='header-search'
    >
      <svg />
      <span>Search</span>
    </button>
  ),
}))

vi.mock('@/components/theme-switch', () => ({
  ThemeSwitch: () => (
    <button type='button' data-slot='button'>
      Theme
    </button>
  ),
}))

vi.mock('@/features/community', () => ({
  CommunityMenu: () => <div>Community</div>,
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

vi.mock('@/hooks/use-top-nav-links', () => ({
  useTopNavLinks: () => [],
}))

vi.mock('../header', () => ({
  Header: (props: { children: React.ReactNode }) => (
    <header>{props.children}</header>
  ),
}))

vi.mock('../system-brand', () => ({
  SystemBrand: () => (
    <a href='/'>
      <img alt='' />
      <span>A deliberately long English system name</span>
    </a>
  ),
}))

vi.mock('../top-nav', () => ({
  TopNav: () => <nav>Top navigation</nav>,
}))

describe('AppHeader responsive layout', () => {
  test('uses compact action spacing on constrained desktops and restores it on wide screens', () => {
    const { container } = render(<AppHeader />)

    expect(
      container.querySelector('[data-slot="app-header-brand"]')
    ).toHaveClass('min-w-0', 'shrink-0', 'max-2xl:[&_a>span]:hidden')
    expect(
      container.querySelector('[data-slot="app-header-actions"]')
    ).toHaveClass(
      'min-w-0',
      'shrink-0',
      'gap-0',
      'max-sm:[&_[data-slot=button]]:size-8',
      'sm:gap-1',
      '2xl:gap-2'
    )
    expect(screen.getByTestId('header-search')).toHaveClass(
      'max-sm:size-8',
      'max-sm:flex-none',
      'max-sm:p-0',
      'max-sm:[&>span]:sr-only'
    )
  })

  test('keeps every desktop header control mounted', () => {
    render(<AppHeader />)

    expect(screen.getByText('Top navigation')).toBeInTheDocument()
    expect(screen.getByText('Community')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })
})
