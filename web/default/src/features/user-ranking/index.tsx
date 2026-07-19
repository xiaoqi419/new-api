/*
Copyright (C) 2025 QuantumNous

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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/date-picker'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import dayjs from '@/lib/dayjs'
import { formatNumber, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import { getUserRanking } from './api'
import { USER_RANKING_DIMENSIONS } from './constants'
import type { UserRankingDimension } from './types'

const rankBadgeClass: Record<number, string> = {
  1: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  2: 'bg-zinc-400/15 text-zinc-600 dark:text-zinc-300',
  3: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
}

function RankCell({ rank }: { rank: number }) {
  const badge = rankBadgeClass[rank]
  if (badge) {
    return (
      <span
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
          badge
        )}
      >
        {rank}
      </span>
    )
  }
  return <span className='text-muted-foreground pl-2 tabular-nums'>{rank}</span>
}

export function UserRanking() {
  const { t } = useTranslation()
  const [activeKey, setActiveKey] = useState<UserRankingDimension>('quota')
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  })

  const dimensions = useMemo(
    () => ({
      quota: {
        tab: t('User Consumption'),
        valueTitle: t('Consumed Quota'),
        render: (v: number) => formatQuota(v),
        showIp: false,
      },
      requests: {
        tab: t('Requests'),
        valueTitle: t('Request Count'),
        render: (v: number) => formatNumber(v),
        showIp: false,
      },
      tokens: {
        tab: t('Token Usage'),
        valueTitle: t('Tokens'),
        render: (v: number) => formatNumber(v),
        showIp: false,
      },
      ip_count: {
        tab: t('User IP Count'),
        valueTitle: t('IP Count'),
        render: (v: number) => formatNumber(v),
        showIp: false,
      },
      ip_per_minute: {
        tab: t('IPs per Minute'),
        valueTitle: t('IPs within one minute'),
        render: (v: number) => formatNumber(v),
        showIp: true,
      },
    }),
    [t]
  )

  const current = dimensions[activeKey]

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['user-ranking', activeKey, range.start, range.end],
    queryFn: async () => {
      const res = await getUserRanking(activeKey, range.start, range.end)
      return res.data?.items ?? []
    },
    placeholderData: (prev) => prev,
  })
  const rows = data ?? []

  const applyRange = () => {
    setRange({
      start: startDate ? Math.floor(startDate.getTime() / 1000) : 0,
      end: endDate ? Math.floor(endDate.getTime() / 1000) : 0,
    })
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('User Ranking')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <Alert>
            <AlertDescription>
              {t(
                'User consumption leaderboard to quickly spot user behavior and resource usage.'
              )}
            </AlertDescription>
          </Alert>

          <div className='flex flex-wrap items-center gap-3'>
            <DatePicker
              selected={startDate}
              onSelect={setStartDate}
              placeholder={t('Start time')}
            />
            <DatePicker
              selected={endDate}
              onSelect={setEndDate}
              placeholder={t('End time')}
            />
            <Button onClick={applyRange} disabled={isFetching}>
              {t('Query')}
            </Button>
          </div>

          <Tabs
            value={activeKey}
            onValueChange={(value) =>
              setActiveKey(value as UserRankingDimension)
            }
          >
            <TabsList>
              {USER_RANKING_DIMENSIONS.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {dimensions[key].tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {current.showIp && (
            <Alert className='border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50'>
              <AlertDescription>
                {t(
                  'Realtime monitoring: shows users who used multiple IPs within the window, to detect abnormal behavior.'
                )}
              </AlertDescription>
            </Alert>
          )}

          {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

          {!isLoading && rows.length === 0 && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>{t('No data')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && rows.length > 0 && (
            <div className='rounded-xl border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-20'>{t('Rank')}</TableHead>
                    <TableHead className='w-20'>{t('User ID')}</TableHead>
                    <TableHead>{t('Username')}</TableHead>
                    <TableHead>{current.valueTitle}</TableHead>
                    {current.showIp && <TableHead>{t('Time')}</TableHead>}
                    {current.showIp && <TableHead>{t('IP')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={row.user_id}>
                      <TableCell>
                        <RankCell rank={index + 1} />
                      </TableCell>
                      <TableCell className='text-muted-foreground font-mono'>
                        {row.user_id}
                      </TableCell>
                      <TableCell>{row.username}</TableCell>
                      <TableCell className='tabular-nums'>
                        {current.render(row.value)}
                      </TableCell>
                      {current.showIp && (
                        <TableCell className='text-muted-foreground'>
                          {row.last_time
                            ? dayjs(row.last_time * 1000).format(
                                'YYYY-MM-DD HH:mm:ss'
                              )
                            : '-'}
                        </TableCell>
                      )}
                      {current.showIp && (
                        <TableCell className='text-muted-foreground font-mono'>
                          {row.ip || '-'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
