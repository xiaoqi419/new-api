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
import {
  DollarSign,
  Gauge,
  HeartHandshake,
  Shield,
  Users,
} from '@/components/icons'

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
      <div className='mt-8 flex flex-wrap gap-2 rounded-[34px] bg-white p-2 dark:bg-[#1c1c1c]'>
        {['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'Qwen', 'Llama'].map(
          (provider) => (
            <span
              key={provider}
              className='rounded-[18px] bg-[#f6f6f4] px-[18px] py-2 text-[11px] font-medium text-[#6b6b6b] dark:bg-[#292929] dark:text-[#b8b8b8]'
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
      <div className='relative mt-5 flex h-[76px] items-center justify-end pr-5'>
        <div className='flex size-[76px] items-center justify-center rounded-full bg-[#d4ff1f]/30 text-[#2f00e5] dark:bg-[#2f00e5]/20'>
          <Shield className='size-8' strokeWidth={1.5} />
        </div>
        <span className='absolute top-0 right-4 text-2xl text-[#d4ff1f]'>
          ✦
        </span>
      </div>
    )
  }
  if (kind === 'coverage') {
    return (
      <div className='mt-5 space-y-2.5'>
        {[t('Load Balancing'), t('Rate Limiting'), t('Cost Tracking')].map(
          (label, index) => (
            <div key={label} className='flex items-center gap-3'>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${index === 1 ? 'bg-[#d4ff1f] text-[#0e0e0e]' : 'bg-[#ecece8] text-[#6b6b6b] dark:bg-[#292929] dark:text-[#b8b8b8]'}`}
              >
                {index + 1}
              </span>
              <span
                className={`h-2 flex-1 rounded-full ${index === 1 ? 'bg-[#d4ff1f]' : 'bg-[#e0e0db] dark:bg-[#3a3a3a]'}`}
              />
              <span className='w-[70px] text-xs text-[#6b6b6b] dark:text-[#b8b8b8]'>
                {label}
              </span>
            </div>
          )
        )}
      </div>
    )
  }
  return (
    <div className='mt-6 flex flex-wrap gap-2 rounded-[30px] bg-white p-2 dark:bg-[#1c1c1c]'>
      {['API', 'SDK', 'CLI', 'Docs'].map((tag) => (
        <span
          key={tag}
          className='rounded-[44px] bg-[#f6f6f4] px-3 py-1.5 text-xs font-semibold text-[#6b6b6b] dark:bg-[#292929] dark:text-[#b8b8b8]'
        >
          {tag}
        </span>
      ))}
      <span className='rounded-[14px] bg-[#d4ff1f]/20 px-3 py-1.5 text-xs font-semibold text-[#0e0e0e] dark:text-white'>
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
      className={`relative z-10 bg-white px-6 py-24 text-[#0e0e0e] md:pt-[75px] md:pb-[100px] dark:bg-[#1f1f1f] dark:text-white ${props.className ?? ''}`}
    >
      <div className='relative mx-auto max-w-[1248px] md:translate-x-[5px] dark:md:-translate-x-[21px]'>
        <p
          aria-hidden
          className='pointer-events-none absolute top-[-30px] left-0 h-[210px] w-[360px] overflow-hidden text-[206px] leading-[206px] font-black text-[#e8e8e0] opacity-36 dark:text-[rgba(71,69,69,0.72)]'
        >
          01
        </p>
        <AnimateInView className='mb-[68px] pl-0 md:pl-[58px]'>
          <p className='mb-2 text-[15px] leading-[17px] font-medium text-[#6b6b6b] dark:text-[#a0a0a0]'>
            {content?.eyebrow ?? t('Core Features')}
          </p>
          <h2 className='text-[clamp(2rem,4vw,3rem)] leading-[1.06] font-black tracking-normal md:w-[430px] md:text-[48px] md:leading-[51px]'>
            {content?.headingLine1 ?? t('Built for developers,')}
            <br />
            {content?.headingLine2 ?? t('designed for scale')}
          </h2>
        </AnimateInView>
        <div className='mx-auto grid max-w-[1196px] overflow-hidden rounded-[34px] border border-black/[0.08] bg-[#ecece8] shadow-[0_18px_36px_rgba(0,0,0,0.06)] md:mx-0 md:ml-[52px] md:h-[470px] md:grid-cols-2 md:grid-rows-[repeat(2,235px)] dark:border-white/[0.08] dark:bg-[#303030] dark:shadow-[0_18px_36px_rgba(0,0,0,0.24)]'>
          {bentoCards.map((card, index) => (
            <AnimateInView
              key={card.num}
              delay={index * 80}
              animation='fade-up'
              className={`h-auto min-h-0 overflow-hidden p-7 md:h-[235px] md:p-[34px] ${index === 1 ? 'bg-white dark:bg-[#292929]' : 'bg-[#fafaf8] dark:bg-[#242424]'}`}
            >
              <div className='mb-2 text-[15px] leading-[17px] font-bold text-[#b8b8b8] dark:text-[#777]'>
                {index === 1 ? (
                  <span className='text-[#d4ff1f]'>{card.num}</span>
                ) : (
                  card.num
                )}
              </div>
              <h3 className='text-[22px] leading-6 font-bold'>{card.title}</h3>
              <p className='mt-2 max-w-[520px] text-[15px] leading-[22px] text-[#6b6b6b] dark:text-[#b8b8b8]'>
                {card.desc}
              </p>
              <FeatureVisual kind={card.kind} />
            </AnimateInView>
          ))}
        </div>
        <div className='mx-auto mt-10 grid max-w-[1040px] grid-cols-2 gap-4 md:mx-0 md:mt-[100px] md:ml-[86px] md:grid-cols-[repeat(4,minmax(0,230px))] md:justify-start md:gap-10 dark:md:ml-[112px]'>
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
