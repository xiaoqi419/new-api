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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

import { parseLoginPageConfig } from './lib/login-page-config'

type AuthLayoutProps = {
  children: React.ReactNode
  /** Off for pages whose card already carries a centred brand mark. */
  showMobileBrandMark?: boolean
}

function BrandMark({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <Link
      to='/'
      className={cn(
        'flex items-center gap-2 transition-opacity hover:opacity-80',
        className
      )}
    >
      <div className='relative h-8 w-8'>
        {loading ? (
          <Skeleton className='absolute inset-0 rounded-full' />
        ) : (
          <img
            src={logo}
            alt={t('Logo')}
            className='h-8 w-8 rounded-full object-cover'
          />
        )}
      </div>
      {loading ? (
        <Skeleton className='h-6 w-24' />
      ) : (
        <span className='text-lg font-semibold'>{systemName}</span>
      )}
    </Link>
  )
}

export function AuthLayout({
  children,
  showMobileBrandMark = true,
}: AuthLayoutProps) {
  const { systemName } = useSystemConfig()
  const { status } = useStatus()

  const config = useMemo(
    () => parseLoginPageConfig(status?.login_page_config),
    [status?.login_page_config]
  )

  const heroTitle = config.title || systemName
  const stats = config.stats ?? []
  const hasBackground = Boolean(config.background_image)

  return (
    <div className='grid h-svh lg:grid-cols-2'>
      {/* Brand panel (desktop only) */}
      <div className='relative hidden overflow-hidden bg-neutral-900 text-white lg:flex lg:flex-col lg:justify-between lg:p-12'>
        {hasBackground && (
          <img
            src={config.background_image}
            alt=''
            aria-hidden='true'
            className='absolute inset-0 h-full w-full object-cover'
          />
        )}
        <div
          aria-hidden='true'
          className={cn(
            'absolute inset-0',
            hasBackground
              ? 'bg-gradient-to-t from-black/80 via-black/40 to-black/20'
              : 'bg-gradient-to-br from-neutral-800 via-neutral-900 to-black'
          )}
        />

        <BrandMark className='relative z-10 w-fit' />

        <div className='relative z-10 space-y-6'>
          <div className='space-y-3'>
            <h2 className='text-3xl font-semibold tracking-tight'>
              {heroTitle}
            </h2>
            {config.description && (
              <p className='max-w-md text-sm leading-relaxed text-white/70'>
                {config.description}
              </p>
            )}
          </div>

          {stats.length > 0 && (
            <div className='flex flex-wrap gap-x-10 gap-y-4'>
              {stats.map((stat) => (
                <div
                  key={`${stat.value}|${stat.label}`}
                  className='flex flex-col'
                >
                  <span className='text-2xl font-bold tracking-tight'>
                    {stat.value}
                  </span>
                  {stat.label && (
                    <span className='mt-0.5 text-xs text-white/60'>
                      {stat.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form panel */}
      <div className='relative flex flex-col'>
        {showMobileBrandMark && (
          <div className='p-4 sm:p-6 lg:hidden'>
            <BrandMark className='w-fit' />
          </div>
        )}
        <div className='flex flex-1 items-center justify-center px-4 py-12 sm:px-8'>
          <div className='w-full max-w-[400px]'>{children}</div>
        </div>
      </div>
    </div>
  )
}
