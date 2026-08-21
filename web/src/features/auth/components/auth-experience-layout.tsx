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
import ClaudeIcon from '@lobehub/icons/es/Claude/components/Color'
import CodexIcon from '@lobehub/icons/es/Codex/components/Color'
import GeminiIcon from '@lobehub/icons/es/Gemini/components/Color'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Sparkles } from '@/components/icons'
import { useStatus } from '@/hooks/use-status'

import { AuthBrandMark } from '../auth-layout'
import { parseLoginPageConfig } from '../lib/login-page-config'

const MODEL_FAMILIES = [
  { name: 'Claude', Icon: ClaudeIcon },
  { name: 'Codex', Icon: CodexIcon },
  { name: 'Gemini', Icon: GeminiIcon },
] as const

type AuthExperienceLayoutProps = {
  children: React.ReactNode
  page: 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password'
}

export function AuthExperienceLayout(props: AuthExperienceLayoutProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const config = useMemo(
    () => parseLoginPageConfig(status?.login_page_config),
    [status?.login_page_config]
  )

  const configuredTitle = config.title?.trim()
  const description =
    config.description ||
    t('Connect through OpenAI, Claude, Gemini, and other compatible API routes')
  const stats = config.stats ?? []
  let formLabel = t('Sign in')
  if (props.page === 'sign-up') {
    formLabel = t('Sign up')
  } else if (props.page === 'forgot-password') {
    formLabel = t('Forgot password')
  } else if (props.page === 'reset-password') {
    formLabel = t('Reset password')
  }

  return (
    <main
      data-auth-layout='experience'
      data-auth-page={props.page}
      className='dark relative flex min-h-svh min-w-0 items-center justify-center overflow-x-hidden bg-neutral-950 px-3 py-4 text-white [color-scheme:dark] sm:px-6 sm:py-8 lg:px-10 lg:py-10'
    >
      <div
        data-auth-decoration='dot-grid'
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_center,var(--border)_1px,transparent_1px)] [background-size:22px_22px] opacity-35'
      />

      <div
        data-auth-panel='experience'
        className='relative z-10 grid w-full max-w-[1120px] min-w-0 overflow-hidden rounded-[8px] border border-white/10 bg-neutral-950/95 shadow-[0_30px_100px_-44px_color-mix(in_oklab,var(--primary)_45%,transparent)] lg:min-h-[min(700px,calc(100svh-80px))] lg:grid-cols-[minmax(0,1.08fr)_minmax(400px,0.92fr)]'
      >
        <section
          data-auth-region='brand'
          aria-label={t('Brand')}
          className='relative hidden min-w-0 flex-col overflow-hidden p-10 lg:flex xl:p-12'
        >
          {config.background_image && (
            <img
              src={config.background_image}
              alt=''
              aria-hidden='true'
              className='absolute inset-0 h-full w-full object-cover opacity-20 grayscale'
            />
          )}
          <div
            aria-hidden='true'
            className='absolute inset-0 bg-neutral-950/80'
          />

          <AuthBrandMark className='relative z-10 w-fit text-white' />

          <div className='relative z-10 flex min-w-0 flex-1 flex-col justify-center py-10'>
            <h2 className='max-w-[13ch] min-w-0 text-5xl leading-[0.98] font-semibold break-words xl:text-6xl'>
              {configuredTitle ? (
                configuredTitle
              ) : (
                <>
                  {t('Built for developers,')}
                  <br />
                  <span className='text-primary'>
                    {t('designed for scale')}
                  </span>
                </>
              )}
            </h2>
            <p className='mt-6 max-w-[34rem] min-w-0 text-sm leading-6 break-words text-white/55 sm:text-[15px] sm:leading-7'>
              {description}
            </p>

            <ul
              className='mt-8 grid grid-cols-4 overflow-hidden rounded-[6px] border border-white/10 bg-white/[0.02]'
              aria-label={t('AI models supported')}
            >
              {MODEL_FAMILIES.map(({ name, Icon }) => (
                <li
                  key={name}
                  className='flex h-16 min-w-0 items-center justify-center gap-2 border-r border-white/10 px-2'
                >
                  <Icon size={19} aria-hidden='true' />
                  <span className='min-w-0 truncate text-xs font-medium text-white/75'>
                    {name}
                  </span>
                </li>
              ))}
              <li className='flex h-16 min-w-0 items-center justify-center gap-2 px-2'>
                <Sparkles
                  className='text-primary size-[18px] shrink-0'
                  aria-hidden='true'
                />
                <span className='text-xs font-semibold text-white/75'>40+</span>
              </li>
            </ul>
          </div>

          <footer className='relative z-10 flex min-w-0 flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-5'>
            <p className='min-w-0 text-xs leading-5 break-words text-white/45'>
              {t('Unified access platform for AI development tools')}
            </p>
            {stats.length > 0 && (
              <dl className='flex max-w-full min-w-0 flex-wrap gap-x-6 gap-y-3'>
                {stats.map((stat) => (
                  <div
                    key={`${stat.value}|${stat.label}`}
                    className='min-w-0 text-right'
                  >
                    <dt className='min-w-0 text-[10px] break-words text-white/40 uppercase'>
                      {stat.label}
                    </dt>
                    <dd className='min-w-0 text-sm font-semibold break-words text-white/75'>
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </footer>
        </section>

        <section
          data-auth-region='form'
          aria-label={formLabel}
          className='bg-background text-foreground flex min-h-[calc(100svh-2rem)] min-w-0 flex-col border-white/10 lg:min-h-0 lg:border-l'
        >
          <div className='p-5 sm:p-7 lg:hidden'>
            <AuthBrandMark className='w-fit' />
          </div>
          <div className='flex min-w-0 flex-1 items-center justify-center px-3 py-6 sm:px-8 sm:py-10 lg:px-10'>
            <div className='w-full max-w-[420px] min-w-0'>{props.children}</div>
          </div>
        </section>
      </div>
    </main>
  )
}
