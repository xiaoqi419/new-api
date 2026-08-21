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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { Footer } from '../footer'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: React.ComponentProps<'a'> & { to: string }) => {
    const { to, ...anchorProps } = props
    return <a href={to} {...anchorProps} />
  },
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      user_agreement_enabled: false,
      privacy_policy_enabled: false,
    },
  }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'New API',
    logo: '/logo.png',
    footerHtml: '',
    demoSiteEnabled: false,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ auth: { user: null } }),
}))

describe('Footer', () => {
  test('always renders the three-slot Figma legal row on the homepage', () => {
    const { container } = render(<Footer />)
    const homeLegal = container.querySelector('.footer-home-legal')

    expect(homeLegal).not.toBeNull()
    expect(homeLegal?.children).toHaveLength(3)
    expect(
      within(homeLegal as HTMLElement).getByRole('link', {
        name: 'Terms & Agreements',
      })
    ).toHaveAttribute('href', '/user-agreement')
    expect(
      within(homeLegal as HTMLElement).getByRole('link', {
        name: 'Privacy Policy',
      })
    ).toHaveAttribute('href', '/privacy-policy')
    expect(homeLegal?.querySelector('.footer-home-terms')).toBeTruthy()
    expect(homeLegal?.querySelector('.footer-home-copyright')).toBeTruthy()
    expect(homeLegal?.querySelector('.footer-home-privacy')).toBeTruthy()
  })

  test('keeps disabled legal links out of the default footer metadata', () => {
    const { container } = render(<Footer />)
    const defaultMeta = container.querySelector('.footer-default-meta')

    expect(defaultMeta?.querySelector('a[href="/user-agreement"]')).toBeNull()
    expect(defaultMeta?.querySelector('a[href="/privacy-policy"]')).toBeNull()
  })

  test('uses two explicit mobile link columns with copyright spanning both', () => {
    const stylesheet = readFileSync(
      resolve(process.cwd(), 'src/styles/theme-presets.css'),
      'utf8'
    )
    const mobileFooterStyles = stylesheet.slice(
      stylesheet.indexOf('@media (max-width: 767px)'),
      stylesheet.indexOf("[data-public-surface='business']")
    )

    expect(mobileFooterStyles).toMatch(
      /\.footer-home-copyright\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/
    )
    expect(mobileFooterStyles).toMatch(
      /\.footer-home-terms\s*\{[^}]*grid-column:\s*1/
    )
    expect(mobileFooterStyles).toMatch(
      /\.footer-home-privacy\s*\{[^}]*grid-column:\s*2/
    )
  })
})
