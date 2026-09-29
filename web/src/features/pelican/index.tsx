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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import {
  Activity,
  Clock,
  RefreshCw,
  Timer,
  TriangleAlert,
} from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { fetchPelicanMonitor, type PelicanWindow } from './api'
import { formatClock, formatCountdown, formatPercent } from './format'
import { MonitorGroupCard } from './group-card'
import { ProbeDialog } from './probe-dialog'

const RANGES: PelicanWindow[] = ['24h', '3d']

const LEGEND_ITEMS = [
  { status: 'pass', key: 'Passed', color: 'bg-emerald-500' },
  { status: 'fail', key: 'Failed', color: 'bg-rose-500' },
  { status: 'error', key: 'Request failed', color: 'bg-amber-400' },
  { status: 'running', key: 'Checking', color: 'bg-blue-500 animate-pulse' },
  { status: 'empty', key: 'No data', color: 'bg-neutral-300 dark:bg-neutral-700' },
] as const

function statusText(status: string, labelFor: (key: string) => string) {
  if (status === 'pass') return labelFor('Passed')
  if (status === 'fail') return labelFor('Failed')
  if (status === 'error') return labelFor('Request failed')
  if (status === 'running') return labelFor('Checking')
  if (status === 'now') return labelFor('Now')
  if (status === 'avg') return labelFor('avg')
  if (status === 'reasoning') return labelFor('Reasoning')
  return labelFor('No data')
}

function healthText(health: string, labelFor: (key: string) => string) {
  if (health === 'normal') return labelFor('At full strength')
  if (health === 'degraded') return labelFor('Possibly degraded')
  return labelFor('No data')
}

export function PelicanGallery() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [range, setRange] = useState<PelicanWindow>('24h')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedTitle, setSelectedTitle] = useState('')

  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )

  const query = useQuery({
    queryKey: ['pelican-monitor', range],
    queryFn: ({ signal }) => fetchPelicanMonitor(range, signal),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    meta: { errorToast: false },
  })

  const refetch = query.refetch

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) void refetch()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refetch])

  const data = query.data
  const rangeLabel = range === '3d' ? t('Last 3 days') : t('Last 24 hours')

  const openProbe = (id: number, title: string) => {
    setSelectedTitle(title)
    setSelectedId(id)
  }

  const passRatePercent = Math.round((data?.logic_pass_rate ?? 0) * 100)

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Degradation monitor')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex items-center gap-2'>
          <div
            className='flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5'
            role='group'
            aria-label={rangeLabel}
          >
            {RANGES.map((item) => {
              const isActive = item === range
              return (
                <Button
                  key={item}
                  type='button'
                  size='xs'
                  variant={isActive ? 'secondary' : 'ghost'}
                  aria-pressed={isActive}
                  className={cn(
                    'h-7 rounded-md px-3 text-xs font-medium transition-all',
                    isActive
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setRange(item)}
                >
                  {item}
                </Button>
              )
            })}
          </div>

          <Button
            type='button'
            size='icon-sm'
            variant='outline'
            disabled={query.isFetching}
            aria-label={t('Refresh monitor')}
            onClick={() => void query.refetch()}
            className='h-8 w-8'
          >
            <RefreshCw className={cn('size-3.5', query.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </SectionPageLayout.Actions>

      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-[90rem] flex-col gap-4'>
          {/* Subheader bar */}
          <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
            <p className='text-sm text-muted-foreground'>
              {t('Automated scheduled probes verifying model integrity and reasoning quality.')}
            </p>
            <div className='flex items-center gap-1.5 tabular-nums text-muted-foreground/80'>
              <Clock className='size-3.5' />
              <span>
                {t('Updated at {{time}} · refreshes every 30 seconds', {
                  time: data ? formatClock(data.updated_at, locale) : '--:--:--',
                })}
              </span>
            </div>
          </div>

          {/* Error Alert */}
          {query.isError ? (
            <Alert variant='destructive'>
              <TriangleAlert />
              <AlertTitle>{t('The monitor could not refresh.')}</AlertTitle>
              <AlertDescription>{t('No data')}</AlertDescription>
              <AlertAction>
                <Button
                  type='button'
                  variant='outline'
                  size='xs'
                  onClick={() => void query.refetch()}
                >
                  {t('Reconnect')}
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {/* Pending Skeleton */}
          {query.isPending && !data ? (
            <div className='space-y-4'>
              <Skeleton className='h-40 rounded-xl' />
              <Skeleton className='h-64 rounded-xl' />
              <Skeleton className='h-64 rounded-xl' />
            </div>
          ) : null}

          {/* Turned off empty state for non-root users */}
          {data && !data.enabled && !isRoot ? (
            <EmptyState title={t('The monitor is turned off.')} bordered />
          ) : null}

          {/* Main Dashboard */}
          {data && (data.enabled || isRoot) ? (
            <>
              {/* Overview Hero Card */}
              <section className='grid gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-xs lg:grid-cols-[minmax(0,1fr)_260px]'>
                <div className='flex gap-4'>
                  <div className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                    <Activity className='size-5' />
                  </div>
                  <div className='flex flex-col gap-1.5'>
                    <h2 className='text-base font-semibold tracking-tight text-foreground'>
                      {t('Real-time Model Integrity & Full-Strength Assurance')}
                    </h2>
                    <p className='text-xs leading-relaxed text-muted-foreground'>
                      {t(
                        'Every 10 minutes, each monitored group receives a calibrated reasoning puzzle and a random drawing task aligned with Codex benchmarks. Degraded or compressed models fail the logic test. Click any block to inspect details.'
                      )}
                    </p>
                    <div className='mt-2 flex flex-wrap items-center gap-3 text-xs'>
                      <span className='inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400'>
                        <span className='size-2 rounded-full bg-emerald-500' />
                        {t('{{count}} at full strength', { count: data.summary.normal })}
                      </span>
                      <span className='inline-flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400'>
                        <span className='size-2 rounded-full bg-rose-500' />
                        {t('{{count}} possibly degraded', { count: data.summary.degraded })}
                      </span>
                      <span className='inline-flex items-center gap-1.5 text-muted-foreground'>
                        <span className='size-2 rounded-full bg-muted-foreground/40' />
                        {t('{{count}} with no data', { count: data.summary.empty })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className='flex flex-col justify-between border-t pt-3 border-border/60 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5'>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      {t('Reasoning pass rate · {{range}}', { range: rangeLabel })}
                    </p>
                    <p className='mt-1 text-3xl font-bold tracking-tight text-foreground tabular-nums'>
                      {formatPercent(data.logic_pass_rate)}
                    </p>
                    <div className='mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                      <div
                        className='h-full rounded-full bg-primary transition-all duration-300'
                        style={{ width: `${passRatePercent}%` }}
                      />
                    </div>
                  </div>
                  <div className='mt-3 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums'>
                    <Timer className='size-3.5 text-muted-foreground/80' />
                    <span>
                      {t('Next probe in {{time}}', {
                        time: formatCountdown(data.next_slot_at, nowMs),
                      })}
                    </span>
                  </div>
                </div>
              </section>

              {/* Status Legend */}
              <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground'>
                <ul className='flex flex-wrap items-center gap-3.5'>
                  {LEGEND_ITEMS.map((item) => (
                    <li key={item.status} className='flex items-center gap-1.5'>
                      <span className={cn('size-2.5 rounded-xs', item.color)} />
                      <span>{t(item.key)}</span>
                    </li>
                  ))}
                </ul>
                <p className='text-[11px] text-muted-foreground/80'>
                  {t('Each block is one 30-minute check.')}
                </p>
              </div>

              {/* Groups List */}
              {data.groups.length === 0 ? (
                <EmptyState
                  title={t(
                    'No monitored groups yet. A group appears here once it has an enabled channel.'
                  )}
                  bordered
                />
              ) : (
                <div className='space-y-4'>
                  {data.groups.map((group) => {
                    const title =
                      group.description && group.description !== group.name
                        ? group.description
                        : group.name
                    return (
                      <MonitorGroupCard
                        key={group.name}
                        group={group}
                        locale={locale}
                        nowSec={Math.floor(nowMs / 1000)}
                        onOpen={(id) => openProbe(id, title)}
                        labels={{
                          health: (health) => healthText(health, t),
                          status: (status) => statusText(status, t),
                          logic: t('Logic test'),
                          logicHint: t('The answer should be {{answer}}', {
                            answer: data.logic_answer || '21',
                          }),
                          drawing: t('Drawing test'),
                          drawingHint: t(
                            'Random SVG or Canvas of Obama, Sun Wukong, Ultraman, a pelican, or a polar bear'
                          ),
                          correct: t('{{passed}}/{{total}} correct', {
                            passed: group.logic.passed,
                            total: group.logic.judged,
                          }),
                          drawn: t('{{passed}}/{{total}} drawn', {
                            passed: group.drawing.passed,
                            total: group.drawing.judged,
                          }),
                          waiting: t('Awaiting first scheduled check'),
                          ago: (unix) => {
                            const minutes = Math.max(
                              0,
                              Math.floor((Math.floor(nowMs / 1000) - unix) / 60)
                            )
                            if (minutes < 1) return t('Just now')
                            return t('{{count}} minutes ago', { count: minutes })
                          },
                          block: (status) => statusText(status, t),
                          noToken: t(
                            'This group has no enabled token yet. Checks start automatically when a token for this group is enabled.'
                          ),
                          caption: t(
                            'Select any drawing block on the left to replay its animation in the isolated sandbox.'
                          ),
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Dialog for details */}
        <ProbeDialog
          id={selectedId}
          title={selectedTitle}
          onClose={() => setSelectedId(null)}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
