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
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

interface CounterProps {
  end: number
  suffix?: string
  duration?: number
}

function Counter(props: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  const format = useCallback(
    (value: number) =>
      `${Math.round(value).toLocaleString()}${props.suffix ?? ''}`,
    [props.suffix]
  )
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = format(props.end)
      return
    }
    let frameId: number | null = null
    let isActive = true
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!isActive || !entry.isIntersecting || started.current) return
        started.current = true
        const start = performance.now()
        const frame = (now: number) => {
          if (!isActive) return
          const progress = Math.min((now - start) / (props.duration ?? 1500), 1)
          node.textContent = format(props.end * (1 - Math.pow(1 - progress, 3)))
          if (progress < 1) {
            frameId = requestAnimationFrame(frame)
          } else {
            frameId = null
          }
        }
        frameId = requestAnimationFrame(frame)
        observer.unobserve(node)
      },
      { threshold: 0.5 }
    )
    observer.observe(node)
    return () => {
      isActive = false
      if (frameId !== null) cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [format, props.duration, props.end])
  return (
    <span ref={ref} className='tabular-nums'>
      0{props.suffix}
    </span>
  )
}
export function Stats() {
  const { t } = useTranslation()
  const stats = [
    { end: 50, label: t('upstream services integrated') },
    { end: 100, label: t('model billing support') },
    { end: 50, label: t('compatible API routes') },
    { end: 10, label: t('scheduling controls') },
  ]
  return (
    <section className='relative z-10 bg-white px-6 py-20 text-[#0e0e0e] xl:pt-[100px] xl:pb-[100px] dark:bg-[#1f1f1f] dark:text-white'>
      <div className='relative mx-auto max-w-[1242px] xl:h-[470px]'>
        <p
          aria-hidden
          className='pointer-events-none absolute top-0 left-0 z-0 h-[210px] w-[360px] overflow-hidden text-[206px] leading-[206px] font-black text-[#e8e8e0] opacity-36 dark:text-[rgba(71,69,69,0.72)]'
        >
          03
        </p>
        <AnimateInView className='relative z-10 pt-0 pl-0 xl:pt-[105px] xl:pl-[58px]'>
          <p className='text-[15px] leading-[17px] font-medium text-[#6b6b6b] dark:text-[#a0a0a0]'>
            {t('Platform')} {t('Capabilities')}
          </p>
          <h2 className='mt-[10px] min-h-0 max-w-[430px] text-[clamp(2rem,4vw,3rem)] leading-[1.06] font-black xl:min-h-[105px] xl:w-[430px] xl:text-[45px] xl:leading-[49px]'>
            {t('More control, lower cost')}
          </h2>
        </AnimateInView>
        <div className='relative z-10 mt-16 grid grid-cols-2 gap-5 xl:mt-[73px] xl:grid-cols-[repeat(4,278px)] xl:justify-center xl:gap-6'>
          {stats.map((stat, index) => (
            <AnimateInView
              key={stat.label}
              delay={index * 100}
              animation='fade-up'
              className='relative flex h-[160px] w-full flex-col items-center justify-center rounded-[24px] border border-white/[0.9] bg-white/[0.52] text-center xl:h-[160px] xl:w-[278px] dark:border-white/[0.06] dark:bg-[#1c1c1c]'
            >
              <p
                className={`text-[2rem] leading-none font-black xl:absolute xl:top-[42px] xl:left-1/2 xl:h-[58px] xl:w-[278px] xl:-translate-x-1/2 xl:text-[54px] xl:leading-[57px] ${index === 2 ? '' : 'text-[#c7c7c2]'}`}
              >
                <Counter end={stat.end} suffix='+' />
              </p>
              <p className='mt-[6px] text-[14px] leading-[15px] text-[#6b6b6b] xl:absolute xl:top-[106px] xl:left-1/2 xl:mt-0 xl:h-[22px] xl:w-[278px] xl:-translate-x-1/2 dark:text-[#a8a8a8]'>
                {stat.label}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
