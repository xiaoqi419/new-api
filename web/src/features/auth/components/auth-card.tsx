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

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

/**
 * Sign-in / sign-up card. Control sizes below are the reference layout scaled to
 * our 346px card content width (input 0.112, submit 0.120, tab strip 0.111,
 * radius 0.027); Input and Button ship at dashboard density, which reads far too
 * tight on a page that holds nothing else.
 */
export const authInputClassName =
  'h-[39px] rounded-[9px] bg-muted px-[15px] text-[15px] md:text-[15px]'
export const authSubmitClassName =
  'h-[42px] w-full justify-center gap-2 rounded-[9px] text-[16px] font-bold'
export const authSecondaryButtonClassName =
  'h-[39px] justify-center gap-[7px] rounded-[9px] text-[13px] font-semibold'

export function AuthDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className='text-muted-foreground my-[20px] flex items-center gap-3 text-[13px]'>
      <span className='bg-border h-px flex-1' />
      {children}
      <span className='bg-border h-px flex-1' />
    </div>
  )
}

export function AuthCard({
  children,
  title,
  description,
  className,
  showBrand = true,
}: {
  children: React.ReactNode
  /** Pages without the sign-in/sign-up tab strip name themselves here instead. */
  title?: React.ReactNode
  description?: React.ReactNode
  className?: string
  /** Login-specific layouts can carry the single visible brand outside the card. */
  showBrand?: boolean
}) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div
      className={cn(
        'bg-card rounded-[20px] border px-[26px] py-[30px] shadow-[0_18px_44px_-20px_rgba(90,20,60,0.22),0_3px_10px_-4px_rgba(90,20,60,0.10)]',
        className
      )}
    >
      {showBrand && (
        <Link
          to='/'
          className='mb-[26px] flex min-w-0 items-center justify-center gap-[10px] transition-opacity hover:opacity-80'
        >
          {loading ? (
            <Skeleton className='h-[34px] w-[34px] shrink-0 rounded-full' />
          ) : (
            <img
              src={logo}
              alt={t('Logo')}
              className='h-[34px] w-[34px] shrink-0 rounded-full object-cover'
            />
          )}
          {loading ? (
            <Skeleton className='h-7 w-32' />
          ) : (
            <h1 className='min-w-0 bg-gradient-to-r from-(--brand-wordmark-from) via-(--brand-wordmark-via) to-(--brand-wordmark-to) bg-clip-text text-center text-[26px] font-extrabold break-words text-transparent'>
              {systemName}
            </h1>
          )}
        </Link>
      )}

      {(title || description) && (
        <div className='mb-[22px] space-y-1.5 text-center'>
          {title && showBrand && (
            <h2 className='text-xl font-semibold tracking-tight'>{title}</h2>
          )}
          {title && !showBrand && (
            <h1 className='min-w-0 text-xl font-semibold break-words'>
              {title}
            </h1>
          )}
          {description && (
            <p className='text-muted-foreground min-w-0 text-sm leading-relaxed break-words'>
              {description}
            </p>
          )}
        </div>
      )}

      {children}
    </div>
  )
}
