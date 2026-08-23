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
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { AuthLayout } from '../auth-layout'
import { AuthCard } from '../components/auth-card'

const { useStatusMock, useSystemConfigMock } = vi.hoisted(() => ({
  useStatusMock: vi.fn(),
  useSystemConfigMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: React.ComponentProps<'a'> & { to: string }) => {
    const { to, ...anchorProps } = props
    return <a href={to} {...anchorProps} />
  },
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: useStatusMock,
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: useSystemConfigMock,
}))

describe('AuthLayout', () => {
  beforeEach(() => {
    useStatusMock.mockReturnValue({
      status: {
        login_page_config: {
          background_image: '/auth-background.jpg',
          title: 'Welcome back',
          description: 'One account for every model and workspace.',
          stats: [
            { value: '40+', label: 'providers' },
            { value: '24/7', label: 'availability' },
          ],
        },
      },
    })
    useSystemConfigMock.mockReturnValue({
      systemName: 'New API',
      logo: '/logo.png',
      loading: false,
    })
  })

  test('renders the configured desktop brand panel and preserves the child slot', () => {
    const { container } = render(
      <AuthLayout>
        <div data-testid='auth-child'>Sign-in form</div>
      </AuthLayout>
    )

    expect(
      screen.getByRole('heading', { name: 'Welcome back', level: 2 })
    ).toBeInTheDocument()
    expect(
      screen.getByText('One account for every model and workspace.')
    ).toBeInTheDocument()
    const providersLabel = screen.getByText('providers')
    expect(providersLabel.previousElementSibling).toHaveTextContent('40+')
    expect(screen.getByText('24/7')).toBeInTheDocument()
    expect(screen.getByText('availability')).toBeInTheDocument()
    expect(screen.getByTestId('auth-child')).toHaveTextContent('Sign-in form')

    const background = container.querySelector('img[aria-hidden="true"]')
    expect(background).toHaveAttribute('src', '/auth-background.jpg')
  })

  test('shows the mobile brand mark by default and allows pages to disable it', () => {
    const { unmount } = render(
      <AuthLayout>
        <div>Sign-in form</div>
      </AuthLayout>
    )

    expect(screen.getAllByRole('link', { name: 'Logo New API' })).toHaveLength(
      2
    )
    for (const brandLink of screen.getAllByRole('link', {
      name: 'Logo New API',
    })) {
      expect(brandLink).toHaveAttribute('href', '/')
    }

    unmount()
    render(
      <AuthLayout showMobileBrandMark={false}>
        <div>Sign-in form</div>
      </AuthLayout>
    )

    expect(screen.getAllByRole('link', { name: 'Logo New API' })).toHaveLength(
      1
    )
  })

  test('uses the system name as the desktop heading when no title is configured', () => {
    useStatusMock.mockReturnValue({ status: { login_page_config: {} } })

    render(
      <AuthLayout>
        <div>Sign-in form</div>
      </AuthLayout>
    )

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'New API',
      })
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Integrate Claude Code, Codex CLI, Gemini CLI and more AI coding assistants'
      )
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  test('honors a configured title even when it matches the system name', () => {
    useStatusMock.mockReturnValue({
      status: {
        login_page_config: {
          title: 'New API',
        },
      },
    })

    render(
      <AuthLayout>
        <div>Sign-in form</div>
      </AuthLayout>
    )

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'New API',
      })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Logo New API' })).toHaveLength(
      2
    )
  })

  test('renders long configured values in their brand and content slots', () => {
    const longSystemName = 'NewAPI'.repeat(20)
    const longTitle = 'ConfiguredTitle'.repeat(20)
    const longDescription = 'ConfiguredDescription'.repeat(20)
    const longStatValue = '9999999999'.repeat(12)
    const longStatLabel = 'ConfiguredStatLabel'.repeat(12)

    useSystemConfigMock.mockReturnValue({
      systemName: longSystemName,
      logo: '/logo.png',
      loading: false,
    })
    useStatusMock.mockReturnValue({
      status: {
        login_page_config: {
          title: longTitle,
          description: longDescription,
          stats: [{ value: longStatValue, label: longStatLabel }],
        },
      },
    })

    render(
      <AuthLayout>
        <AuthCard>Sign-in form</AuthCard>
      </AuthLayout>
    )

    expect(
      screen.getAllByRole('link', { name: `Logo ${longSystemName}` })
    ).toHaveLength(3)
    expect(screen.getByRole('heading', { name: longTitle })).toBeInTheDocument()
    expect(screen.getByText(longDescription)).toBeInTheDocument()
    expect(screen.getByText(longStatValue)).toBeInTheDocument()
    expect(screen.getByText(longStatLabel)).toBeInTheDocument()
  })
})
