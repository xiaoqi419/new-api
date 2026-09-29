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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Maximize2, Palette } from '@/components/icons'
import { cn } from '@/lib/utils'

import { fetchPelicanProbe } from './api'
import { playableDrawingHTML } from './drawing-html'
import { formatDuration, formatSlotLabel } from './format'

export function DrawingFrame(props: {
  html: string
  title: string
  interactive?: boolean
}) {
  const isInteractive = props.interactive ?? true
  return (
    <iframe
      title={props.title}
      sandbox='allow-scripts'
      srcDoc={props.html}
      tabIndex={isInteractive ? 0 : -1}
      className={cn(
        'absolute inset-0 block h-full w-full border-0',
        isInteractive ? 'pointer-events-auto' : 'pointer-events-none'
      )}
    />
  )
}

function DrawingCanvas(props: {
  html: string
  title: string
  probeId: number | null
  placeholder: string
  inspectText: string
  onOpen?: (id: number) => void
}) {
  if (props.onOpen && props.probeId != null) {
    const targetId = props.probeId
    if (props.html) {
      return (
        <button
          type='button'
          onClick={() => props.onOpen?.(targetId)}
          aria-label={props.title}
          className='group relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-xl border bg-muted/20 text-left transition-all hover:border-primary/40 hover:shadow-sm'
        >
          <DrawingFrame
            html={props.html}
            title={props.title}
            interactive={false}
          />
          <div className='absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100'>
            <Maximize2 className='size-3' />
            <span>{props.inspectText}</span>
          </div>
        </button>
      )
    }

    return (
      <button
        type='button'
        onClick={() => props.onOpen?.(targetId)}
        aria-label={props.title}
        className='group relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-xl border border-dashed bg-muted/15 text-left transition-all hover:border-primary/40 hover:bg-muted/20'
      >
        <div className='absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground'>
          <Palette className='size-5 opacity-40 transition-transform group-hover:scale-110' />
          <p>{props.placeholder}</p>
        </div>
        <div className='absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100'>
          <Maximize2 className='size-3' />
          <span>{props.inspectText}</span>
        </div>
      </button>
    )
  }

  if (props.html) {
    return (
      <div className='relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-muted/20'>
        <DrawingFrame html={props.html} title={props.title} />
      </div>
    )
  }

  return (
    <div className='relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-dashed bg-muted/15'>
      <div className='absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground'>
        <Palette className='size-5 opacity-40' />
        <p>{props.placeholder}</p>
      </div>
    </div>
  )
}

export function DrawingStage(props: {
  probeId: number | null
  locale?: string
  waitingLabel: string
  onOpen?: (id: number) => void
}) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['pelican-probe', props.probeId],
    queryFn: ({ signal }) => fetchPelicanProbe(props.probeId ?? 0, signal),
    enabled: props.probeId != null,
    refetchInterval: (current) => {
      const isRunning = current.state.data?.status === 'running'
      return isRunning ? 5000 : false
    },
    meta: { errorToast: false },
  })

  const probe = query.data
  const html = probe ? playableDrawingHTML(probe.drawing_html, probe.reply) : ''
  const title = [probe?.subject, probe?.vehicle, probe?.scene]
    .filter(Boolean)
    .join(' · ')
  const defaultTitle = t('Drawing preview')

  let placeholder = props.waitingLabel
  if (probe) {
    placeholder = t('No playable drawing recorded in this check.')
  }

  let timeString = ''
  if (probe) {
    const slotFormatted = formatSlotLabel(probe.slot_start, props.locale)
    timeString = slotFormatted.slice(-5)
    if (probe.latency_ms > 0) {
      timeString += ` · ${formatDuration(probe.latency_ms)}`
    }
  }

  return (
    <div className='flex h-full min-h-0 flex-col gap-2'>
      <div className='flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground'>
        <span className='min-w-0 truncate font-medium text-foreground/80'>
          {title || defaultTitle}
        </span>
        {timeString ? (
          <span className='shrink-0 tabular-nums text-muted-foreground'>
            {timeString}
          </span>
        ) : null}
      </div>
      <DrawingCanvas
        html={html}
        title={title || defaultTitle}
        probeId={props.probeId}
        placeholder={placeholder}
        inspectText={defaultTitle}
        onOpen={props.onOpen}
      />
    </div>
  )
}
