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
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { AnnouncementCenter } from '..'

type MockButtonProps = ComponentProps<'button'> & { render?: ReactNode }

const mocks = vi.hoisted(() => ({ refetch: vi.fn() }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: undefined,
    isError: true,
    isFetching: false,
    isLoading: false,
    refetch: mocks.refetch,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/icons', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
}))

vi.mock('@/components/layout', () => {
  const Layout = (props: { children: ReactNode }) => <div>{props.children}</div>
  Layout.Title = (props: { children: ReactNode }) => props.children
  Layout.Content = (props: { children: ReactNode }) => props.children
  return { SectionPageLayout: Layout }
})

vi.mock('@/components/status-badge', () => ({ StatusBadge: () => null }))

vi.mock('@/components/ui/button', () => ({
  Button: ({ render: _render, ...props }: MockButtonProps) => (
    <button type='button' {...props} />
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: (props: { children: ReactNode }) => <section>{props.children}</section>,
}))

vi.mock('@/components/ui/empty', () => ({
  Empty: (props: { children: ReactNode }) => <div>{props.children}</div>,
  EmptyHeader: (props: { children: ReactNode }) => <div>{props.children}</div>,
  EmptyTitle: (props: { children: ReactNode }) => <h2>{props.children}</h2>,
}))

vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }))

describe('AnnouncementCenter loading failure', () => {
  test('shows a retryable error instead of treating a failed request as an empty history', () => {
    render(<AnnouncementCenter />)

    expect(screen.getByText('Failed to load announcements')).toBeVisible()
    expect(screen.queryByText('No announcements yet')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(mocks.refetch).toHaveBeenCalledOnce()
  })
})
