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
import ClaudeIcon from '@lobehub/icons/es/Claude/components/Color'
import CodexIcon from '@lobehub/icons/es/Codex/components/Color'
import GeminiIcon from '@lobehub/icons/es/Gemini/components/Color'
import { Link } from '@tanstack/react-router'
import { Waypoints } from 'lucide-react'
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

function ModelFamilyStrip() {
  const { t } = useTranslation()

  return (
    <ul
      className='auth-model-rail mt-8 grid grid-cols-4 border-y border-white/15'
      aria-label={t('Models')}
    >
      <li className='auth-model-family-item flex h-16 min-w-0 items-center justify-center gap-2 border-r border-white/10 px-2'>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-white/[0.04]'>
          <ClaudeIcon size={19} aria-hidden='true' />
        </span>
        <span className='min-w-0 text-[12px] font-semibold text-white/78'>
          Claude
        </span>
      </li>
      <li className='auth-model-family-item flex h-16 min-w-0 items-center justify-center gap-2 border-r border-white/10 px-2'>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-white/[0.04] text-white'>
          <CodexIcon size={19} aria-hidden='true' />
        </span>
        <span className='min-w-0 text-[12px] font-semibold text-white/78'>
          Codex
        </span>
      </li>
      <li className='auth-model-family-item flex h-16 min-w-0 items-center justify-center gap-2 border-r border-white/10 px-2'>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-white/[0.04]'>
          <GeminiIcon size={19} aria-hidden='true' />
        </span>
        <span className='min-w-0 text-[12px] font-semibold text-white/78'>
          Gemini
        </span>
      </li>
      <li className='auth-model-family-item flex h-16 min-w-0 items-center justify-center gap-2 px-2'>
        <Waypoints
          className='text-home-purple size-5 shrink-0'
          strokeWidth={1.5}
          aria-hidden='true'
        />
        <span className='flex min-w-0 flex-col leading-none'>
          <span className='text-[13px] font-bold text-white/82'>40+</span>
          <span className='mt-1 text-[9px] text-white/45'>{t('Models')}</span>
        </span>
      </li>
    </ul>
  )
}

function BrandMark({
  className,
  showName = true,
}: {
  className?: string
  showName?: boolean
}) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <Link
      to='/'
      aria-label={showName ? undefined : systemName}
      className={cn(
        'group flex max-w-full min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80',
        className
      )}
    >
      <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-[8px] ring-1 ring-black/10 dark:ring-white/15'>
        {loading ? (
          <Skeleton className='absolute inset-0 rounded-[8px]' />
        ) : (
          <img src={logo} alt={t('Logo')} className='h-9 w-9 object-cover' />
        )}
      </div>
      {showName &&
        (loading ? (
          <Skeleton className='h-5 w-24' />
        ) : (
          <span className='min-w-0 text-[15px] font-semibold break-words'>
            {systemName}
          </span>
        ))}
    </Link>
  )
}

export function AuthLayout({
  children,
  showMobileBrandMark = true,
}: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const { status } = useStatus()

  const config = useMemo(
    () => parseLoginPageConfig(status?.login_page_config),
    [status?.login_page_config]
  )

  const configuredTitle = (config.title ?? '').trim()
  const normalizedSystemName = systemName.trim()
  const hasDistinctConfiguredTitle =
    configuredTitle.length > 0 &&
    configuredTitle.localeCompare(normalizedSystemName, undefined, {
      sensitivity: 'accent',
    }) !== 0
  const heroTitle = hasDistinctConfiguredTitle
    ? configuredTitle
    : t('AI Development Tools Gateway')
  const heroDescription =
    config.description ||
    t(
      'Integrate Claude Code, Codex CLI, Gemini CLI and more AI coding assistants'
    )
  const stats = config.stats ?? []
  const hasBackground = Boolean(config.background_image)

  return (
    <div
      data-auth-surface='gateway'
      className='bg-background min-h-svh lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(460px,0.92fr)]'
    >
      {/* Brand panel (desktop only) */}
      <div className='relative hidden min-h-svh overflow-hidden bg-[#0e0e0e] text-white lg:grid lg:grid-rows-[auto_1fr] lg:p-9 xl:p-11'>
        {hasBackground && (
          <img
            src={config.background_image}
            alt=''
            aria-hidden='true'
            className='absolute inset-0 h-full w-full object-cover opacity-75'
          />
        )}
        <div
          aria-hidden='true'
          className={cn(
            'absolute inset-0',
            hasBackground
              ? 'bg-[linear-gradient(140deg,rgba(14,14,14,0.94)_0%,rgba(14,14,14,0.66)_52%,rgba(14,14,14,0.96)_100%)]'
              : 'bg-[#0e0e0e]'
          )}
        />
        <div
          aria-hidden='true'
          className='auth-dot-grid pointer-events-none absolute inset-0 opacity-80'
        />
        <div
          aria-hidden='true'
          className='auth-editorial-scan pointer-events-none absolute inset-y-0'
        />
        <BrandMark
          className='auth-brand-enter relative z-20 w-fit'
          showName={false}
        />

        <div className='auth-brand-copy relative z-20 flex max-w-[640px] min-w-0 flex-col justify-center py-12'>
          <div className='min-w-0'>
            <div className='mb-6 flex items-center gap-2' aria-hidden='true'>
              <span className='bg-home-lime h-[3px] w-12 shrink-0' />
              <span className='bg-home-purple size-[3px]' />
              <span className='bg-home-lime size-[3px]' />
            </div>
            <h2 className='max-w-[620px] min-w-0 text-5xl leading-[0.98] font-black break-words xl:text-6xl'>
              {heroTitle}
            </h2>
            <p className='mt-6 max-w-lg min-w-0 text-[16px] leading-7 break-words text-white/62'>
              {heroDescription}
            </p>
          </div>

          <ModelFamilyStrip />

          {stats.length > 0 && (
            <div className='mt-7 flex flex-wrap gap-x-8 gap-y-4'>
              {stats.map((stat) => (
                <div
                  key={`${stat.value}|${stat.label}`}
                  className='flex max-w-full min-w-0 flex-col'
                >
                  <span className='text-home-lime min-w-0 text-2xl font-black break-words'>
                    {stat.value}
                  </span>
                  {stat.label && (
                    <span className='mt-1 min-w-0 text-[11px] break-words text-white/55 uppercase'>
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
      <div className='bg-background relative flex min-h-svh flex-col overflow-x-clip'>
        <div
          aria-hidden='true'
          className='auth-form-grid pointer-events-none absolute inset-0'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute top-7 right-7 hidden items-center gap-2 sm:flex'
        >
          <span className='bg-home-purple size-1.5' />
          <span className='bg-home-lime size-1.5' />
          <span className='bg-home-purple size-1.5' />
        </div>
        <div
          aria-hidden='true'
          className='border-border/60 pointer-events-none absolute right-0 bottom-[15%] hidden h-24 w-[28%] border-t border-l sm:block'
        >
          <span className='bg-background border-primary absolute top-[-4px] left-[-4px] size-[7px] border' />
        </div>
        {showMobileBrandMark && (
          <div className='relative z-10 p-5 sm:p-7 lg:hidden'>
            <BrandMark className='w-fit' />
          </div>
        )}
        <div className='relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:px-8 sm:py-12 lg:px-12'>
          <div className='w-full max-w-[420px]'>{children}</div>
        </div>
      </div>
    </div>
  )
}
