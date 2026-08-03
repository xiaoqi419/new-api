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
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ArrowRight, Megaphone, X } from '@/components/icons'
import { usePromoBanner } from '@/hooks/use-promo-banner'
import { usePromoBannerStore } from '@/stores/promo-banner-store'

export function PromoBanner() {
  const { t } = useTranslation()
  const { config, visible } = usePromoBanner()
  const dismiss = usePromoBannerStore((state) => state.dismiss)

  const viewportRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLSpanElement>(null)
  const [copiesPerRun, setCopiesPerRun] = useState(1)

  // The keyframe shifts the track by exactly half its width, so a single run has
  // to be at least as wide as the strip. Anything shorter drags a blank stretch
  // of the difference across the screen on every loop.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const copy = copyRef.current
    if (!viewport || !copy) return

    const measure = () => {
      const copyWidth = copy.offsetWidth
      if (!copyWidth) return
      setCopiesPerRun(Math.ceil(viewport.offsetWidth / copyWidth) + 1)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(copy)
    return () => observer.disconnect()
  }, [config.text, visible])

  const trailingCopyKeys = useMemo(
    () =>
      Array.from(
        { length: Math.max(0, copiesPerRun * 2 - 1) },
        (_, index) => `promo-copy-${index}`
      ),
    [copiesPerRun]
  )

  if (!visible) return null

  const hasCta = !!config.button_text && !!config.button_link
  const isExternalCta = /^https?:\/\//i.test(config.button_link)

  return (
    <div
      role='region'
      aria-label={t('Site promotion')}
      className='promo-banner from-success via-success/80 to-success text-success-foreground pointer-events-auto flex h-9 w-full items-center gap-2 bg-gradient-to-r pr-1 pl-3 text-xs'
    >
      <Megaphone className='size-3.5 shrink-0 opacity-90' />

      <div ref={viewportRef} className='flex min-w-0 flex-1 overflow-hidden'>
        <div className='animate-promo-marquee flex w-max'>
          <span ref={copyRef} className='shrink-0 pr-12 whitespace-nowrap'>
            {config.text}
          </span>
          {trailingCopyKeys.map((key) => (
            <span
              key={key}
              aria-hidden
              className='shrink-0 pr-12 whitespace-nowrap'
            >
              {config.text}
            </span>
          ))}
        </div>
      </div>

      {hasCta ? (
        <a
          href={config.button_link}
          target={isExternalCta ? '_blank' : undefined}
          rel={isExternalCta ? 'noreferrer noopener' : undefined}
          className='bg-success-foreground/15 hover:bg-success-foreground/25 focus-visible:ring-success-foreground/60 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none'
        >
          {config.button_text}
          <ArrowRight className='size-3' />
        </a>
      ) : null}

      <button
        type='button'
        onClick={dismiss}
        aria-label={t('Dismiss promotion')}
        className='hover:bg-success-foreground/20 focus-visible:ring-success-foreground/60 flex size-6 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none'
      >
        <X className='size-3.5' />
      </button>
    </div>
  )
}
