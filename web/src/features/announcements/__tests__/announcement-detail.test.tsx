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

import { AnnouncementDetail } from '../detail'

type MockButtonProps = ComponentProps<'button'> & { render?: ReactNode }

const mocks = vi.hoisted(() => ({
  acknowledgeModal: vi.fn(),
  acknowledgedModalKeys: [] as string[],
  modalAnnouncementKey: vi.fn(() => 'modal:site:42:10:1800000000'),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: {
      success: true,
      data: {
        id: 10,
        title: 'Scheduled maintenance',
        content: 'The **gateway** will restart.',
        type: 'system',
        level: 'modal',
        version: '',
        pinned: false,
        published: true,
        publish_time: 1_800_000_000,
        created_at: 1_800_000_000,
        updated_at: 1_800_000_000,
      },
    },
    isLoading: false,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/icons', () => ({
  ArrowLeft: () => null,
  CheckCircle2: () => null,
}))

vi.mock('@/components/layout', () => {
  const Layout = (props: { children: ReactNode }) => <div>{props.children}</div>
  Layout.Title = (props: { children: ReactNode }) => props.children
  Layout.Content = (props: { children: ReactNode }) => props.children
  return { SectionPageLayout: Layout }
})

vi.mock('@/components/status-badge', () => ({
  StatusBadge: (props: { label: string }) => <span>{props.label}</span>,
}))

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

vi.mock('@/components/ui/markdown', () => ({
  Markdown: (props: { children: string }) => <div>{props.children}</div>,
}))

vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => null }))

vi.mock('@/hooks/use-public-announcements', () => ({
  modalAnnouncementKey: mocks.modalAnnouncementKey,
}))

vi.mock('@/lib/format', () => ({
  formatTimestampToDate: () => '2027-01-15',
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { id: 42 } } }),
}))

vi.mock('@/stores/notification-store', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  return {
    useNotificationStore: (selector: (state: unknown) => unknown) => {
      const [, refresh] = React.useReducer((value) => value + 1, 0)
      const acknowledgeModal = (key: string) => {
        mocks.acknowledgeModal(key)
        mocks.acknowledgedModalKeys.push(key)
        refresh()
      }

      return selector({
        acknowledgeModal,
        acknowledgedModalKeys: mocks.acknowledgedModalKeys,
      })
    },
  }
})

describe('AnnouncementDetail', () => {
  test('acknowledges a modal announcement only after the explicit action', () => {
    render(<AnnouncementDetail announcementId={10} />)

    expect(mocks.acknowledgeModal).not.toHaveBeenCalled()

    const markAsRead = screen.getByRole('button', { name: 'Mark as read' })
    fireEvent.click(markAsRead)

    expect(mocks.acknowledgeModal).toHaveBeenCalledWith(
      'modal:site:42:10:1800000000'
    )
    expect(markAsRead).toBeDisabled()
  })
})
