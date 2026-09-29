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
import { useState, type ReactNode } from 'react'

import { BrainIcon, CpuIcon, Palette, TriangleAlert } from '@/components/icons'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { PelicanGroupCard, PelicanPanel } from './api'
import { ProbeBlocks } from './blocks'
import { DrawingStage } from './drawing-frame'
import { formatDuration, formatPercent, formatRatio } from './format'

function HealthBadge(props: { health: string; label: string }) {
  if (props.health === 'normal') {
    return (
      <span className='inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400'>
        <span className='size-1.5 rounded-full bg-emerald-500' />
        {props.label}
      </span>
    )
  }
  if (props.health === 'degraded') {
    return (
      <span className='inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400'>
        <span className='size-1.5 rounded-full bg-rose-500' />
        {props.label}
      </span>
    )
  }
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground'>
      <span className='size-1.5 rounded-full bg-muted-foreground/40' />
      {props.label}
    </span>
  )
}

function getRateColor(rate: number | null) {
  if (rate == null) return 'text-muted-foreground'
  if (rate >= 0.95) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 0.7) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function KindSection(props: {
  icon: ReactNode
  title: string
  hint: string
  panel: PelicanPanel
  countLabel: string
  locale?: string
  nowSec: number
  statusLabel: (status: string) => string
  waitingLabel: string
  agoLabel: (unix: number) => string
  blockLabel: (status: string) => string
  onOpen: (id: number) => void
  selectedId?: number | null
}) {
  const latest = props.panel.latest
  const passRate =
    props.panel.judged > 0 ? props.panel.passed / props.panel.judged : null

  return (
    <section className='flex flex-col gap-2 rounded-xl border border-border/50 bg-card/60 p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='text-muted-foreground'>{props.icon}</span>
          <span className='shrink-0 whitespace-nowrap text-sm font-semibold'>{props.title}</span>
          <span className='hidden min-w-0 flex-1 truncate text-xs text-muted-foreground/80 sm:inline'>
            {props.hint}
          </span>
        </div>
        {latest ? (
          <p className='shrink-0 text-xs text-muted-foreground'>
            <span className='text-emerald-500'>● </span>
            {props.statusLabel(latest.status)} · {props.agoLabel(latest.created_at || props.nowSec)}
          </p>
        ) : (
          <p className='shrink-0 text-xs text-muted-foreground'>{props.waitingLabel}</p>
        )}
      </div>

      <div className='flex flex-wrap items-baseline gap-3'>
        <span className={cn('text-2xl font-bold tabular-nums', getRateColor(passRate))}>
          {formatPercent(passRate)}
        </span>
        <span className='text-xs font-medium text-muted-foreground'>
          {props.countLabel}
        </span>
        {props.panel.avg_latency_ms > 0 ? (
          <span className='text-xs text-muted-foreground/80 tabular-nums'>
            {props.statusLabel('avg')} {formatDuration(props.panel.avg_latency_ms)}
          </span>
        ) : null}
      </div>

      <ProbeBlocks
        slots={props.panel.slots}
        locale={props.locale}
        labelFor={props.blockLabel}
        selectedId={props.selectedId}
        onOpen={props.onOpen}
      />
    </section>
  )
}

export function MonitorGroupCard(props: {
  group: PelicanGroupCard
  locale?: string
  nowSec: number
  labels: {
    health: (health: string) => string
    status: (status: string) => string
    logic: string
    logicHint: string
    drawing: string
    drawingHint: string
    correct: string
    drawn: string
    waiting: string
    ago: (unix: number) => string
    block: (status: string) => string
    noToken: string
    caption: string
  }
  onOpen: (id: number) => void
}) {
  const hasDistinctDescription =
    Boolean(props.group.description) && props.group.description !== props.group.name
  const displayTitle = hasDistinctDescription
    ? props.group.description
    : props.group.name

  const [pickedDrawingId, setPickedDrawingId] = useState<number | null>(null)
  const activeDrawingId = pickedDrawingId ?? props.group.drawing.latest?.id ?? null

  return (
    <Card className='gap-0 overflow-hidden border-border/70 p-0 shadow-xs'>
      <div className='grid items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_520px] lg:gap-6'>
        {/* Left column: Group info + logic test + drawing test */}
        <div className='flex min-w-0 flex-col gap-4'>
          {/* Header row */}
          <div className='flex flex-col gap-2'>
            <div className='flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5'>
              <h3 className='text-base font-semibold text-foreground tracking-tight'>
                {displayTitle}
              </h3>
              {hasDistinctDescription ? (
                <span className='rounded bg-muted/60 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground'>
                  {props.group.name}
                </span>
              ) : null}
              {props.group.model ? (
                <span className='inline-flex items-center gap-1 rounded-md border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400'>
                  <CpuIcon className='size-3.5' />
                  {props.group.model}
                </span>
              ) : null}
              <span className='rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase text-muted-foreground'>
                {props.labels.status('reasoning')} {props.group.reasoning || 'medium'}
              </span>
              <span className='rounded-md bg-muted/60 px-2 py-0.5 text-xs tabular-nums text-muted-foreground'>
                {formatRatio(props.group.ratio)}
              </span>
              <HealthBadge
                health={props.group.health}
                label={props.labels.health(props.group.health)}
              />
            </div>

            {!props.group.has_key ? (
              <div className='flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300'>
                <TriangleAlert className='size-4 shrink-0' />
                <span>{props.labels.noToken}</span>
              </div>
            ) : null}
          </div>

          {/* Logic test section */}
          <KindSection
            icon={<BrainIcon className='size-4 text-primary' />}
            title={props.labels.logic}
            hint={props.labels.logicHint}
            panel={props.group.logic}
            countLabel={props.labels.correct}
            locale={props.locale}
            nowSec={props.nowSec}
            statusLabel={props.labels.status}
            waitingLabel={props.labels.waiting}
            agoLabel={props.labels.ago}
            blockLabel={props.labels.block}
            onOpen={props.onOpen}
          />

          {/* Drawing test section: clicking block only selects drawing without opening dialog */}
          <KindSection
            icon={<Palette className='size-4 text-primary' />}
            title={props.labels.drawing}
            hint={props.labels.drawingHint}
            panel={props.group.drawing}
            countLabel={props.labels.drawn}
            locale={props.locale}
            nowSec={props.nowSec}
            statusLabel={props.labels.status}
            waitingLabel={props.labels.waiting}
            agoLabel={props.labels.ago}
            blockLabel={props.labels.block}
            selectedId={activeDrawingId}
            onOpen={(id) => {
              setPickedDrawingId(id)
            }}
          />
        </div>

        {/* Right column: Sandbox drawing preview stage. Clicking the sandbox opens the dialog. */}
        <div className='flex min-h-0 min-w-0 flex-col rounded-xl border border-border/50 bg-card/60 p-3'>
          <DrawingStage
            probeId={activeDrawingId}
            locale={props.locale}
            waitingLabel={props.labels.waiting}
            onOpen={(id) => {
              props.onOpen(id)
            }}
          />
          <p className='mt-2.5 text-xs leading-relaxed text-muted-foreground'>
            {props.labels.caption}
          </p>
        </div>
      </div>
    </Card>
  )
}
