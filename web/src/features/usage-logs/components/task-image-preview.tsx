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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Image } from '@/components/icons'

import type { TaskImageResult } from '../types'
import { TaskImagePreviewDialog } from './dialogs/task-image-preview-dialog'

interface TaskImagePreviewProps {
  images: TaskImageResult[]
}

const MAX_VISIBLE_THUMBNAILS = 3

export function TaskImagePreview(props: TaskImagePreviewProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedThumbnails, setFailedThumbnails] = useState<Set<number>>(
    new Set()
  )

  if (props.images.length === 0) {
    return (
      <span className='text-muted-foreground inline-flex items-center gap-1 text-xs'>
        <Image className='size-3.5' />
        {t('Image not available')}
      </span>
    )
  }

  const visibleImages = props.images.slice(0, MAX_VISIBLE_THUMBNAILS)

  return (
    <>
      <div className='flex max-w-full items-center gap-1.5'>
        {visibleImages.map((image, index) => {
          const unavailable =
            image.status === 'unavailable' || failedThumbnails.has(index)
          const hiddenCount =
            index === MAX_VISIBLE_THUMBNAILS - 1
              ? props.images.length - MAX_VISIBLE_THUMBNAILS
              : 0

          return (
            <button
              key={
                image.status === 'available' ? `${image.key}-${index}` : index
              }
              type='button'
              className='bg-muted focus-visible:ring-ring hover:border-primary/60 relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none'
              onClick={(event) => {
                event.stopPropagation()
                setActiveIndex(index)
                setOpen(true)
              }}
              aria-label={t('Preview image {{number}}', { number: index + 1 })}
            >
              {unavailable ? (
                <span className='text-muted-foreground px-1 text-[9px] leading-tight'>
                  {t('Image not available')}
                </span>
              ) : (
                <img
                  src={image.thumbnail_url}
                  alt={t('Generated image')}
                  className='h-full w-full object-cover'
                  loading='lazy'
                  onError={() => {
                    setFailedThumbnails((previous) => {
                      const next = new Set(previous)
                      next.add(index)
                      return next
                    })
                  }}
                />
              )}
              {hiddenCount > 0 ? (
                <span className='absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white'>
                  +{hiddenCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <TaskImagePreviewDialog
        open={open}
        onOpenChange={setOpen}
        images={props.images}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
      />
    </>
  )
}
