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
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true
        const start = performance.now()
        const frame = (now: number) => {
          const progress = Math.min((now - start) / (props.duration ?? 1500), 1)
          node.textContent = format(props.end * (1 - Math.pow(1 - progress, 3)))
          if (progress < 1) requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
        observer.unobserve(node)
      },
      { threshold: 0.5 }
    )
    observer.observe(node)
    return () => observer.disconnect()
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
    <section className='relative z-10 bg-white px-6 py-20 text-[#0e0e0e] md:pt-[100px] md:pb-[100px] dark:bg-[#1f1f1f] dark:text-white'>
      <div className='relative mx-auto max-w-[1242px] md:h-[470px] md:translate-x-[2px] dark:md:-translate-x-[24px]'>
        <p
          aria-hidden
          className='pointer-events-none absolute top-0 left-0 h-[210px] w-[360px] overflow-hidden text-[206px] leading-[206px] font-black text-[#e8e8e0] opacity-36 dark:text-[rgba(71,69,69,0.72)]'
        >
          03
        </p>
        <div className='pt-0 pl-0 md:pt-[105px] md:pl-[58px]'>
          <p className='text-[15px] leading-[17px] font-medium text-[#6b6b6b] dark:text-[#a0a0a0]'>
            {t('Platform')} {t('Capabilities')}
          </p>
          <h2 className='mt-[10px] min-h-0 max-w-[430px] text-[clamp(2rem,4vw,3rem)] leading-[1.06] font-black md:min-h-[98px] md:w-[390px] md:text-[45px] md:leading-[49px]'>
            {t('More control, lower cost')}
          </h2>
        </div>
        <div className='mt-16 grid grid-cols-2 gap-5 md:mt-[80px] md:ml-[58px] md:grid-cols-[repeat(4,278px)] md:gap-6'>
          {stats.map((stat) => (
            <div
              key={stat.label}
              className='flex h-[160px] w-full flex-col items-center justify-center rounded-[24px] border border-black/[0.08] bg-white text-center md:h-[160px] md:w-[278px] dark:border-white/[0.06] dark:bg-[#1c1c1c]'
            >
              <p className='text-[2rem] leading-none font-black md:text-[54px] md:leading-[57px]'>
                <Counter end={stat.end} suffix='+' />
              </p>
              <p className='mt-[6px] text-[14px] leading-[15px] text-[#6b6b6b] dark:text-[#a8a8a8]'>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
