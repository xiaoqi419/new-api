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

import { CommandMenu } from '../command-menu'

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/dashboard' }),
  useNavigate: () => vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/context/search-provider', () => ({
  useSearch: () => ({ open: true, setOpen: vi.fn() }),
}))

vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

vi.mock('@/hooks/use-sidebar-data', () => ({
  useSidebarData: () => ({
    navGroups: [
      {
        id: 'admin',
        title: 'Admin',
        items: [{ title: 'Channels', url: '/channels' }],
      },
    ],
  }),
}))

vi.mock('@/hooks/use-sidebar-view', () => ({
  useSidebarView: () => ({
    key: '__root',
    view: null,
    navGroups: [
      {
        id: 'general',
        title: 'General',
        items: [{ title: 'API Keys', url: '/keys' }],
      },
      {
        id: 'account',
        title: 'Account',
        items: [
          {
            title: 'Account settings',
            items: [{ title: 'Profile', url: '/account/profile' }],
          },
        ],
      },
    ],
  }),
}))

vi.mock('@/components/layout/lib/sidebar-view-registry', () => ({
  getNavGroupsForPath: () => null,
}))

vi.mock('@/components/ui/command', () => ({
  Command: (props: { children: React.ReactNode }) => props.children,
  CommandDialog: (props: { children: React.ReactNode; open: boolean }) =>
    props.open ? <div>{props.children}</div> : null,
  CommandEmpty: (props: { children: React.ReactNode }) => props.children,
  CommandGroup: (props: {
    children: React.ReactNode
    heading: React.ReactNode
  }) => (
    <section>
      <h2>{props.heading}</h2>
      {props.children}
    </section>
  ),
  CommandInput: (props: { placeholder?: string }) => (
    <input placeholder={props.placeholder} />
  ),
  CommandItem: (props: {
    children: React.ReactNode
    onSelect?: () => void
  }) => (
    <button type='button' onClick={props.onSelect}>
      {props.children}
    </button>
  ),
  CommandList: (props: { children: React.ReactNode }) => props.children,
  CommandSeparator: () => <hr />,
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: (props: { children: React.ReactNode }) => props.children,
}))

describe('CommandMenu navigation visibility', () => {
  test('renders direct and nested entries from the filtered sidebar view only', () => {
    render(<CommandMenu />)

    expect(screen.getByText('API Keys')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Account settings.*Profile/ })
    ).toBeInTheDocument()
    expect(screen.queryByText('Channels')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })
})
