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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

const PREVIEW_WIDTH = 1200
const PREVIEW_HEIGHT = 900

type PelicanPreviewProps = {
  src: string
  title: string
  interactive?: boolean
}

export function PelicanPreview(props: PelicanPreviewProps) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(Boolean(props.interactive))
  const [scale, setScale] = useState(0)
  const [loadedSrc, setLoadedSrc] = useState('')
  const loaded = loadedSrc === props.src
  const showFrame = (props.interactive || visible) && scale > 0

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const measure = () => {
      const width = host.clientWidth
      setScale(width > 0 ? width / PREVIEW_WIDTH : 0)
    }
    measure()

    const resize = new ResizeObserver(measure)
    resize.observe(host)

    let intersection: IntersectionObserver | undefined
    if (props.interactive) {
      setVisible(true)
    } else if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
    } else {
      intersection = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisible(true)
          }
        },
        { rootMargin: '160px' }
      )
      intersection.observe(host)
    }

    return () => {
      resize.disconnect()
      intersection?.disconnect()
    }
  }, [props.interactive])

  return (
    <div
      ref={hostRef}
      className='bg-muted relative aspect-[4/3] w-full overflow-hidden'
    >
      {showFrame ? (
        <iframe
          title={props.title}
          src={props.src}
          sandbox='allow-scripts'
          referrerPolicy='no-referrer'
          tabIndex={-1}
          loading={props.interactive ? 'eager' : 'lazy'}
          onLoad={() => setLoadedSrc(props.src)}
          className='absolute top-0 left-0 border-0'
          style={{
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: props.interactive ? 'auto' : 'none',
          }}
        />
      ) : null}
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center gap-2',
          loaded && showFrame && 'hidden'
        )}
      >
        <Spinner />
        <span className='text-muted-foreground text-sm'>
          {t('Loading frame')}
        </span>
      </div>
    </div>
  )
}
