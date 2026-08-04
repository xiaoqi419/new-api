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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RefreshCw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchClickCaptcha } from '@/features/auth/api'
import type { ClickCaptchaSolution } from '@/features/auth/types'
import { cn } from '@/lib/utils'

interface ClickCaptchaProps {
  /** Receives the solution once every character has been clicked, null while incomplete. */
  onSolvedChange: (solution: ClickCaptchaSolution | null) => void
  /** Bump to discard the current puzzle and load a new one. */
  resetSignal?: number
  className?: string
}

const TARGET_STATE_CLASS = {
  done: 'border-primary/30 bg-primary/10 text-muted-foreground line-through',
  current: 'border-primary bg-primary/10 text-primary',
  pending: 'border-border text-foreground',
} as const

function targetState(index: number, nextIndex: number) {
  if (index < nextIndex) return 'done'
  if (index === nextIndex) return 'current'
  return 'pending'
}

interface Marker {
  id: number
  x: number
  y: number
}

export function ClickCaptcha({
  onSolvedChange,
  resetSignal = 0,
  className,
}: ClickCaptchaProps) {
  const { t } = useTranslation()
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [challenge, setChallenge] = useState<{
    id: string
    image: string
    targets: string[]
    width: number
    height: number
  } | null>(null)
  const [markers, setMarkers] = useState<Marker[]>([])
  const markerId = useRef(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    setMarkers([])
    onSolvedChange(null)
    try {
      const data = await fetchClickCaptcha()
      setChallenge(data)
    } catch {
      setChallenge(null)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [onSolvedChange])

  useEffect(() => {
    void load()
  }, [load, resetSignal])

  const handleClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!challenge || markers.length >= challenge.targets.length) return

    const rect = event.currentTarget.getBoundingClientRect()
    // The image is laid out responsively, so clicks have to be mapped back into
    // the coordinate space the server drew in.
    const scaleX = challenge.width / rect.width
    const scaleY = challenge.height / rect.height
    markerId.current += 1
    const next = [
      ...markers,
      {
        id: markerId.current,
        x: Math.round((event.clientX - rect.left) * scaleX),
        y: Math.round((event.clientY - rect.top) * scaleY),
      },
    ]
    setMarkers(next)

    if (next.length === challenge.targets.length) {
      onSolvedChange({
        id: challenge.id,
        points: next.flatMap((m) => [m.x, m.y]).join(','),
      })
    }
  }

  const nextIndex = markers.length

  return (
    <div className={cn('space-y-2', className)}>
      <div className='flex items-center justify-between gap-2'>
        <div className='text-sm'>
          <span className='text-muted-foreground'>
            {t('Click these characters in order')}
          </span>
          {challenge && (
            <span className='ml-1 inline-flex gap-1 align-middle'>
              {challenge.targets.map((char, index) => (
                <span
                  key={char}
                  className={cn(
                    'inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-sm font-medium',
                    TARGET_STATE_CLASS[targetState(index, nextIndex)]
                  )}
                >
                  {char}
                </span>
              ))}
            </span>
          )}
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-7 shrink-0'
          aria-label={t('Refresh captcha')}
          onClick={() => void load()}
        >
          <RefreshCw className='size-4' />
        </Button>
      </div>

      {loading && <Skeleton className='aspect-[2/1] w-full rounded-md' />}

      {!loading && failed && (
        <button
          type='button'
          onClick={() => void load()}
          className='text-muted-foreground flex aspect-[2/1] w-full items-center justify-center rounded-md border border-dashed text-sm'
        >
          {t('Failed to load captcha, click to retry')}
        </button>
      )}

      {!loading && !failed && challenge && (
        <div className='relative overflow-hidden rounded-md border'>
          <img
            ref={imageRef}
            src={challenge.image}
            alt={t('Click these characters in order')}
            className='block w-full cursor-crosshair select-none'
            draggable={false}
            onClick={handleClick}
          />
          {markers.map((marker, index) => (
            <span
              key={marker.id}
              className='bg-primary text-primary-foreground pointer-events-none absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-semibold shadow'
              style={{
                left: `${(marker.x / challenge.width) * 100}%`,
                top: `${(marker.y / challenge.height) * 100}%`,
              }}
            >
              {index + 1}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
