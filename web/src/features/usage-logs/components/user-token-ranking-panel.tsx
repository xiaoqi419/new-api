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
import { getRouteApi } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Trophy,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { getUserTokenRanking } from '../api'
import { getDefaultTimeRange } from '../lib/utils'

const route = getRouteApi('/_authenticated/usage-logs/$section')

const RANK_BADGE: Record<number, string> = {
  1: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  2: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  3: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
}

export function UserTokenRankingPanel() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [open, setOpen] = useState(false)

  const { start, end } = useMemo(() => {
    const def = getDefaultTimeRange()
    const startMs = search.startTime ?? def.start.getTime()
    const endMs = search.endTime ?? def.end.getTime()
    return {
      start: Math.floor(startMs / 1000),
      end: Math.floor(endMs / 1000),
    }
  }, [search.startTime, search.endTime])

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['user-token-ranking', start, end],
    queryFn: async () => {
      const res = await getUserTokenRanking(start, end, 20)
      return res.data?.items ?? []
    },
    enabled: open,
  })
  const rows = data ?? []

  const drillDown = (username: string) => {
    void navigate({
      search: (prev) => ({ ...prev, username, page: 1 }),
    })
  }

  return (
    <div className='flex-shrink-0 rounded-xl border'>
      <div className='flex items-center justify-between px-3 py-1.5'>
        <Button variant='ghost' size='sm' onClick={() => setOpen((v) => !v)}>
          <Trophy className='mr-2 size-4' />
          {t('User Token Ranking')}
          {open ? (
            <ChevronUp className='ml-2 size-4' />
          ) : (
            <ChevronDown className='ml-2 size-4' />
          )}
        </Button>
        {open && (
          <Button
            variant='ghost'
            size='sm'
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw
              className={`mr-2 size-3.5 ${isFetching ? 'animate-spin' : ''}`}
            />
            {t('Refresh')}
          </Button>
        )}
      </div>
      {open && (
        <div className='border-t px-3 py-2'>
          <p className='text-muted-foreground mb-2 text-xs'>
            {t(
              'Ranked by token consumption in the selected range. Click a user to drill into their logs.'
            )}
          </p>
          <div className='max-h-72 overflow-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-16'>{t('Rank')}</TableHead>
                  <TableHead className='w-20'>{t('User ID')}</TableHead>
                  <TableHead>{t('Username')}</TableHead>
                  <TableHead className='text-right'>{t('Tokens')}</TableHead>
                  <TableHead className='w-28 text-right'>
                    {t('Actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFetching && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className='py-6 text-center'>
                      <Loader2 className='mx-auto size-4 animate-spin' />
                    </TableCell>
                  </TableRow>
                )}
                {!isFetching && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className='text-muted-foreground py-6 text-center text-sm'
                    >
                      {t('No data')}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row, index) => {
                  const rank = index + 1
                  return (
                    <TableRow key={row.user_id}>
                      <TableCell>
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${RANK_BADGE[rank] ?? 'text-muted-foreground'}`}
                        >
                          {rank}
                        </span>
                      </TableCell>
                      <TableCell className='text-muted-foreground'>
                        {row.user_id}
                      </TableCell>
                      <TableCell className='font-medium'>
                        {row.username}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {row.value.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => drillDown(row.username)}
                        >
                          {t('View Details')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
