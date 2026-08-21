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
  'h-[39px] rounded-[8px] bg-muted px-[15px] text-[15px] md:text-[15px]'
export const authSubmitClassName =
  'h-[42px] w-full justify-center gap-2 rounded-[8px] text-[16px] font-bold'
export const authSecondaryButtonClassName =
  'h-[39px] justify-center gap-[7px] rounded-[8px] text-[13px] font-semibold'

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
}: {
  children: React.ReactNode
  /** Pages without the sign-in/sign-up tab strip name themselves here instead. */
  title?: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div
      className={cn(
        'auth-card-surface bg-card/[0.96] relative rounded-[8px] border border-border px-[26px] py-[30px] backdrop-blur-md sm:px-[30px] sm:py-[34px]',
        className
      )}
    >
      <span
        aria-hidden='true'
        className='absolute top-0 left-8 h-[3px] w-24 bg-[linear-gradient(90deg,var(--home-lime),var(--home-purple))]'
      />
      <span
        aria-hidden='true'
        className='bg-primary absolute top-4 right-4 size-1.5'
      />
      <Link
        to='/'
        className='mb-[28px] flex max-w-full min-w-0 items-center justify-center gap-[10px] transition-opacity hover:opacity-80'
      >
        {loading ? (
          <Skeleton className='h-[34px] w-[34px] rounded-[8px]' />
        ) : (
          <img
            src={logo}
            alt={t('Logo')}
            className='h-[34px] w-[34px] shrink-0 rounded-[8px] object-cover ring-1 ring-black/10 dark:ring-white/10'
          />
        )}
        {loading ? (
          <Skeleton className='h-7 w-32' />
        ) : (
          <h1 className='text-foreground min-w-0 text-center text-[25px] font-black break-words'>
            {systemName}
          </h1>
        )}
      </Link>

      {(title || description) && (
        <div className='mb-[22px] space-y-1.5 text-center'>
          {title && (
            <h2 className='min-w-0 text-xl font-semibold break-words'>
              {title}
            </h2>
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
