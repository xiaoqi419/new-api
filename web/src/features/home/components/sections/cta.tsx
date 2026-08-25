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
import { Button } from '@/components/ui/button'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_SYSTEM_NAME } from '@/lib/constants'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const displaySystemName = systemName?.trim() || DEFAULT_SYSTEM_NAME

  return (
    <section
      className={`relative z-30 bg-white px-6 py-20 md:pt-0 md:pb-0 dark:bg-[#1f1f1f] ${props.className ?? ''}`}
    >
      <AnimateInView
        animation='scale-in'
        className='relative mx-auto max-w-[1288px] overflow-hidden rounded-[42px] border border-black/[0.08] bg-white px-8 py-14 shadow-[0_24px_50px_rgba(0,0,0,0.06)] md:h-[430px] md:rounded-[58px] md:px-[74px] md:py-[69px] dark:border-transparent dark:bg-[#0e0e0e] dark:shadow-[0_24px_50px_rgba(255,255,255,0.06)]'
      >
        <div className='relative z-10 max-w-[520px]'>
          <h2 className='text-[clamp(2.2rem,4vw,3rem)] leading-[1.08] font-black tracking-normal break-words md:text-[48px] md:leading-[52px]'>
            {t('Connect your models')}
            <br />
            {t('with {{siteName}}', { siteName: displaySystemName })}
          </h2>
          <p className='mt-6 max-w-[480px] text-[17px] leading-[1.55] text-[#575757] md:mt-6 md:min-h-[62px] md:text-[18px] md:leading-7 dark:text-[#b8b8b8]'>
            {t(
              'From API keys and protocol compatibility to usage and permission management, reduce integration costs with one unified gateway.'
            )}
          </p>
          <Button
            className='mt-8 h-[45px] rounded-[32px] border border-white/[0.18] bg-[#050505] px-6 text-[15px] font-bold text-white hover:bg-[#2f00e5] md:mt-[59px] dark:border-transparent dark:bg-[#d4ff1f] dark:text-[#0e0e0e]'
            render={
              <Link to={props.isAuthenticated ? '/workbench' : '/sign-up'} />
            }
          >
            {props.isAuthenticated ? t('Go to Dashboard') : t('Get Started')}
          </Button>
        </div>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 z-0 hidden overflow-hidden md:block'
        >
          <img
            alt=''
            draggable={false}
            src='/assets/home-figma/light/asset-03.svg'
            className='absolute top-[114px] left-[194px] h-[262.856px] w-[798.956px] dark:hidden'
          />
          <img
            alt=''
            draggable={false}
            src='/assets/home-figma/dark/asset-06.svg'
            className='absolute top-[114px] left-[194px] hidden h-[262.856px] w-[798.956px] dark:block'
          />

          <div className='absolute top-[4px] left-[779px] flex h-[224px] w-[285px] items-center justify-center'>
            <div
              data-testid='home-cta-brand-card'
              className='relative h-[158px] w-[250px] rotate-[-17deg] overflow-hidden rounded-[24px] bg-[linear-gradient(147.707deg,#ff5f7e_0%,#f2d54c_28%,#6e6bff_50%)] shadow-[0_20px_38px_rgba(0,0,0,0.28)]'
            >
              <p className='absolute top-7 left-[30px] w-[126px] truncate text-[26px] leading-[29px] font-bold text-[#0e0e0e]'>
                {displaySystemName}
              </p>
              <div className='absolute top-7 left-[168px] h-9 w-12 rounded-lg bg-[linear-gradient(143.13deg,#f7f7f7_0%,#cfcfcf_50%)]' />
              <p className='absolute top-[78px] left-[30px] text-[26px] leading-[29px] font-bold text-[#0e0e0e]'>
                )))
              </p>
              <p className='absolute top-[106px] left-[30px] text-[15px] leading-[17px] font-semibold text-[#0e0e0e]'>
                Monitor / Cost / Performance
              </p>
            </div>
          </div>
          <div className='absolute top-[290px] left-[733px] h-[52px] w-[330px] rotate-[8deg] rounded-[28px] bg-[linear-gradient(118.005deg,#f5ff3b_8.1229%,#fa72cf_22.314%,#49f4ff_52.75%)]' />
          <span className='absolute top-[70px] left-[684px] flex size-7 items-center justify-center text-[22px] leading-6 font-bold text-[#d4ff1f]'>
            ✦
          </span>
          <span className='absolute top-[150px] left-[954px] flex size-7 items-center justify-center text-[22px] leading-6 font-bold text-[#d4ff1f]'>
            ✦
          </span>
          <span className='absolute top-[230px] left-[1224px] flex size-7 items-center justify-center text-[22px] leading-6 font-bold text-[#d4ff1f]'>
            ✦
          </span>
        </div>
      </AnimateInView>
    </section>
  )
}
