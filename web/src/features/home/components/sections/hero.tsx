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
import { CherryStudio } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ArrowRight, BookOpen } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'

import type { HeroAppItem, HeroContent } from '../../types'
import { HeroTerminalDemo } from '../hero-terminal-demo'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
  content?: Partial<HeroContent>
}

function AppChip({ app }: { app: HeroAppItem }) {
  return (
    <a
      href={app.url}
      target='_blank'
      rel='noopener noreferrer'
      className='flex min-w-0 items-center gap-2 rounded-full border border-black/[0.14] bg-black/[0.04] px-[18px] py-2 text-[13px] font-semibold text-[#050505] transition-colors duration-200 hover:bg-black/[0.08] dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]'
    >
      {app.iconUrl ? (
        <img
          src={app.iconUrl}
          alt={app.name}
          className='size-[15px] shrink-0 rounded object-contain'
          onError={(event) => {
            event.currentTarget.style.display = 'none'
            const fallback = event.currentTarget
              .nextSibling as HTMLElement | null
            if (fallback) fallback.style.display = 'flex'
          }}
        />
      ) : null}
      <span
        style={{ display: app.iconUrl ? 'none' : 'flex' }}
        className='flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[#d4ff1f] text-[8px] font-bold text-[#050505] dark:bg-white/20 dark:text-white'
      >
        {app.name.slice(0, 1)}
      </span>
      <span className='truncate'>{app.name}</span>
    </a>
  )
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const content = props.content
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'
  const docsButton = docsUrl.startsWith('http') ? (
    <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
  ) : (
    <Link to={docsUrl} />
  )

  return (
    <section
      className={`relative z-10 min-h-[760px] overflow-hidden rounded-b-[28px] bg-[#f3f3f1] px-6 pt-28 pb-14 text-[#050505] md:min-h-[897px] md:px-[54px] md:pt-[138px] md:pb-20 xl:h-[897px] xl:min-h-0 xl:rounded-none xl:bg-transparent xl:px-0 xl:pt-0 xl:pb-0 dark:bg-[#0e0e0e] dark:text-white xl:dark:bg-transparent ${props.className ?? ''}`}
    >
      <img
        aria-hidden
        src='/assets/home-figma/light/asset-12.svg'
        className='pointer-events-none absolute inset-0 h-full w-full object-cover xl:hidden dark:hidden'
      />
      <img
        aria-hidden
        src='/assets/home-figma/dark/asset-03.svg'
        className='pointer-events-none absolute inset-0 hidden h-full w-full object-cover xl:hidden dark:block xl:dark:hidden'
      />
      <img
        aria-hidden
        src='/assets/home-figma/light/asset-10.svg'
        className='pointer-events-none absolute inset-0 hidden h-[897px] w-full max-w-none xl:block dark:hidden'
        style={{ clipPath: 'inset(0 0 77px 0)' }}
      />
      <img
        aria-hidden
        src='/assets/home-figma/dark/asset-08.svg'
        className='pointer-events-none absolute inset-0 hidden h-[897px] w-full max-w-none xl:dark:block'
        style={{ clipPath: 'inset(0 0 77px 0)' }}
      />
      <div className='relative z-10 xl:mx-auto xl:h-[897px] xl:w-full xl:max-w-[1392px] xl:px-[54px] xl:pt-[138px]'>
        <img
          aria-hidden
          src='/assets/home-figma/light/asset-08.svg'
          className='pointer-events-none absolute top-[57px] left-0 hidden h-[739px] w-full max-w-none xl:block dark:hidden'
        />
        <img
          aria-hidden
          src='/assets/home-figma/dark/asset-09.svg'
          className='pointer-events-none absolute top-[57px] left-0 hidden h-[739px] w-full max-w-none xl:dark:block'
        />
        <div className='relative grid items-start lg:grid-cols-[minmax(0,590px)_402px] lg:justify-between'>
          <div className='max-w-[590px]'>
            <div
              className='landing-animate-fade-up mb-[26px] inline-flex items-center gap-2 rounded-[22px] border border-[#2f00e5]/25 bg-[#2f00e5]/10 px-4 py-[7px] text-[13px] leading-[14px] font-semibold text-[#2f00e5] dark:border-[#d4ff1f]/25 dark:bg-[#d4ff1f]/10 dark:text-[#d4ff1f]'
              style={{ animationDelay: '0ms' }}
            >
              <span className='size-[7px] rounded-full bg-current' />
              {content?.badge ?? t('AI Application Infrastructure Foundation')}
            </div>
            <h1
              className='landing-animate-fade-up text-[clamp(3rem,6vw,4.5rem)] leading-[1.06] font-black tracking-normal md:text-[72px] md:leading-[76px] lg:min-h-[228px] lg:w-[590px] lg:max-w-full'
              style={{ animationDelay: '120ms' }}
            >
              {content?.title ?? t('Unified API Gateway for')}
              <br />
              <span className='text-[#2f00e5] dark:text-[#d4ff1f]'>
                {content?.highlight ?? t('Vast Range of AI Models')}
              </span>
            </h1>
            <p
              className='landing-animate-fade-up mt-8 max-w-[575px] text-[17px] leading-[1.65] text-[#575757] lg:mt-[46px] lg:ml-[2px] lg:min-h-[70px] lg:text-[19px] lg:leading-[31px] dark:text-[#bcbcbc]'
              style={{ animationDelay: '240ms' }}
            >
              {content?.subtitle ??
                t(
                  'Access a vast selection of models via a standard, unified API protocol. Power AI applications, manage digital assets, and connect the Future.'
                )}
            </p>
            <div
              className='landing-animate-fade-up mt-9 flex flex-wrap items-center gap-3 lg:mt-[46px]'
              style={{ animationDelay: '360ms' }}
            >
              {props.isAuthenticated ? (
                <Button
                  className='h-12 rounded-full bg-[#050505] px-7 text-[15px] font-bold text-white hover:bg-[#2f00e5] lg:h-[50px] dark:bg-[#d4ff1f] dark:text-[#050505]'
                  render={<Link to='/workbench' />}
                >
                  {content?.goToDashboardLabel ?? t('Go to Dashboard')}
                  <ArrowRight className='ml-2 size-4' />
                </Button>
              ) : (
                <Button
                  className='h-12 rounded-full bg-[#050505] px-7 text-[15px] font-bold text-white hover:bg-[#2f00e5] lg:h-[50px] dark:bg-[#d4ff1f] dark:text-[#050505]'
                  render={<Link to='/sign-up' />}
                >
                  {content?.getStartedLabel ?? t('Get Started')}
                  <ArrowRight className='ml-2 size-4' />
                </Button>
              )}
              <Button
                variant='outline'
                className='h-12 rounded-full border-black/[0.16] bg-black/[0.04] px-6 text-[15px] font-semibold lg:h-[50px] dark:border-white/[0.16] dark:bg-white/[0.06]'
                render={docsButton}
              >
                <BookOpen className='mr-2 size-4' />
                {t('Docs')}
              </Button>
            </div>
            <div
              className='landing-animate-fade-up mt-12 lg:mt-[46px] lg:ml-[2px]'
              style={{ animationDelay: '480ms' }}
            >
              <p className='text-[14px] leading-6 text-[#575757] lg:leading-[23px] dark:text-[#a8a8a8]'>
                {content?.appsHeading ?? t('Supported Applications')}
              </p>
              <p className='max-w-[420px] text-[14px] leading-6 text-[#575757] lg:leading-[23px] dark:text-[#a8a8a8]'>
                {content?.appsSubheading ??
                  t(
                    'Supports one-click configuration and perfectly adapts to NewAPI multi-protocol configuration.'
                  )}
              </p>
              <div className='mt-4 flex flex-wrap gap-3 lg:mt-5 lg:gap-[14px]'>
                {content?.apps ? (
                  content.apps.map((app) => (
                    <AppChip key={app.name} app={app} />
                  ))
                ) : (
                  <>
                    <a
                      href='https://cherry-ai.com'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='flex min-w-0 items-center gap-2 rounded-full border border-black/[0.14] bg-black/[0.04] px-[18px] py-2 text-[13px] font-semibold text-[#050505] transition-colors duration-200 hover:bg-black/[0.08] dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]'
                    >
                      <CherryStudio.Color size={15} className='shrink-0' />
                      <span className='truncate'>Cherry Studio</span>
                    </a>
                    <AppChip
                      app={{
                        name: 'CC Switch',
                        url: 'https://ccswitch.io',
                      }}
                    />
                  </>
                )}
                <span className='flex shrink-0 items-center gap-2 rounded-full border border-black/[0.14] bg-black/[0.04] px-[18px] py-2 text-[13px] font-semibold text-[#050505] transition-[background-color,border-color,box-shadow,color] duration-200 hover:border-black/[0.28] hover:bg-black/[0.1] hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)] dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-white dark:hover:border-white/[0.28] dark:hover:bg-white/[0.12]'>
                  <span
                    aria-hidden
                    className='size-[15px] rounded-full bg-black/[0.18] dark:bg-white/[0.18]'
                  />
                  {content?.moreAppsLabel ?? t('More Apps')}
                </span>
              </div>
            </div>
          </div>
          <div
            className='landing-animate-fade-up relative flex min-h-[380px] items-start justify-center lg:translate-x-[6px] lg:pt-[14px]'
            style={{ animationDelay: '600ms' }}
          >
            <HeroTerminalDemo className='relative z-20 w-full' />
          </div>
        </div>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 z-20 hidden xl:block'
          style={{
            maskImage: "url('/assets/home-figma/light/asset-10.svg')",
            maskPosition: '-264px 0',
            maskRepeat: 'no-repeat',
            maskSize: '1920px 897px',
            WebkitMaskImage: "url('/assets/home-figma/light/asset-10.svg')",
            WebkitMaskPosition: '-264px 0',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskSize: '1920px 897px',
          }}
        >
          <div className='absolute top-[524px] left-[431px] z-10 flex h-[510.215px] w-[362.919px] items-center justify-center'>
            <div className='relative h-[473.067px] w-[300px] flex-none -rotate-[8deg] rounded-[24px] bg-[linear-gradient(122deg,#fff195_0%,#ffc4ab_29%,#fff6ec_50%)] px-[30px] pt-[28px] text-[#0e0e0e] shadow-[0_20px_38px_rgba(0,0,0,0.28)]'>
              <p className='h-[34px] text-[26px] leading-[29px] font-bold'>
                New API
              </p>
              <span className='absolute top-[28px] left-[218px] h-[36px] w-[48px] rounded-[8px] bg-gradient-to-br from-[#f7f7f7] to-[#cfcfcf]' />
              <p className='mt-[16px] h-[32px] text-[26px] leading-[29px] font-bold'>
                )))
              </p>
              <p className='absolute top-[146px] left-[30px] text-[15px] leading-[17px] font-semibold'>
                {t('Transparent Billing')}
              </p>
            </div>
          </div>
          <div className='absolute top-[508px] left-[557.772px] z-30 flex h-[569.076px] w-[407.894px] items-center justify-center'>
            <div className='relative h-[523.903px] w-[330px] flex-none rotate-[9deg] rounded-[24px] bg-[linear-gradient(122deg,#fff1d0_0%,#ff4e93_22.5%,#7c4dff_50%)] px-[30px] pt-[28px] text-[#0e0e0e] shadow-[0_20px_38px_rgba(0,0,0,0.28)]'>
              <p className='h-[34px] text-[26px] leading-[29px] font-bold'>
                New API
              </p>
              <span className='absolute top-[28px] left-[248px] h-[36px] w-[48px] rounded-[8px] bg-gradient-to-br from-[#f7f7f7] to-[#cfcfcf]' />
              <p className='mt-[16px] h-[32px] text-[26px] leading-[29px] font-bold'>
                )))
              </p>
              <p className='absolute top-[170px] left-[30px] text-[15px] leading-[17px] font-semibold'>
                OpenAI · Claude · Gemini
              </p>
            </div>
          </div>
          <div className='absolute top-[610px] left-[771px] z-20 flex h-[494.422px] w-[377.04px] items-center justify-center'>
            <div className='relative h-[441.629px] w-[285px] flex-none rotate-[13deg] rounded-[24px] bg-[linear-gradient(123deg,#2bffd0_0%,#dbfff4_30%,#f0ff4a_50%)] px-[30px] pt-[28px] text-[#0e0e0e] shadow-[0_20px_38px_rgba(0,0,0,0.28)]'>
              <p className='h-[34px] text-[26px] leading-[29px] font-bold'>
                New API
              </p>
              <span className='absolute top-[28px] left-[203px] h-[36px] w-[48px] rounded-[8px] bg-gradient-to-br from-[#f7f7f7] to-[#cfcfcf]' />
              <p className='mt-[16px] h-[32px] text-[26px] leading-[29px] font-bold'>
                )))
              </p>
              <p className='absolute top-[138px] left-[30px] text-[15px] leading-[17px] font-semibold'>
                {t('Model Access')}
              </p>
            </div>
          </div>
          <div className='absolute top-[745px] left-[627px] z-40 flex size-[138px] items-center justify-center rounded-full bg-[#0e0e0e] text-center text-[17px] leading-[19px] font-bold text-white shadow-[0_18px_32px_rgba(0,0,0,0.18)]'>
            <span className='flex size-[100px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#f5ff3b_0%,#fa72cf_50%,#49f4ff_100%)] p-[2px]'>
              <span className='flex size-full items-center justify-center rounded-full bg-[#0e0e0e]'>
                EXPLORE
                <br />
                MORE
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
