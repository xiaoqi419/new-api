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

import { Dialog } from '@/components/dialog'
import { ChevronLeft, ChevronRight, Image } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { cn } from '@/lib/utils'

import type { TaskImageResult } from '../../types'

interface TaskImagePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  images: TaskImageResult[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
}

export function TaskImagePreviewDialog(props: TaskImagePreviewDialogProps) {
  const { t } = useTranslation()
  const [failedOriginals, setFailedOriginals] = useState<Set<number>>(new Set())
  const current = props.images[props.activeIndex]
  const hasMultiple = props.images.length > 1
  const originalUnavailable =
    current?.status !== 'available' || failedOriginals.has(props.activeIndex)

  const selectOffset = (offset: number) => {
    const total = props.images.length
    if (total === 0) return
    props.onActiveIndexChange((props.activeIndex + offset + total) % total)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <>
          <IconBadge tone='chart-4' size='sm'>
            <Image />
          </IconBadge>
          {t('Image Preview')}
        </>
      }
      description={t('Image {{current}} of {{total}}', {
        current: props.activeIndex + 1,
        total: props.images.length,
      })}
      contentClassName='sm:max-w-4xl'
      titleClassName='flex items-center gap-2'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      <div className='bg-muted/40 relative flex min-h-72 items-center justify-center overflow-hidden rounded-md border'>
        {originalUnavailable ? (
          <div className='text-muted-foreground flex flex-col items-center gap-2 px-6 py-16 text-center text-sm'>
            <Image className='size-8 opacity-50' />
            <span>{t('Image not available')}</span>
          </div>
        ) : (
          <img
            key={`${current.key}-${props.activeIndex}`}
            src={current.original_url}
            alt={t('Generated image')}
            className='max-h-[65vh] w-full object-contain'
            onError={() => {
              setFailedOriginals((previous) => {
                const next = new Set(previous)
                next.add(props.activeIndex)
                return next
              })
            }}
          />
        )}

        {hasMultiple ? (
          <>
            <Button
              type='button'
              variant='secondary'
              size='icon'
              className='absolute top-1/2 left-2 -translate-y-1/2 shadow-sm'
              onClick={() => selectOffset(-1)}
              aria-label={t('Previous image')}
            >
              <ChevronLeft />
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='icon'
              className='absolute top-1/2 right-2 -translate-y-1/2 shadow-sm'
              onClick={() => selectOffset(1)}
              aria-label={t('Next image')}
            >
              <ChevronRight />
            </Button>
          </>
        ) : null}
      </div>

      {hasMultiple ? (
        <div className='flex max-w-full gap-2 overflow-x-auto pb-1'>
          {props.images.map((image, index) => {
            return (
              <button
                key={
                  image.status === 'available' ? `${image.key}-${index}` : index
                }
                type='button'
                className={cn(
                  'bg-muted h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                  index === props.activeIndex
                    ? 'border-primary'
                    : 'border-transparent hover:border-border'
                )}
                onClick={() => props.onActiveIndexChange(index)}
                aria-label={t('Preview image {{number}}', {
                  number: index + 1,
                })}
                aria-current={index === props.activeIndex ? 'true' : undefined}
              >
                {image.status === 'available' ? (
                  <img
                    src={image.thumbnail_url}
                    alt=''
                    className='h-full w-full object-cover'
                  />
                ) : (
                  <Image className='text-muted-foreground mx-auto size-5' />
                )}
              </button>
            )
          })}
        </div>
      ) : null}
    </Dialog>
  )
}
