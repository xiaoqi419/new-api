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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

const tabClassName =
  'relative flex min-w-0 items-center justify-center border-b border-transparent text-sm font-semibold transition-colors'
const activeTabClassName =
  'text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary'

/**
 * Segmented switch between the two auth pages. They stay separate routes, so this
 * navigates rather than swapping forms in place.
 */
export function AuthTabs({
  active,
  className,
}: {
  active: 'sign-in' | 'sign-up'
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'border-border/70 grid h-[39px] grid-cols-2 border-b',
        className
      )}
    >
      <Link
        to='/sign-in'
        className={cn(
          tabClassName,
          active === 'sign-in'
            ? activeTabClassName
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {t('Sign in')}
      </Link>
      <Link
        to='/sign-up'
        className={cn(
          tabClassName,
          active === 'sign-up'
            ? activeTabClassName
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {t('Sign up')}
      </Link>
    </div>
  )
}
