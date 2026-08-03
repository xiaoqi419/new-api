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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ArrowRight, Megaphone, X } from '@/components/icons'
import { usePromoBanner } from '@/hooks/use-promo-banner'
import { getBannerColorClass } from '@/lib/colors'
import {
  PROMO_BANNER_HEIGHT,
  PROMO_BANNER_ROTATE_MS,
  type PromoBannerItem,
} from '@/lib/promo-banner'
import { cn } from '@/lib/utils'
import { usePromoBannerStore } from '@/stores/promo-banner-store'

function PromoLine({ item }: { item: PromoBannerItem }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [scrolls, setScrolls] = useState(false)
  const [copiesPerRun, setCopiesPerRun] = useState(1)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const copy = copyRef.current
    const text = textRef.current
    if (!viewport || !copy || !text) return

    const measure = () => {
      const available = viewport.offsetWidth
      const period = copy.offsetWidth
      if (!available || !period) return

      // A message that already fits stays put. Scrolling it anyway would tile
      // several copies across a wide strip just to keep the loop seamless.
      if (text.offsetWidth <= available) {
        setScrolls(false)
        return
      }

      setScrolls(true)
      // The keyframe shifts the track by exactly half its width, so one run has
      // to cover the strip. Anything shorter drags a blank stretch of the
      // difference across the screen on every loop.
      setCopiesPerRun(Math.ceil(available / period) + 1)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(copy)
    return () => observer.disconnect()
  }, [item.text])

  const trailingCopyKeys = useMemo(
    () =>
      scrolls
        ? Array.from(
            { length: Math.max(0, copiesPerRun * 2 - 1) },
            (_, index) => `promo-copy-${index}`
          )
        : [],
    [scrolls, copiesPerRun]
  )

  const hasCta = !!item.button_text && !!item.button_link
  const isExternalCta = /^https?:\/\//i.test(item.button_link)

  return (
    <div
      className={cn(
        'flex h-9 w-full shrink-0 items-center gap-2 pr-9 pl-3 text-xs text-white',
        getBannerColorClass(item.color)
      )}
    >
      <Megaphone className='size-3.5 shrink-0 opacity-90' />

      <div
        ref={viewportRef}
        className={cn(
          'flex min-w-0 flex-1 overflow-hidden',
          !scrolls && 'justify-center'
        )}
      >
        <div className={cn('flex w-max', scrolls && 'animate-promo-marquee')}>
          <span
            ref={copyRef}
            className={cn('shrink-0 whitespace-nowrap', scrolls && 'pr-12')}
          >
            <span ref={textRef}>{item.text}</span>
          </span>
          {trailingCopyKeys.map((key) => (
            <span
              key={key}
              aria-hidden
              className='shrink-0 pr-12 whitespace-nowrap'
            >
              {item.text}
            </span>
          ))}
        </div>
      </div>

      {hasCta ? (
        <a
          href={item.button_link}
          target={isExternalCta ? '_blank' : undefined}
          rel={isExternalCta ? 'noreferrer noopener' : undefined}
          className='flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 font-medium transition-colors hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none'
        >
          {item.button_text}
          <ArrowRight className='size-3' />
        </a>
      ) : null}
    </div>
  )
}

export function PromoBanner() {
  const { t } = useTranslation()
  const { config, visible } = usePromoBanner()
  const dismiss = usePromoBannerStore((state) => state.dismiss)

  const [activeIndex, setActiveIndex] = useState(0)
  const [hovered, setHovered] = useState(false)

  const lines = useMemo(
    () =>
      config.items.map((item, index) => ({
        key: `promo-line-${index}`,
        item,
      })),
    [config.items]
  )

  // An admin can delete entries while a visitor sits on the page, which would
  // otherwise leave the track parked below the last remaining row.
  useEffect(() => {
    setActiveIndex((current) => (current < lines.length ? current : 0))
  }, [lines.length])

  useEffect(() => {
    if (!visible || lines.length < 2 || hovered) return
    const timer = setInterval(
      () => setActiveIndex((current) => (current + 1) % lines.length),
      PROMO_BANNER_ROTATE_MS
    )
    return () => clearInterval(timer)
  }, [visible, lines.length, hovered])

  if (!visible) return null

  return (
    <div
      role='region'
      aria-label={t('Site promotion')}
      className='promo-banner pointer-events-auto relative h-9 w-full overflow-hidden'
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className='promo-banner-track'
        style={{
          transform: `translateY(calc(-1 * ${activeIndex} * ${PROMO_BANNER_HEIGHT}))`,
        }}
      >
        {lines.map((line) => (
          <PromoLine key={line.key} item={line.item} />
        ))}
      </div>

      <button
        type='button'
        onClick={dismiss}
        aria-label={t('Dismiss promotion')}
        className='absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none'
      >
        <X className='size-3.5' />
      </button>
    </div>
  )
}
