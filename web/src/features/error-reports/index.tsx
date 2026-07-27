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
import { useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

import { getErrorStat } from './api'

const RANGE_PRESETS = [
  { value: '6h', hours: 6 },
  { value: '24h', hours: 24 },
  { value: '3d', hours: 72 },
  { value: '7d', hours: 168 },
  { value: '30d', hours: 720 },
] as const

const CHART_CONFIG = {
  count: { label: 'Errors', color: '#ef4444' },
} satisfies ChartConfig

const AUTO_REFRESH_MS = 5 * 60 * 1000

function parseErrorLabel(content: string): string {
  const m = content.match(/status_code=(\d+)/)
  let status = ''
  let rest = content
  if (m) {
    status = m[1]
    rest = content.slice(content.indexOf(m[0]) + m[0].length)
  }
  rest = rest.replace(/^[\s,，]+/, '')
  const cut = Math.min(
    ...[':', '(', '：', '（'].map((ch) => {
      const i = rest.indexOf(ch)
      return i === -1 ? rest.length : i
    })
  )
  let reason = rest.slice(0, cut).trim()
  if (!reason) reason = content
  reason = reason.slice(0, 80)
  return status ? `${status} · ${reason}` : reason
}

interface BreakdownItem {
  id: string
  label: string
  title?: string
  count: number
}

function BreakdownCard({
  title,
  description,
  items,
  emptyText,
  onSelect,
}: {
  title: string
  description: string
  items: BreakdownItem[]
  emptyText: string
  onSelect: (item: BreakdownItem) => void
}) {
  const max = items.reduce((acc, it) => Math.max(acc, it.count), 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{emptyText}</p>
        ) : (
          <ul className='flex flex-col gap-2'>
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type='button'
                  onClick={() => onSelect(it)}
                  className='hover:bg-muted/50 w-full rounded-md px-2 py-1 text-left transition-colors'
                >
                  <div className='flex items-center justify-between gap-2 text-sm'>
                    <span className='truncate' title={it.title ?? it.label}>
                      {it.label}
                    </span>
                    <span className='text-muted-foreground tabular-nums'>
                      {it.count.toLocaleString()}
                    </span>
                  </div>
                  <div className='bg-muted mt-1 h-1.5 w-full rounded'>
                    <div
                      className='bg-destructive h-1.5 rounded'
                      style={{ width: `${(it.count / max) * 100}%` }}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function ErrorReports() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rangeKey, setRangeKey] = useState<string>('24h')
  const [tick, setTick] = useState(0)

  const { startSec, endSec } = useMemo(() => {
    const hours = RANGE_PRESETS.find((p) => p.value === rangeKey)?.hours ?? 24
    const end = Math.floor(Date.now() / 1000)
    return { startSec: end - hours * 3600, endSec: end }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, tick])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['error-reports', startSec, endSec],
    queryFn: async () => (await getErrorStat(startSec, endSec)).data,
    placeholderData: (prev) => prev,
    refetchInterval: AUTO_REFRESH_MS,
  })

  const trendData = useMemo(() => {
    const bucket = data?.bucket_seconds ?? 3600
    const fmt = bucket < 86400 ? 'MM-DD HH:mm' : 'MM-DD'
    return (data?.trend ?? []).map((p) => ({
      label: dayjs.unix(p.bucket).format(fmt),
      count: p.count,
    }))
  }, [data])

  const drill = (extra: Record<string, string>) => {
    void navigate({
      to: '/usage-logs/$section',
      params: { section: 'common' },
      search: { type: ['5'], ...extra },
    })
  }

  const modelItems: BreakdownItem[] = (data?.by_model ?? []).map((r) => ({
    id: r.name || '__empty__',
    label: r.name || t('(unknown)'),
    count: r.count,
  }))
  const channelItems: BreakdownItem[] = (data?.by_channel ?? []).map((r) => ({
    id: String(r.channel),
    label: r.name ? `${r.name} (#${r.channel})` : `#${r.channel}`,
    count: r.count,
  }))
  const typeItems: BreakdownItem[] = (data?.by_content ?? []).map((r, i) => ({
    id: `${i}`,
    label: parseErrorLabel(r.name),
    title: r.name,
    count: r.count,
  }))

  const summary = [
    { label: t('Total errors'), value: data?.total ?? 0 },
    { label: t('Models affected'), value: modelItems.length },
    { label: t('Channels affected'), value: channelItems.length },
    { label: t('Error types'), value: typeItems.length },
  ]

  const hasData = (data?.total ?? 0) > 0

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Error Reports')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex items-center gap-1 rounded-lg border p-1'>
              {RANGE_PRESETS.map((p) => (
                <Button
                  key={p.value}
                  size='sm'
                  variant={rangeKey === p.value ? 'secondary' : 'ghost'}
                  onClick={() => setRangeKey(p.value)}
                >
                  {p.value}
                </Button>
              ))}
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setTick((v) => v + 1)
                void refetch()
              }}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${isFetching ? 'animate-spin' : ''}`}
              />
              {t('Refresh')}
            </Button>
          </div>

          {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

          {!isLoading && (
            <>
              <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
                {summary.map((s) => (
                  <Card key={s.label}>
                    <CardHeader className='pb-2'>
                      <CardDescription>{s.label}</CardDescription>
                      <CardTitle className='text-2xl tabular-nums'>
                        {s.value.toLocaleString()}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </div>

              {!hasData ? (
                <Empty className='min-h-64 border'>
                  <EmptyHeader>
                    <EmptyTitle>
                      {t('No request records in the selected time range')}
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('Error trend')}</CardTitle>
                      <CardDescription>
                        {t('Number of request errors over time')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={CHART_CONFIG}
                        className='aspect-auto h-64 w-full'
                      >
                        <AreaChart data={trendData}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey='label'
                            tickLine={false}
                            axisLine={false}
                            minTickGap={24}
                          />
                          <YAxis
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                            width={32}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Area
                            dataKey='count'
                            type='monotone'
                            stroke='var(--color-count)'
                            fill='var(--color-count)'
                            fillOpacity={0.2}
                          />
                        </AreaChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
                    <BreakdownCard
                      title={t('By error type')}
                      description={t('Click a row to view matching logs')}
                      items={typeItems}
                      emptyText={t('No data')}
                      onSelect={(it) => drill({ filter: it.title ?? it.label })}
                    />
                    <BreakdownCard
                      title={t('By model')}
                      description={t('Click a row to view matching logs')}
                      items={modelItems}
                      emptyText={t('No data')}
                      onSelect={(it) =>
                        drill(it.id === '__empty__' ? {} : { model: it.id })
                      }
                    />
                    <BreakdownCard
                      title={t('By channel')}
                      description={t('Click a row to view matching logs')}
                      items={channelItems}
                      emptyText={t('No data')}
                      onSelect={(it) => drill({ channel: it.id })}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
