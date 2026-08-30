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
import { useEffect, useMemo, useRef, useState } from 'react'
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

const AUTH_TITLE_WORDS = [
  'design',
  'build',
  'integrate',
  'scale',
  'orchestrate',
] as const

const AUTH_VIDEO_SRC = '/assets/iconsax-sec1-new.mp4'

type AuthExperienceLayoutProps = {
  children: React.ReactNode
  page: 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password'
}

export function AuthExperienceLayout(props: AuthExperienceLayoutProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(min-width: 1024px)').matches === true
  )
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
  const [videoFailed, setVideoFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const config = useMemo(
    () => parseLoginPageConfig(status?.login_page_config),
    [status?.login_page_config]
  )
  const showVideo = isDesktop && !reducedMotion

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMediaPreferences = () => {
      setIsDesktop(desktopQuery.matches)
      setReducedMotion(motionQuery.matches)
    }

    syncMediaPreferences()
    desktopQuery.addEventListener?.('change', syncMediaPreferences)
    motionQuery.addEventListener?.('change', syncMediaPreferences)

    return () => {
      desktopQuery.removeEventListener?.('change', syncMediaPreferences)
      motionQuery.removeEventListener?.('change', syncMediaPreferences)
    }
  }, [])

  useEffect(() => {
    if (!showVideo) return

    const video = videoRef.current
    if (!video) return

    const startPlayback = () => {
      if (video.paused) {
        void video.play().catch(() => undefined)
      }
    }

    startPlayback()
    video.addEventListener('loadeddata', startPlayback)

    return () => {
      video.removeEventListener('loadeddata', startPlayback)
    }
  }, [showVideo])

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
          className='relative hidden min-w-0 flex-col overflow-hidden bg-neutral-950 p-10 lg:flex xl:p-12'
        >
          {config.background_image && (
            <img
              src={config.background_image}
              alt=''
              aria-hidden='true'
              className='absolute inset-0 h-full w-full object-cover opacity-25 grayscale'
            />
          )}
          {showVideo && (
            <video
              ref={videoRef}
              data-auth-media='video'
              aria-hidden='true'
              autoPlay
              loop
              muted
              playsInline
              preload='auto'
              poster={config.background_image || undefined}
              onError={() => setVideoFailed(true)}
              onCanPlay={() => setVideoFailed(false)}
              data-auth-media-state={videoFailed ? 'error' : 'ready'}
              className='absolute inset-0 h-full w-full object-cover opacity-75 saturate-[0.8]'
            >
              <source src={AUTH_VIDEO_SRC} type='video/mp4' />
            </video>
          )}
          <div
            aria-hidden='true'
            className='absolute inset-0 bg-[linear-gradient(115deg,rgba(7,8,11,0.76)_0%,rgba(7,8,11,0.44)_45%,rgba(7,8,11,0.72)_100%)]'
          />
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_34%)] opacity-80'
          />

          <AuthBrandMark className='relative z-10 w-fit text-white' />

          <div className='relative z-10 flex min-w-0 flex-1 flex-col justify-center py-10'>
            {!configuredTitle && (
              <style data-auth-motion-styles='title-ticker'>
                {`
                  @keyframes auth-title-ticker-word {
                    0%,
                    16% {
                      opacity: 1;
                      transform: translateY(0);
                    }

                    18%,
                    20% {
                      opacity: 0;
                      transform: translateY(-0.95em);
                    }

                    21%,
                    96% {
                      opacity: 0;
                      transform: translateY(0.95em);
                    }

                    100% {
                      opacity: 1;
                      transform: translateY(0);
                    }
                  }

                  .auth-title-ticker-word {
                    animation: auth-title-ticker-word 12s cubic-bezier(0.22, 1, 0.36, 1) infinite;
                  }

                  [data-auth-title-word='design'] {
                    animation-delay: 0s;
                  }

                  [data-auth-title-word='build'] {
                    animation-delay: -9.6s;
                  }

                  [data-auth-title-word='integrate'] {
                    animation-delay: -7.2s;
                  }

                  [data-auth-title-word='scale'] {
                    animation-delay: -4.8s;
                  }

                  [data-auth-title-word='orchestrate'] {
                    animation-delay: -2.4s;
                  }

                  @media (prefers-reduced-motion: reduce) {
                    .auth-title-ticker-word {
                      animation: none;
                      opacity: 0;
                      transform: translateY(0);
                    }

                    [data-auth-title-word='design'] {
                      opacity: 1;
                    }
                  }
                `}
              </style>
            )}
            <h2 className='max-w-full min-w-0 text-5xl leading-[0.98] font-semibold break-words'>
              {configuredTitle ? (
                configuredTitle
              ) : (
                <>
                  <span data-auth-title='accessible' className='sr-only'>
                    {t('Built for developers,')} {t('designed for scale')}
                  </span>
                  <span aria-hidden='true'>
                    {t('Built for developers,')}
                    <br />
                    <span className='text-primary inline-flex max-w-full min-w-0 flex-wrap items-baseline'>
                      <span className='max-w-full min-w-0 break-words'>
                        {t('designed for')}
                      </span>
                      <span className='ml-[0.28em] inline-grid h-[1em] max-w-full min-w-0 overflow-hidden align-bottom'>
                        {reducedMotion ? (
                          <span
                            data-auth-title='static-word'
                            className='inline-block h-[1em]'
                          >
                            {t('design')}
                          </span>
                        ) : (
                          <span
                            data-auth-title='ticker'
                            aria-hidden='true'
                            className='relative col-start-1 row-start-1 inline-grid h-[1em] max-w-full overflow-hidden align-bottom'
                          >
                            {AUTH_TITLE_WORDS.map((word) => (
                              <span
                                key={`size-${word}`}
                                aria-hidden='true'
                                className='invisible col-start-1 row-start-1 h-[1em] text-left whitespace-nowrap'
                              >
                                {t(word)}
                              </span>
                            ))}
                            {AUTH_TITLE_WORDS.map((word) => (
                              <span
                                key={word}
                                data-auth-title-word={word}
                                className='auth-title-ticker-word col-start-1 row-start-1 h-[1em] text-left whitespace-nowrap'
                              >
                                {t(word)}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                </>
              )}
            </h2>
            <p className='mt-6 max-w-[34rem] min-w-0 text-sm leading-6 break-words text-white/55 sm:text-[15px] sm:leading-7'>
              {description}
            </p>

            <div className='relative mt-8 min-w-0'>
              <style data-auth-motion-styles='model-connection'>
                {`
                  @keyframes auth-model-connection-flow {
                    from {
                      transform: translateX(-125%);
                    }

                    to {
                      transform: translateX(425%);
                    }
                  }

                  .auth-model-connection-track {
                    background: color-mix(in oklab, var(--primary) 36%, transparent);
                  }

                  .auth-model-connection-flow {
                    animation: auth-model-connection-flow 4.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                    background: linear-gradient(
                      90deg,
                      transparent,
                      color-mix(in oklab, var(--primary) 92%, transparent),
                      transparent
                    );
                  }

                  @media (prefers-reduced-motion: reduce) {
                    .auth-model-connection-flow {
                      animation: none;
                      opacity: 0.56;
                      transform: none;
                    }
                  }
                `}
              </style>
              <div
                data-auth-motion='model-connection'
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-3 bottom-3 z-20 h-px overflow-hidden'
              >
                <span className='auth-model-connection-track absolute inset-0' />
                <span className='auth-model-connection-flow absolute inset-y-0 left-0 w-[30%]' />
              </div>
              <ul
                className='relative z-10 grid grid-cols-4 overflow-hidden rounded-[6px] border border-white/10 bg-white/[0.02]'
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
                  <span className='text-xs font-semibold text-white/75'>
                    40+
                  </span>
                </li>
              </ul>
            </div>
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
            <div
              key={props.page}
              data-auth-transition='content'
              className='auth-route-content w-full max-w-[420px] min-w-0'
            >
              {props.children}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
