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

import { Dialog } from '@/components/dialog'
import { Images, Maximize2, RefreshCw, TriangleAlert } from '@/components/icons'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { fetchPelicanRuns, type PelicanRun } from './api'
import { PelicanPreview } from './preview'

const DEFAULT_LIMIT = 30
const MAX_EMPTY_SLOTS = 60
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

function pelicanStatus(status: string, labelFor: (key: string) => string) {
  switch (status) {
    case 'success':
      return {
        label: labelFor('Generation completed'),
        variant: 'success' as StatusVariant,
      }
    case 'running':
      return {
        label: labelFor('Drawing in progress'),
        variant: 'info' as StatusVariant,
      }
    case 'failed':
      return {
        label: labelFor('Generation failed'),
        variant: 'danger' as StatusVariant,
      }
    case 'interrupted':
      return {
        label: labelFor('Generation interrupted'),
        variant: 'warning' as StatusVariant,
      }
    default:
      return { label: status, variant: 'neutral' as StatusVariant }
  }
}

function shanghaiClock(startedAt: number, locale?: string) {
  const value = new Date(startedAt * 1000)
  if (Number.isNaN(value.getTime())) {
    return { time: '--:--:--', date: '-- --', iso: '' }
  }
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value)
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: SHANGHAI_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const day = parts.find((part) => part.type === 'day')?.value ?? ''
  return { time, date: `${month}-${day}`, iso: value.toISOString() }
}

function runTitle(run: PelicanRun, fallback: string) {
  const title = run.title?.trim()
  return title ? title : fallback
}

function placeholderCopy(run: PelicanRun, labelFor: (key: string) => string) {
  if (run.status === 'running') return labelFor('Turning the prompt into a frame')
  if (run.error?.trim()) return run.error
  return labelFor('This round did not produce a complete frame')
}

export function PelicanGallery() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['pelican-runs'],
    queryFn: ({ signal }) => fetchPelicanRuns(signal),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    meta: { errorToast: false },
  })

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) void refetch()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refetch])

  const runs = (data?.runs ?? []).filter(
    (run) => Number.isSafeInteger(run.id) && run.id > 0
  )
  const reportedLimit =
    typeof data?.limit === 'number' &&
    Number.isFinite(data.limit) &&
    data.limit > 0
      ? Math.floor(data.limit)
      : DEFAULT_LIMIT
  const emptyCount = data
    ? Math.min(MAX_EMPTY_SLOTS, Math.max(0, reportedLimit - runs.length))
    : 0
  const selected = runs.find((run) => run.id === selectedId) ?? null
  const fallbackTitle = t('Pelican riding a bicycle')

  useEffect(() => {
    if (selectedId == null || !data) return
    if (!runs.some((run) => run.id === selectedId)) setSelectedId(null)
  }, [data, runs, selectedId])

  let alertTitle = t('Preview unavailable')
  let alertDescription: string | null = null
  if (runs.length > 0) {
    alertTitle = t(
      'The gallery could not refresh. Frames already shown are still available.'
    )
    alertDescription = t('Preview unavailable')
  }

  const selectedTitle = selected ? runTitle(selected, fallbackTitle) : ''
  const selectedClock = selected
    ? shanghaiClock(selected.started_at, locale)
    : null

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Pelican gallery')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={isFetching}
          aria-label={t('Refresh gallery')}
          title={t('Refresh the gallery without starting a generation')}
          onClick={() => void refetch()}
        >
          <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-6xl flex-col gap-4'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='text-sm font-medium'>{t('Live gallery')}</h2>
            <p className='text-muted-foreground text-sm tabular-nums'>
              {runs.length} / {data ? reportedLimit : DEFAULT_LIMIT}
            </p>
          </div>

          {isError ? (
            <Alert variant='destructive'>
              <TriangleAlert />
              <AlertTitle>{alertTitle}</AlertTitle>
              {alertDescription ? (
                <AlertDescription>{alertDescription}</AlertDescription>
              ) : null}
              <AlertAction>
                <Button
                  type='button'
                  variant='outline'
                  size='xs'
                  onClick={() => void refetch()}
                >
                  {t('Reconnect')}
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {isPending && !data ? (
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {['s1', 's2', 's3', 's4', 's5', 's6'].map((key) => (
                <Skeleton key={key} className='aspect-[4/3] rounded-xl' />
              ))}
            </div>
          ) : null}

          {data ? (
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {runs.map((run, index) => {
                const title = runTitle(run, fallbackTitle)
                const clock = shanghaiClock(run.started_at, locale)
                const status = pelicanStatus(run.status, t)
                const previewTitle = t('{{title}}, run {{id}}', {
                  title,
                  id: run.id,
                })
                const previewSrc = `/api/pelican/runs/${run.id}/preview`
                return (
                  <Card
                    key={run.id}
                    className='relative gap-0 overflow-hidden py-0'
                  >
                    {run.status === 'success' ? (
                      <div className='relative'>
                        <PelicanPreview src={previewSrc} title={previewTitle} />
                        <Button
                          type='button'
                          variant='ghost'
                          className='absolute inset-0 z-10 h-auto rounded-none p-0 hover:bg-transparent'
                          aria-label={t(
                            'View enlarged animation for {{title}} at {{date}} {{time}}',
                            { title, date: clock.date, time: clock.time }
                          )}
                          onClick={() => setSelectedId(run.id)}
                        >
                          <Maximize2 className='absolute top-2 right-2' />
                        </Button>
                      </div>
                    ) : (
                      <div className='bg-muted flex aspect-[4/3] flex-col items-center justify-center gap-3 px-4 text-center'>
                        <StatusBadge
                          label={status.label}
                          variant={status.variant}
                          copyable={false}
                        />
                        <p className='text-muted-foreground text-sm'>
                          {placeholderCopy(run, t)}
                        </p>
                        {run.status === 'running' ? (
                          <span className='bg-primary/70 h-0.5 w-16' />
                        ) : null}
                      </div>
                    )}
                    {index === 0 ? (
                      <StatusBadge
                        label={t('Latest')}
                        variant='info'
                        copyable={false}
                        className='pointer-events-none absolute top-2 left-2 z-20'
                      />
                    ) : null}
                    <div className='flex flex-col gap-2 p-4'>
                      <div className='flex items-center justify-between gap-2'>
                        <time dateTime={clock.iso || undefined}>{clock.time}</time>
                        <span className='text-muted-foreground'>{clock.date}</span>
                      </div>
                      {run.groups && run.groups.length > 0 ? (
                        <div className='flex flex-wrap gap-1'>
                          {run.groups.map((group) => (
                            <Badge key={group.id} variant='secondary'>
                              {group.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className='flex items-center justify-between gap-2'>
                        <StatusBadge
                          label={status.label}
                          variant={status.variant}
                          copyable={false}
                        />
                        <span className='min-w-0 truncate'>{title}</span>
                      </div>
                      {typeof run.total_tokens === 'number' &&
                      Number.isFinite(run.total_tokens) ? (
                        <p className='text-muted-foreground text-xs'>
                          {t('{{count}} tokens', {
                            count: formatNumber(run.total_tokens, locale),
                          })}
                        </p>
                      ) : null}
                    </div>
                  </Card>
                )
              })}
              {Array.from({ length: emptyCount }, (_, index) => (
                <Card
                  key={`empty-${index}`}
                  className='gap-0 overflow-hidden py-0'
                >
                  <div className='bg-muted text-muted-foreground flex aspect-[4/3] flex-col items-center justify-center gap-3 px-4 text-center'>
                    <span className='text-2xl font-medium tabular-nums'>
                      {String(runs.length + index + 1).padStart(2, '0')}
                    </span>
                    <Images />
                    <p className='text-sm'>{t('Waiting for the next frame')}</p>
                  </div>
                  <p className='text-muted-foreground px-4 py-3 text-sm'>
                    {t('New frames will appear here automatically')}
                  </p>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
        {selected && selectedClock ? (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setSelectedId(null)
            }}
            title={selectedTitle}
            description={`${selectedClock.date} ${selectedClock.time}`}
            contentClassName='sm:max-w-5xl'
            contentHeight='auto'
            bodyClassName='space-y-4'
          >
            <PelicanPreview
              src={`/api/pelican/runs/${selected.id}/preview`}
              title={t('{{title}}, run {{id}}', {
                title: selectedTitle,
                id: selected.id,
              })}
              interactive
            />
            <div className='flex flex-wrap items-center gap-2'>
              <StatusBadge
                label={pelicanStatus(selected.status, t).label}
                variant={pelicanStatus(selected.status, t).variant}
                copyable={false}
              />
              {(selected.groups ?? []).map((group) => (
                <Badge key={group.id} variant='secondary'>
                  {group.name}
                </Badge>
              ))}
            </div>
          </Dialog>
        ) : null}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
