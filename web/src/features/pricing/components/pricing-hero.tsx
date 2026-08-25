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
import { useTranslation } from 'react-i18next'

import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_SYSTEM_NAME } from '@/lib/constants'

import { SearchBar } from './search-bar'

export interface PricingHeroProps {
  modelCount?: number
  searchValue: string
  onSearchChange: (value: string) => void
  onClearSearch: () => void
}

function DecorationCard(props: {
  frameClassName: string
  cardClassName: string
  label: string
  labelTop: string
  systemName: string
}) {
  return (
    <div
      aria-hidden='true'
      data-pricing-decoration-frame
      className={`absolute flex items-center justify-center ${props.frameClassName}`}
    >
      <div
        data-pricing-decoration-card
        className={`motion-safe:animate-in motion-safe:fade-in-0 relative flex-none rounded-[24px] text-[#0e0e0e] shadow-[0_20px_38px_rgba(0,0,0,0.28)] motion-safe:duration-700 motion-safe:ease-out motion-reduce:animate-none ${props.cardClassName}`}
      >
        <div
          data-testid='pricing-decoration-brand'
          className='absolute top-7 right-[100px] left-[30px] truncate text-[26px] leading-[29px] font-bold'
        >
          {props.systemName}
        </div>
        <span
          data-testid='pricing-decoration-attribution'
          className='absolute top-[58px] left-[30px] text-[11px] leading-3 font-semibold tracking-wide text-black/55'
        >
          New API
        </span>
        <span className='absolute top-7 right-[34px] h-9 w-12 rounded-lg bg-[linear-gradient(143.13010235415598deg,#f7f7f7_0%,#cfcfcf_50%)]' />
        <div className='absolute top-[78px] left-[30px] text-[26px] leading-[29px] font-bold'>
          )))
        </div>
        <div
          className={`absolute left-[30px] text-[15px] leading-[17px] font-semibold ${props.labelTop}`}
        >
          {props.label}
        </div>
      </div>
    </div>
  )
}

export function PricingHero(props: PricingHeroProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const cardBrand = systemName?.trim() || DEFAULT_SYSTEM_NAME

  return (
    <section
      data-pricing-hero
      className='relative h-[678px] overflow-hidden rounded-b-[48px] bg-[#f1f1f1] text-[#050505] shadow-[0_24px_50px_rgba(0,0,0,0.18)] sm:h-[710px] sm:rounded-b-[64px] xl:h-[740px] xl:rounded-b-[82px] dark:bg-[#0e0e0e] dark:text-white'
    >
      <img
        src='/assets/pricing-figma/contours-light.svg'
        alt=''
        aria-hidden='true'
        className='pointer-events-none absolute top-[56px] left-1/2 hidden h-[684px] w-[1393px] max-w-none -translate-x-1/2 opacity-80 lg:block dark:hidden'
      />
      <img
        src='/assets/pricing-figma/contours-dark.svg'
        alt=''
        aria-hidden='true'
        className='pointer-events-none absolute top-[56px] left-1/2 hidden h-[684px] w-[1393px] max-w-none -translate-x-1/2 opacity-80 dark:lg:block'
      />

      <div className='relative mx-auto h-full max-w-[1229px] px-5 pt-28 sm:px-8 sm:pt-32 xl:px-0 xl:pt-36'>
        <div className='relative z-10 max-w-[560px]'>
          <span className='inline-flex h-[34px] items-center rounded-full border border-black/10 bg-white/50 px-5 text-xs font-semibold text-[#2f00e5] dark:border-white/15 dark:bg-white/10 dark:text-[#a99cff]'>
            {t('Model Square')}
          </span>
          <h1 className='mt-5 text-[42px] leading-[1.04] font-black sm:text-[56px] xl:text-[68px] xl:leading-[72px]'>
            <span className='block'>{t('Filter clearly, compare')}</span>
            <span className='block'>{t('and choose AI models')}</span>
          </h1>
          <p
            data-pricing-description
            className='mt-5 min-h-[56px] max-w-[520px] text-base leading-7 text-[#626262] xl:mt-[26px] xl:min-h-[58px] xl:text-[19px] xl:leading-[29px] dark:text-[#a8a8a8]'
          >
            {props.modelCount == null
              ? t('Loading...')
              : t(
                  'This site currently has {{count}} models enabled. Explore featured AI models, compare prices and capabilities, and choose the right model for each scenario.',
                  {
                    count: props.modelCount,
                  }
                )}
          </p>
          <div
            data-testid='pricing-hero-search'
            className='mt-9 w-full max-w-[545px] xl:mt-[60px]'
          >
            <SearchBar
              value={props.searchValue}
              onChange={props.onSearchChange}
              onClear={props.onClearSearch}
              placeholder={t(
                'Search model name, provider, endpoint, or tag...'
              )}
              className='w-full'
            />
          </div>
        </div>

        <div
          aria-hidden='true'
          data-pricing-decoration-stage
          className='pointer-events-none absolute hidden h-[596px] w-[980px] origin-bottom-right min-[1720px]:!top-[318px] min-[1720px]:!right-[-235px] min-[1720px]:!scale-100 lg:top-[92px] lg:right-0 lg:block lg:scale-[0.62] xl:top-[211px] xl:right-[-25px] xl:scale-[0.82]'
        >
          <DecorationCard
            label={t('Transparent Billing')}
            labelTop='top-[146px]'
            frameClassName='top-[16px] left-[263.02px] z-10 h-[510.215px] w-[362.919px]'
            cardClassName='h-[473.067px] w-[300px] -rotate-[8deg] bg-[linear-gradient(122.38121533446842deg,#fff195_0%,#ffc4ab_29%,#fff6ec_50%)]'
            systemName={cardBrand}
          />
          <DecorationCard
            label={t('OpenAI · Claude · Gemini')}
            labelTop='top-[170px]'
            frameClassName='top-0 left-[389.79px] z-30 h-[569.076px] w-[407.894px]'
            cardClassName='h-[523.903px] w-[330px] rotate-[9deg] bg-[linear-gradient(122.20633430499932deg,#fff1d0_0%,#ff4e93_22.5%,#7c4dff_50%)]'
            systemName={cardBrand}
          />
          <DecorationCard
            label={t('Intelligent Routing')}
            labelTop='top-[138px]'
            frameClassName='top-[102px] left-[603.02px] z-20 h-[494.422px] w-[377.04px]'
            cardClassName='h-[441.629px] w-[285px] rotate-[13deg] bg-[linear-gradient(147.16433007803062deg,#2bffd0_10.299%,#dbfff4_40.299%,#f0ff4a_60.299%)]'
            systemName={cardBrand}
          />
        </div>
      </div>
    </section>
  )
}
