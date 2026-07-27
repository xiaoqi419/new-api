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
import { Gift, RefreshCw, Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
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
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import { getAllLotteryRecords } from './api'
import { LotteryConfigDialog } from './components/lottery-config-dialog'
import { LotteryGrantDialog } from './components/lottery-grant-dialog'
import { LOTTERY_PAGE_SIZE } from './constants'

export function LotteryAdmin() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [configOpen, setConfigOpen] = useState(false)
  const [grantOpen, setGrantOpen] = useState(false)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['lottery-records-admin', page],
    queryFn: async () => {
      const res = await getAllLotteryRecords(page, LOTTERY_PAGE_SIZE)
      return { items: res.data?.items ?? [], total: res.data?.total ?? 0 }
    },
    placeholderData: (prev) => prev,
  })
  const records = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LOTTERY_PAGE_SIZE))

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Lottery Management')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button size='sm' variant='outline' onClick={() => setGrantOpen(true)}>
          <Gift className='mr-1 size-3.5' />
          {t('Grant Lottery Cards')}
        </Button>
        <Button size='sm' variant='outline' onClick={() => setConfigOpen(true)}>
          <Settings className='mr-1 size-3.5' />
          {t('Settings')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <div className='flex justify-end'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${isFetching ? 'animate-spin' : ''}`}
              />
              {t('Refresh')}
            </Button>
          </div>

          {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

          {!isLoading && records.length === 0 && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>{t('No draw records yet')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && records.length > 0 && (
            <div className='rounded-xl border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-16'>ID</TableHead>
                    <TableHead>{t('Username')}</TableHead>
                    <TableHead>{t('Prize')}</TableHead>
                    <TableHead className='text-right'>
                      {t('Quota Awarded')}
                    </TableHead>
                    <TableHead>{t('Time')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className='text-muted-foreground'>
                        {record.id}
                      </TableCell>
                      <TableCell>{record.username}</TableCell>
                      <TableCell>{record.prize_name}</TableCell>
                      <TableCell className='text-right font-mono'>
                        {formatQuota(record.total_quota ?? 0)}
                      </TableCell>
                      <TableCell className='text-muted-foreground text-xs'>
                        {record.created_time
                          ? formatTimestampToDate(record.created_time)
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {total > LOTTERY_PAGE_SIZE && (
            <div className='flex items-center justify-center gap-3'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('Previous')}
              </Button>
              <span className='text-muted-foreground text-sm'>
                {page} / {totalPages}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          )}
        </div>

        <LotteryConfigDialog open={configOpen} onOpenChange={setConfigOpen} />
        <LotteryGrantDialog open={grantOpen} onOpenChange={setGrantOpen} />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
