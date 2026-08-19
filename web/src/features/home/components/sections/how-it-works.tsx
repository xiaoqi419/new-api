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
import { BarChart3, Settings, Zap } from '@/components/icons'

export function HowItWorks() {
  const { t } = useTranslation()
  const steps = [
    {
      num: '1',
      title: t('Configure'),
      desc: t(
        'Add your API keys, set up channels and configure access permissions'
      ),
      icon: <Settings className='size-5' strokeWidth={1.7} />,
    },
    {
      num: '2',
      title: t('Connect'),
      desc: t(
        'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
      ),
      icon: <Zap className='size-5' strokeWidth={1.7} />,
    },
    {
      num: '3',
      title: t('Monitor'),
      desc: t('Track usage, costs and performance with real-time analytics'),
      icon: <BarChart3 className='size-5' strokeWidth={1.7} />,
    },
  ]

  return (
    <section className='relative z-10 bg-white px-6 py-24 text-[#0e0e0e] md:pt-[100px] md:pb-0 dark:bg-[#1f1f1f] dark:text-white'>
      <div className='relative mx-auto max-w-[1224px] md:h-[605px] md:-translate-x-[7px] dark:md:-translate-x-[33px]'>
        <p
          aria-hidden
          className='pointer-events-none absolute top-0 left-0 h-[210px] w-[360px] overflow-hidden text-[206px] leading-[206px] font-black text-[#e8e8e0] opacity-36 dark:text-[rgba(71,69,69,0.72)]'
        >
          02
        </p>
        <AnimateInView className='mb-0 pt-0 pl-0 md:pt-[105px] md:pl-[58px]'>
          <p className='text-[15px] leading-[17px] font-medium text-[#6b6b6b] dark:text-[#a0a0a0]'>
            {t('How It Works')}
          </p>
          <h2 className='mt-[13px] text-[clamp(2rem,4vw,3rem)] leading-[1.06] font-black md:text-[48px] md:leading-[51px]'>
            {t('Three steps to get started')}
          </h2>
        </AnimateInView>
        <div className='mx-auto mt-16 grid max-w-[900px] gap-4 md:mx-0 md:mt-[129px] md:max-w-[1224px] md:grid-cols-[repeat(3,350px)] md:justify-end md:gap-10'>
          {steps.map((step, index) => (
            <AnimateInView
              key={step.num}
              delay={index * 100}
              animation='fade-up'
              className={`relative min-h-[190px] rounded-[26px] border p-6 md:h-[290px] md:min-h-0 ${index === 1 ? 'border-black/[0.12] bg-[#f3f3f3] shadow-[0_16px_32px_rgba(0,0,0,0.08)] dark:border-white/[0.12] dark:bg-[#2a2a2a]' : 'border-black/[0.07] bg-[#fafaf8] dark:border-white/[0.06] dark:bg-[#242424]'}`}
            >
              <span className='absolute top-4 left-5 text-[52px] leading-none font-black text-black/[0.05] dark:text-white/[0.06]'>
                {step.num}
              </span>
              <div className='relative flex size-10 items-center justify-center rounded-full bg-[#d4ff1f] text-[#0e0e0e]'>
                {step.icon}
              </div>
              <h3 className='relative mt-5 text-[17px] font-bold'>
                {step.title}
              </h3>
              <p className='relative mt-2 text-[13px] leading-[18px] text-[#6b6b6b] dark:text-[#b8b8b8]'>
                {step.desc}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
