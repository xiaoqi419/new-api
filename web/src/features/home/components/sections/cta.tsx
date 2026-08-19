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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { ArrowRight } from '@/components/icons'
import { Button } from '@/components/ui/button'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()
  if (props.isAuthenticated) return null

  return (
    <section
      className={`relative z-10 bg-white px-6 py-20 md:py-0 dark:bg-[#1f1f1f] ${props.className ?? ''}`}
    >
      <AnimateInView className='relative mx-auto max-w-[1288px] overflow-hidden rounded-[58px] border border-black/[0.08] bg-white px-8 py-14 shadow-[0_24px_50px_rgba(0,0,0,0.06)] md:h-[430px] md:translate-x-[5px] md:px-[74px] md:py-[69px] dark:border-white/[0.08] dark:bg-[#0e0e0e] dark:shadow-[0_24px_50px_rgba(0,0,0,0.28)]'>
        <img
          aria-hidden
          src='/assets/home-figma/light/asset-03.svg'
          className='pointer-events-none absolute right-0 bottom-0 hidden h-auto w-[68%] opacity-70 md:block dark:hidden'
        />
        <img
          aria-hidden
          src='/assets/home-figma/dark/asset-06.svg'
          className='pointer-events-none absolute right-0 bottom-0 hidden h-auto w-[68%] opacity-70 dark:block'
        />
        <div className='relative z-10 max-w-[520px]'>
          <h2 className='text-[clamp(2.2rem,4vw,3rem)] leading-[1.08] font-black tracking-normal md:text-[48px] md:leading-[52px]'>
            {t('Connect your models')}
            <br />
            {t('with New API')}
          </h2>
          <p className='mt-8 max-w-[480px] text-[17px] leading-[1.55] text-[#575757] md:mt-[24px] md:min-h-[62px] md:text-[18px] md:leading-[28px] dark:text-[#bcbcbc]'>
            {t(
              'From API keys and protocol compatibility to usage and permission management, reduce integration costs with one unified gateway.'
            )}
          </p>
          <Button
            className='mt-8 h-11 rounded-full bg-[#050505] px-6 text-[15px] font-bold text-white hover:bg-[#2f00e5] md:mt-[59px] dark:bg-[#d4ff1f] dark:text-[#050505]'
            render={<Link to='/sign-up' />}
          >
            {t('Get Started')}
            <ArrowRight className='ml-2 size-4' />
          </Button>
        </div>
        <div
          aria-hidden
          className='pointer-events-none absolute top-[4px] left-[373px] hidden h-[366px] w-[568px] md:block'
        >
          <div className='absolute top-0 left-[95px] h-[158px] w-[250px] rotate-[-17deg] rounded-[24px] bg-gradient-to-br from-[#ff5f7e] via-[#f2d54c] to-[#6e6bff] p-7 shadow-[0_20px_38px_rgba(0,0,0,.28)]'>
            <p className='text-[24px] font-bold text-[#0e0e0e]'>New API</p>
            <p className='mt-2 text-[22px] font-bold text-[#0e0e0e]'>)))</p>
            <p className='mt-5 text-sm font-semibold text-[#0e0e0e]'>
              Monitor / Cost / Performance
            </p>
          </div>
          <div className='absolute top-[220px] left-[29px] h-[52px] w-[330px] rotate-[8deg] rounded-full bg-gradient-to-r from-[#f5ff3b] via-[#fa72cf] to-[#49f4ff]' />
          <span className='absolute top-[66px] left-[14px] text-2xl text-[#d4ff1f]'>
            ✦
          </span>
          <span className='absolute top-[146px] left-[284px] text-2xl text-[#d4ff1f]'>
            ✦
          </span>
          <span className='absolute top-[226px] left-[554px] text-2xl text-[#d4ff1f]'>
            ✦
          </span>
        </div>
      </AnimateInView>
    </section>
  )
}
