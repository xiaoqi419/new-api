/*
Copyright (C) 2023-2026 QuantumNous

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
import { useRouterState } from '@tanstack/react-router'

import { usePromoBanner } from '@/hooks/use-promo-banner'
import { cn } from '@/lib/utils'

import type { TopNavLink } from '../types'
import { PublicHeader, type PublicHeaderProps } from './public-header'

type PublicLayoutProps = {
  children: React.ReactNode
  showMainContainer?: boolean
  /** Opt a public page into the marketing/home shell without changing its route. */
  publicSurface?: 'home' | 'business'
  navContent?: React.ReactNode
  headerProps?: Omit<PublicHeaderProps, 'navContent'>
  navLinks?: TopNavLink[]
  showThemeSwitch?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  logo?: React.ReactNode
  siteName?: string
}

export function PublicLayout(props: PublicLayoutProps) {
  const { visible: promoVisible } = usePromoBanner()
  const pathname = useRouterState().location.pathname
  const publicSurface =
    props.publicSurface ?? (pathname === '/' ? 'home' : 'business')

  return (
    <div
      data-public-surface={publicSurface}
      className={cn(
        'public-layout bg-background text-foreground relative min-h-svh overflow-x-clip',
        // The header is fixed, so each page reserves room for it with its own
        // top padding. Padding the wrapper shifts every page down by the strip
        // height at once, including the many that opt out of `main`.
        promoVisible && 'pt-9'
      )}
    >
      <PublicHeader
        navContent={props.navContent}
        navLinks={props.navLinks}
        showThemeSwitch={props.showThemeSwitch}
        showAuthButtons={props.showAuthButtons}
        showNotifications={props.showNotifications}
        logo={props.logo}
        siteName={props.siteName}
        {...props.headerProps}
        visualSurface={publicSurface}
      />

      {props.showMainContainer !== false ? (
        <main className='container px-4 py-6 pt-20 md:px-4'>
          {props.children}
        </main>
      ) : (
        props.children
      )}
    </div>
  )
}
