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
      icon: <Settings className='size-7' strokeWidth={1.7} />,
    },
    {
      num: '2',
      title: t('Connect'),
      desc: t(
        'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
      ),
      icon: <Zap className='size-7' strokeWidth={1.7} />,
    },
    {
      num: '3',
      title: t('Monitor'),
      desc: t('Track usage, costs and performance with real-time analytics'),
      icon: <BarChart3 className='size-7' strokeWidth={1.7} />,
    },
  ]

  return (
    <section className='relative z-20 bg-white px-6 py-24 text-[#0e0e0e] xl:pt-[100px] xl:pb-0 dark:bg-[#1f1f1f] dark:text-white'>
      <div className='relative mx-auto max-w-[1224px] xl:h-[605px]'>
        <p
          aria-hidden
          className='pointer-events-none absolute top-0 left-0 z-0 h-[210px] w-[360px] overflow-hidden text-[206px] leading-[206px] font-black text-[#e8e8e0] opacity-36 dark:text-[rgba(71,69,69,0.72)]'
        >
          02
        </p>
        <AnimateInView className='relative z-10 mb-0 pt-0 pl-0 xl:pt-[105px] xl:pl-[58px]'>
          <p className='text-[15px] leading-[17px] font-medium text-[#6b6b6b] xl:h-[22px] dark:text-[#a0a0a0]'>
            {t('How It Works')}
          </p>
          <h2 className='mt-[13px] text-[clamp(2rem,4vw,3rem)] leading-[1.06] font-black xl:mt-[8px] xl:h-[60px] xl:w-[430px] xl:text-[48px] xl:leading-[51px]'>
            {t('Three steps to get started')}
          </h2>
        </AnimateInView>
        <div className='relative z-10 mx-auto mt-16 grid max-w-[900px] gap-4 xl:mt-[120px] xl:max-w-[1224px] xl:grid-cols-[repeat(3,350px)] xl:justify-center xl:gap-10'>
          {steps.map((step, index) => (
            <AnimateInView
              key={step.num}
              delay={index * 100}
              animation='fade-up'
              className={`relative h-[290px] overflow-hidden rounded-[34px] border p-0 shadow-[0_16px_30px_rgba(0,0,0,0.06)] xl:w-[350px] ${index === 1 ? 'border-white/[0.9] bg-white dark:border-white/[0.12] dark:bg-[#2a2a2a]' : 'border-white/[0.9] bg-white/[0.58] dark:border-white/[0.06] dark:bg-[#242424]'}`}
            >
              <span
                className={`absolute top-[11px] left-[23px] text-[112px] leading-[112px] font-black ${index === 1 ? 'text-[#2e2e2e] opacity-55 dark:text-white/[0.1]' : 'text-[#ecece8] opacity-70 dark:text-white/[0.06]'}`}
              >
                {step.num}
              </span>
              <div
                className={`absolute top-[79px] left-1/2 flex size-16 -translate-x-1/2 items-center justify-center rounded-[32px] text-[#0e0e0e] xl:left-[142px] xl:translate-x-0 ${index === 1 ? 'bg-[#d4ff1f]' : 'bg-white'}`}
              >
                {step.icon}
              </div>
              <h3 className='absolute top-[169px] left-0 w-full text-center text-[22px] leading-6 font-bold xl:h-[30px]'>
                {step.title}
              </h3>
              <p
                className={`absolute top-[211px] left-1/2 w-[240px] -translate-x-1/2 text-center text-[14px] leading-5 font-medium xl:h-[50px] ${index === 1 ? 'text-[#bfbfbf] dark:text-[#b8b8b8]' : 'text-[#6b6b6b] dark:text-[#b8b8b8]'}`}
              >
                {step.desc}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
