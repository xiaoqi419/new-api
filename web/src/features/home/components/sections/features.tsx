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

import { AnimateInView } from '@/components/animate-in-view'
import { DollarSign, Gauge, HeartHandshake, Users } from '@/components/icons'

import { getFeatureIcon } from '../../lib/icon-mapper'
import type { FeaturesContent } from '../../types'

interface FeaturesProps {
  className?: string
  content?: Partial<FeaturesContent>
}

function FeatureVisual({
  kind,
}: {
  kind: 'providers' | 'security' | 'coverage' | 'developer'
}) {
  const { t } = useTranslation()
  if (kind === 'providers') {
    return (
      <div className='mt-8 flex flex-wrap gap-2 rounded-[33px] bg-white p-2 min-[1272px]:absolute min-[1272px]:top-[154px] min-[1272px]:left-[calc(50%-3px)] min-[1272px]:mt-0 min-[1272px]:w-max min-[1272px]:-translate-x-1/2 min-[1272px]:flex-nowrap dark:bg-[#1c1c1c]'>
        {['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'Qwen', 'Llama'].map(
          (provider) => (
            <span
              key={provider}
              className='shrink-0 rounded-[18px] bg-[#f6f6f4] px-[18px] py-2 text-[12px] leading-[13px] font-medium whitespace-nowrap text-[#6b6b6b] dark:bg-[#292929] dark:text-[#b8b8b8]'
            >
              {provider}
            </span>
          )
        )}
      </div>
    )
  }
  if (kind === 'security') {
    return (
      <div className='mt-5 flex h-[76px] items-center justify-end pr-5 min-[1272px]:absolute min-[1272px]:top-[120px] min-[1272px]:left-[434px] min-[1272px]:mt-0 min-[1272px]:block min-[1272px]:size-[76px] min-[1272px]:p-0'>
        <div className='relative size-[76px]'>
          <img
            aria-hidden
            alt=''
            className='size-[76px] dark:hidden'
            src='/assets/home-figma/light/asset-13.svg'
          />
          <img
            aria-hidden
            alt=''
            className='hidden size-[76px] dark:block'
            src='/assets/home-figma/dark/asset-10.svg'
          />
          <img
            aria-hidden
            alt=''
            className='absolute top-[22px] left-[22px] size-8 dark:hidden'
            src='/assets/home-figma/light/asset-01.svg'
          />
          <img
            aria-hidden
            alt=''
            className='absolute top-[22px] left-[22px] hidden size-8 dark:block'
            src='/assets/home-figma/dark/asset-01.svg'
          />
          <img
            aria-hidden
            alt=''
            className='absolute top-px left-[59px] h-[14px] w-[17px] dark:hidden'
            src='/assets/home-figma/light/asset-07.svg'
          />
          <img
            aria-hidden
            alt=''
            className='absolute top-px left-[59px] hidden h-[14px] w-[17px] dark:block'
            src='/assets/home-figma/dark/asset-02.svg'
          />
        </div>
      </div>
    )
  }
  if (kind === 'coverage') {
    return (
      <div className='mt-5 space-y-2.5 min-[1272px]:absolute min-[1272px]:top-[121px] min-[1272px]:left-[34px] min-[1272px]:mt-0 min-[1272px]:w-[480px]'>
        {[t('Load Balancing'), t('Rate Limiting'), t('Cost Tracking')].map(
          (label, index) => (
            <div key={label} className='flex items-center min-[1272px]:w-full'>
              <span
                className={`mr-3 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] leading-3 font-bold min-[1272px]:mr-[120px] ${index === 1 ? 'bg-[#d4ff1f] text-[#0e0e0e]' : 'bg-[#ecece8] text-[#6b6b6b] dark:bg-[#292929] dark:text-[#b8b8b8]'}`}
              >
                {index + 1}
              </span>
              <span
                className={`h-2 flex-1 rounded-full min-[1272px]:w-[270px] min-[1272px]:flex-none ${index === 1 ? 'bg-[#d4ff1f]/90' : 'bg-[#e0e0db]/65 dark:bg-[#3a3a3a]'}`}
              />
              <span className='ml-3 w-[70px] text-xs leading-[14px] text-[#6b6b6b] min-[1272px]:ml-[14px] min-[1272px]:w-auto min-[1272px]:whitespace-nowrap dark:text-[#b8b8b8]'>
                {label}
              </span>
            </div>
          )
        )}
      </div>
    )
  }
  return (
    <div className='mt-6 flex flex-wrap gap-2 rounded-[30px] bg-white p-2 min-[1272px]:absolute min-[1272px]:top-[144px] min-[1272px]:left-[34px] min-[1272px]:mt-0 min-[1272px]:w-max min-[1272px]:flex-nowrap dark:bg-[#1c1c1c]'>
      {['API', 'SDK', 'CLI', 'Docs'].map((tag) => (
        <span
          key={tag}
          className='flex h-[25px] w-[50px] shrink-0 items-center justify-center rounded-[44px] bg-[#f6f6f4] px-[10px] py-[6px] text-[12px] leading-[13px] font-semibold text-[#6b6b6b] dark:bg-[#292929] dark:text-[#b8b8b8]'
        >
          {tag}
        </span>
      ))}
      <span className='h-[25px] shrink-0 rounded-[14px] bg-[#d4ff1f]/20 px-[10px] py-[6px] text-[12px] leading-[13px] font-semibold whitespace-nowrap text-[#0e0e0e] dark:text-white'>
        {t('Multi-protocol Compatible')}
      </span>
    </div>
  )
}

export function Features(props: FeaturesProps) {
  const { t } = useTranslation()
  const content = props.content
  const defaults = [
    {
      num: '01',
      title: t('Lightning Fast'),
      desc: t(
        'Optimized network architecture ensures millisecond response times'
      ),
      kind: 'providers' as const,
    },
    {
      num: '02',
      title: t('Secure & Reliable'),
      desc: t(
        'Enterprise-grade security with comprehensive permission management'
      ),
      kind: 'security' as const,
    },
    {
      num: '03',
      title: t('Global Coverage'),
      desc: t('Multi-region deployment for stable global access'),
      kind: 'coverage' as const,
    },
    {
      num: '04',
      title: t('Developer Friendly'),
      desc: t('Compatible API routes for common AI application workflows'),
      kind: 'developer' as const,
    },
  ]
  const bentoCards = defaults.map((item, index) => ({
    ...item,
    title: content?.bento?.[index]?.title ?? item.title,
    desc: content?.bento?.[index]?.desc ?? item.desc,
  }))
  const additionalFeatures = content?.additional
    ? content.additional.map((item) => ({
        icon: getFeatureIcon(item.icon, 'size-5'),
        title: item.title,
        desc: item.desc,
      }))
    : [
        {
          icon: <Gauge className='size-5' strokeWidth={1.5} />,
          title: t('High Performance'),
          desc: t('Support for high concurrency with automatic load balancing'),
        },
        {
          icon: <DollarSign className='size-5' strokeWidth={1.5} />,
          title: t('Transparent Billing'),
          desc: t('Pay-as-you-go with real-time usage monitoring'),
        },
        {
          icon: <Users className='size-5' strokeWidth={1.5} />,
          title: t('Team Collaboration'),
          desc: t('Multi-user management with flexible permission allocation'),
        },
        {
          icon: <HeartHandshake className='size-5' strokeWidth={1.5} />,
          title: t('Open Source'),
          desc: t('Community driven, self-hosted, and extensible'),
        },
      ]

  return (
    <section
      className={`relative z-10 bg-white px-6 py-24 text-[#0e0e0e] min-[1272px]:pt-0 min-[1272px]:pb-[100px] dark:bg-[#1f1f1f] dark:text-white ${props.className ?? ''}`}
    >
      <div className='relative mx-auto max-w-[1248px] min-[1272px]:h-[770px]'>
        <p
          aria-hidden
          className='pointer-events-none absolute top-0 left-0 z-0 h-[210px] w-[360px] overflow-hidden text-[206px] leading-[206px] font-black text-[#e8e8e0] opacity-36 dark:text-[rgba(71,69,69,0.72)]'
        >
          01
        </p>
        <AnimateInView className='relative z-10 mb-[68px] pl-0 min-[1272px]:absolute min-[1272px]:top-[105px] min-[1272px]:left-[58px] min-[1272px]:mb-0 min-[1272px]:w-[430px] min-[1272px]:p-0'>
          <p className='mb-2 text-[15px] leading-[17px] font-medium text-[#6b6b6b] min-[1272px]:mb-[6px] min-[1272px]:h-[22px] dark:text-[#a0a0a0]'>
            {content?.eyebrow ?? t('Core Features')}
          </p>
          <h2 className='text-[clamp(2rem,4vw,3rem)] leading-[1.06] font-black tracking-normal min-[1272px]:h-[110px] min-[1272px]:w-[430px] min-[1272px]:text-[48px] min-[1272px]:leading-[51px]'>
            {content?.headingLine1 ?? t('Built for developers,')}
            <br />
            {content?.headingLine2 ?? t('designed for scale')}
          </h2>
        </AnimateInView>
        <div className='mx-auto grid max-w-[1196px] overflow-hidden rounded-[34px] border border-white/[0.9] bg-white/[0.62] shadow-[0_18px_36px_rgba(0,0,0,0.06)] min-[1272px]:absolute min-[1272px]:top-[300px] min-[1272px]:left-1/2 min-[1272px]:h-[470px] min-[1272px]:w-[1196px] min-[1272px]:max-w-none min-[1272px]:-translate-x-1/2 min-[1272px]:grid-cols-[repeat(2,598px)] min-[1272px]:grid-rows-[repeat(2,235px)] dark:border-white/[0.08] dark:bg-[#303030] dark:shadow-[0_18px_36px_rgba(0,0,0,0.24)]'>
          {bentoCards.map((card, index) => {
            const desktopCardPosition = [
              'min-[1272px]:top-[-1px] min-[1272px]:left-[-1px]',
              'min-[1272px]:top-[-1px] min-[1272px]:left-[597px]',
              'min-[1272px]:top-[234px] min-[1272px]:left-[-1px]',
              'min-[1272px]:top-[234px] min-[1272px]:left-[597px]',
            ][index]
            return (
              <AnimateInView
                key={card.num}
                delay={index * 80}
                animation='fade-up'
                className={`relative z-0 h-auto min-h-0 overflow-hidden p-7 ring-1 ring-transparent transition-[box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:z-10 hover:shadow-[0_10px_30px_rgba(17,17,17,0.14)] hover:ring-black/[0.10] motion-reduce:transition-none min-[1272px]:absolute min-[1272px]:h-[235px] min-[1272px]:w-[598px] min-[1272px]:p-0 dark:hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)] dark:hover:ring-white/[0.14] ${desktopCardPosition} ${index === 1 ? 'bg-white dark:bg-[#292929]' : 'bg-transparent dark:bg-[#242424]'}`}
              >
                <div className='mb-2 text-[15px] leading-[17px] font-bold text-[#b8b8b8] min-[1272px]:absolute min-[1272px]:top-[24px] min-[1272px]:left-[34px] min-[1272px]:mb-0 dark:text-[#777]'>
                  {index === 1 ? (
                    <span className='text-[#d4ff1f]'>{card.num}</span>
                  ) : (
                    card.num
                  )}
                </div>
                <h3 className='text-[22px] leading-6 font-bold min-[1272px]:absolute min-[1272px]:top-[48px] min-[1272px]:left-[34px] min-[1272px]:w-[530px]'>
                  {card.title}
                </h3>
                <p className='mt-2 max-w-[520px] text-[15px] leading-[22px] text-[#6b6b6b] min-[1272px]:absolute min-[1272px]:top-[82px] min-[1272px]:left-[34px] min-[1272px]:mt-0 min-[1272px]:w-[530px] min-[1272px]:max-w-none dark:text-[#b8b8b8]'>
                  {card.desc}
                </p>
                <FeatureVisual kind={card.kind} />
              </AnimateInView>
            )
          })}
        </div>
      </div>
      <div className='mx-auto max-w-[1248px]'>
        <div className='mx-auto mt-10 grid max-w-[1040px] grid-cols-2 gap-4 md:mt-[100px] md:grid-cols-[repeat(4,minmax(0,230px))] md:gap-10'>
          {additionalFeatures.map((feature, index) => (
            <AnimateInView
              key={feature.title}
              delay={index * 70}
              animation='fade-up'
              className='flex min-h-[162px] flex-col items-center rounded-[34px] bg-[#f3f3f3] p-5 text-center dark:bg-[#292929]'
            >
              <div className='flex size-[54px] items-center justify-center rounded-[27px] border border-[#e0e0db] bg-white/70 text-[#1f1f1f] dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-white'>
                {feature.icon}
              </div>
              <h3 className='mt-4 text-[18px] leading-5 font-bold'>
                {feature.title}
              </h3>
              <p className='mt-2 text-[13px] leading-[18px] text-[#6b6b6b] dark:text-[#b8b8b8]'>
                {feature.desc}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
