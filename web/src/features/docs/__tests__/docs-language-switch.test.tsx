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
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { Docs } from '..'

const i18n = vi.hoisted(() => ({ language: 'en' }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n,
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/copy-button', () => ({
  CopyButton: () => <button type='button'>Copy</button>,
}))

vi.mock('@/components/icons', () => ({
  ChevronDown: () => null,
  Download: () => null,
}))

vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: ReactNode }) => <div>{props.children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props} />
  ),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://gateway.example.test' },
  }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

class IntersectionObserverMock {
  observe(): void {}
  disconnect(): void {}
}

describe('Docs language switching', () => {
  test('updates the tab, sidebar, and active document in one render without changing IDs', () => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    window.history.replaceState(null, '', '#overview')
    i18n.language = 'en'

    const view = render(<Docs />)

    expect(screen.getByRole('button', { name: 'User Guides' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Getting Started' })
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeVisible()
    expect(window.location.hash).toBe('#overview')

    i18n.language = 'zh-TW'
    view.rerender(<Docs />)

    expect(screen.getByRole('button', { name: '用户指南' })).toBeVisible()
    expect(screen.getByRole('button', { name: '开始' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '概述' })).toBeVisible()
    expect(window.location.hash).toBe('#overview')
  })

  test('uses the complete English tree for non-Chinese interface languages', () => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    window.history.replaceState(null, '', '#overview')
    i18n.language = 'fr'

    render(<Docs />)

    expect(screen.getByRole('button', { name: 'User Guides' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Getting Started' })
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeVisible()
  })
})
