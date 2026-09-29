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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { ChevronDown, ChevronUp, TriangleAlert } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { fetchPelicanProbe } from './api'
import { DrawingFrame } from './drawing-frame'
import { playableDrawingHTML } from './drawing-html'
import { formatCheckedAt, formatDuration } from './format'

function statusKey(status: string) {
  if (status === 'pass') return 'Passed'
  if (status === 'fail') return 'Failed'
  if (status === 'error') return 'Request failed'
  if (status === 'running') return 'Checking'
  return 'No data'
}

function StatusBadge(props: { status: string; label: string }) {
  if (props.status === 'pass') {
    return (
      <span className='inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400'>
        <span className='size-1.5 rounded-full bg-emerald-500' />
        {props.label}
      </span>
    )
  }
  if (props.status === 'fail') {
    return (
      <span className='inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400'>
        <span className='size-1.5 rounded-full bg-rose-500' />
        {props.label}
      </span>
    )
  }
  if (props.status === 'error') {
    return (
      <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400'>
        <span className='size-1.5 rounded-full bg-amber-500' />
        {props.label}
      </span>
    )
  }
  if (props.status === 'running') {
    return (
      <span className='inline-flex items-center gap-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400'>
        <span className='size-1.5 animate-pulse rounded-full bg-blue-500' />
        {props.label}
      </span>
    )
  }
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground'>
      <span className='size-1.5 rounded-full bg-muted-foreground/40' />
      {props.label}
    </span>
  )
}

function StatTile(props: { label: string; value: string }) {
  return (
    <div className='flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 p-2.5'>
      <p className='text-[11px] font-medium tracking-wide uppercase text-muted-foreground'>
        {props.label}
      </p>
      <p className='text-sm font-semibold tabular-nums text-foreground'>
        {props.value}
      </p>
    </div>
  )
}

export function ProbeDialog(props: {
  id: number | null
  title: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [replyOpen, setReplyOpen] = useState(false)

  const query = useQuery({
    queryKey: ['pelican-probe', props.id],
    queryFn: ({ signal }) => fetchPelicanProbe(props.id ?? 0, signal),
    enabled: props.id != null,
  })

  const probe = query.data
  const drawingHTML = probe
    ? playableDrawingHTML(probe.drawing_html, probe.reply)
    : ''
  const statusLabel = probe ? t(statusKey(probe.status)) : ''
  const kindText =
    probe?.kind === 'drawing' ? t('Drawing test') : t('Logic test')
  const replyCount = [...(probe?.reply ?? '')].length

  let dialogTitle = props.title
  if (probe) {
    dialogTitle = `${props.title} · ${kindText}`
  }

  let dialogDescription: string | undefined
  if (probe) {
    dialogDescription = t(
      'Checked at {{time}} · took {{duration}} · record #{{id}}',
      {
        time: formatCheckedAt(probe.created_at, locale),
        duration: formatDuration(probe.latency_ms),
        id: probe.id,
      }
    )
  }

  return (
    <Dialog
      open={props.id != null}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={dialogTitle}
      description={dialogDescription}
      contentClassName='sm:max-w-6xl'
      contentHeight='auto'
      bodyClassName='space-y-4 max-h-[82vh] overflow-y-auto pr-1'
    >
      {query.isError ? (
        <div className='flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'>
          <TriangleAlert className='size-4 shrink-0' />
          <span>{t('The monitor could not refresh.')}</span>
        </div>
      ) : null}

      {probe ? (
        <>
          {/* Interactive drawing preview frame if this is a drawing probe */}
          {probe.kind === 'drawing' && drawingHTML ? (
            <div className='relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border/80 bg-muted/20 shadow-xs'>
              <DrawingFrame html={drawingHTML} title={t('Drawing preview')} />
            </div>
          ) : null}

          {/* Status banner */}
          <div className='flex flex-wrap items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm'>
            <StatusBadge status={probe.status} label={statusLabel} />
            {probe.kind === 'logic' ? (
              <span className='font-medium text-foreground'>
                {t('Answer {{answer}} (correct answer {{expected}})', {
                  answer: probe.answer || '—',
                  expected: probe.expected || '21',
                })}
              </span>
            ) : (
              <span className='font-medium text-foreground'>
                {[probe.subject, probe.vehicle, probe.scene]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </div>

          {/* Prompt card */}
          <div className='rounded-lg border border-border/60 bg-card p-3'>
            <div className='mb-2 flex items-center justify-between'>
              <p className='text-xs font-medium text-muted-foreground'>
                {t('Evaluation prompt sent to model')}
              </p>
              <CopyButton value={probe.prompt} size='sm' />
            </div>
            <pre className='max-h-44 overflow-auto rounded-md bg-muted/40 p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground font-mono'>
              {probe.prompt}
            </pre>
          </div>

          {/* Stats grid */}
          <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-4'>
            <StatTile label={t('Latency')} value={formatDuration(probe.latency_ms)} />
            <StatTile label={t('First token')} value={formatDuration(probe.ttft_ms)} />
            <StatTile
              label='TOKEN'
              value={`${formatNumber(probe.input_tokens, locale)} / ${formatNumber(probe.output_tokens, locale)}`}
            />
            <StatTile label={t('Attempts')} value={String(probe.attempts || 0)} />
          </div>

          {/* Model info and reasoning */}
          <div className='flex flex-wrap items-center gap-3 text-xs'>
            <span className='text-muted-foreground'>{t('Reasoning strength')}:</span>
            <span className='rounded bg-muted px-2 py-0.5 font-medium uppercase text-foreground'>
              {probe.reasoning || 'medium'}
            </span>
          </div>

          {/* Error if present */}
          {probe.error ? (
            <div className='flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300'>
              <TriangleAlert className='size-4 shrink-0' />
              <span>{probe.error}</span>
            </div>
          ) : null}

          {/* Model reply accordion */}
          <div className='rounded-lg border border-border/60 bg-card p-3'>
            <div className='flex items-center justify-between'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => setReplyOpen((open) => !open)}
                className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground'
              >
                {replyOpen ? <ChevronUp className='size-3.5' /> : <ChevronDown className='size-3.5' />}
                <span>
                  {replyOpen
                    ? t('Collapse model reply')
                    : t('View model reply ({{count}} characters)', {
                        count: formatNumber(replyCount, locale),
                      })}
                </span>
              </Button>
              {replyOpen && probe.reply ? (
                <CopyButton value={probe.reply} size='sm' />
              ) : null}
            </div>
            {replyOpen ? (
              <pre className='mt-2.5 max-h-80 overflow-auto rounded-md bg-muted/40 p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground font-mono'>
                {probe.reply || t('No reply recorded')}
              </pre>
            ) : null}
          </div>
        </>
      ) : null}
    </Dialog>
  )
}
