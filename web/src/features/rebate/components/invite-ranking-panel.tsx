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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RefreshCw } from '@/components/icons'
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
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import { getInviteRanking } from '../api'
import { REBATE_PAGE_SIZE } from '../constants'

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

export function InviteRankingPanel() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['invite-ranking', page],
    queryFn: async () => {
      const res = await getInviteRanking(page, REBATE_PAGE_SIZE)
      return {
        items: res.data?.items ?? [],
        total: res.data?.total ?? 0,
      }
    },
    placeholderData: (prev) => prev,
  })
  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / REBATE_PAGE_SIZE))

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm'>
          {t('Sorted by number of invites, with a rebate summary per inviter.')}
        </p>
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

      {!isLoading && rows.length === 0 && (
        <Empty className='min-h-64 border'>
          <EmptyHeader>
            <EmptyTitle>{t('No inviters yet')}</EmptyTitle>
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
                <TableHead>{t('Display Name')}</TableHead>
                <TableHead>{t('Invites')}</TableHead>
                <TableHead>{t('Pending Rebate')}</TableHead>
                <TableHead>{t('Paid Rebate')}</TableHead>
                <TableHead>{t('Total Rebate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.user_id}>
                  <TableCell>
                    <RankCell
                      rank={(page - 1) * REBATE_PAGE_SIZE + index + 1}
                    />
                  </TableCell>
                  <TableCell className='text-muted-foreground font-mono'>
                    {row.user_id}
                  </TableCell>
                  <TableCell>{row.username}</TableCell>
                  <TableCell className='text-muted-foreground'>
                    {row.display_name || '-'}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {row.aff_count}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {formatQuota(row.rebate_pending)}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {formatQuota(row.rebate_paid)}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {formatQuota(row.rebate_total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > REBATE_PAGE_SIZE && (
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
  )
}
