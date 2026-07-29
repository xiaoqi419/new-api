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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Clock, Package, Ticket } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
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

import { drawLottery, getLotteryStatus, getSelfLotteryRecords } from './api'
import { LotteryWheel } from './components/lottery-wheel'
import { LOTTERY_PAGE_SIZE } from './constants'
import type { LotteryDrawRecord } from './types'

export function LotteryPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [spinning, setSpinning] = useState(false)
  const [prizeIndex, setPrizeIndex] = useState(0)
  const [pendingRecord, setPendingRecord] = useState<LotteryDrawRecord | null>(
    null
  )
  const [page, setPage] = useState(1)

  const { data: status, isLoading } = useQuery({
    queryKey: ['lottery-status'],
    queryFn: async () => (await getLotteryStatus()).data,
  })

  const { data: recordsData } = useQuery({
    queryKey: ['lottery-records-self', page],
    queryFn: async () => {
      const res = await getSelfLotteryRecords(page, LOTTERY_PAGE_SIZE)
      return { items: res.data?.items ?? [], total: res.data?.total ?? 0 }
    },
    placeholderData: (prev) => prev,
  })

  const prizes = status?.prizes ?? []
  const availableCards = status?.available_cards ?? 0
  const records = recordsData?.items ?? []
  const total = recordsData?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LOTTERY_PAGE_SIZE))

  const expiringCards = (status?.cards ?? [])
    .filter((card) => (card.expire_time ?? 0) > 0)
    .sort((a, b) => (a.expire_time ?? 0) - (b.expire_time ?? 0))

  const wheelData = prizes.map((prize) => ({
    label: prize.name,
    color: prize.color,
    type: prize.type,
  }))

  const handleDraw = async () => {
    if (spinning) return
    if (availableCards <= 0) {
      toast.error(t('No lottery cards available'))
      return
    }
    setSpinning(true)
    try {
      const res = await drawLottery()
      if (!res.success || !res.data) {
        toast.error(res.message || t('Draw failed'))
        setSpinning(false)
        return
      }
      const idx = prizes.findIndex((p) => p.key === res.data?.prize_key)
      setPrizeIndex(idx >= 0 ? idx : 0)
      setPendingRecord(res.data)
    } catch {
      toast.error(t('Draw failed'))
      setSpinning(false)
    }
  }

  const handleStopSpinning = () => {
    setSpinning(false)
    if (pendingRecord) {
      const gained = pendingRecord.total_quota ?? 0
      if (gained > 0) {
        toast.success(
          t('Congratulations! You won {{prize}} (+{{quota}}).', {
            prize: pendingRecord.prize_name ?? '',
            quota: formatQuota(gained),
          })
        )
      } else {
        toast.info(
          t('You got: {{prize}}', { prize: pendingRecord.prize_name ?? '' })
        )
      }
      setPendingRecord(null)
    }
    void queryClient.invalidateQueries({ queryKey: ['lottery-status'] })
    void queryClient.invalidateQueries({ queryKey: ['lottery-records-self'] })
  }

  if (isLoading) {
    return <Skeleton className='mx-auto h-96 w-full max-w-2xl rounded-xl' />
  }

  if (!status?.enabled) {
    return (
      <Empty className='min-h-64 border'>
        <EmptyHeader>
          <EmptyTitle>
            {t('The lucky draw is currently unavailable.')}
          </EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  const centerLabel = spinning ? t('Drawing...') : t('Draw')
  const centerSubLabel = t('{{count}} left', { count: availableCards })

  return (
    <div className='mx-auto flex w-full max-w-6xl flex-col gap-6'>
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]'>
        {/* 左侧：橙色渐变主卡 + 转盘 */}
        <div className='relative overflow-hidden rounded-2xl bg-gradient-to-b from-orange-300 via-orange-400 to-orange-500 p-6 shadow-md'>
          <div className='text-center'>
            <h2 className='text-2xl font-extrabold text-white drop-shadow'>
              {t('Crazy Lucky Wheel')}
            </h2>
            {(status.base_quota ?? 0) > 0 && (
              <p className='mt-1 text-sm font-medium text-white/90'>
                {t('Every spin gives a guaranteed {{quota}} quota', {
                  quota: formatQuota(status.base_quota ?? 0),
                })}
              </p>
            )}
          </div>

          <div className='mt-4 flex flex-wrap justify-center gap-2'>
            <span className='rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-orange-700'>
              {t('Topup for cards')}
            </span>
            <span className='rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-orange-700'>
              {t('Spend to unlock cards')}
            </span>
            <span className='rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-orange-700'>
              {t('Guaranteed prize')}
            </span>
          </div>

          <div className='mt-6 flex justify-center'>
            {wheelData.length === 0 ? (
              <Empty className='min-h-64 w-full rounded-xl border border-white/40 bg-white/20'>
                <EmptyHeader>
                  <EmptyTitle className='text-white'>
                    {t('No prizes configured yet')}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <LotteryWheel
                segments={wheelData}
                spinning={spinning}
                prizeIndex={prizeIndex}
                onStop={handleStopSpinning}
                onDraw={handleDraw}
                centerLabel={centerLabel}
                centerSubLabel={centerSubLabel}
                disabled={spinning || availableCards <= 0}
              />
            )}
          </div>
        </div>

        {/* 右侧：统计 + 进度 + 我的卡 */}
        <div className='flex flex-col gap-4'>
          <div className='grid grid-cols-3 gap-3'>
            <div className='rounded-xl border bg-rose-50 p-4 text-center'>
              <div className='text-2xl font-bold text-rose-600'>
                {availableCards}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {t('Available draws')}
              </div>
            </div>
            <div className='rounded-xl border bg-amber-50 p-4 text-center'>
              <div className='text-2xl font-bold text-amber-600'>
                {formatQuota(status.base_quota ?? 0)}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {t('Guaranteed each draw')}
              </div>
            </div>
            <div className='rounded-xl border bg-emerald-50 p-4 text-center'>
              <div className='text-2xl font-bold text-emerald-600'>
                {prizes.length}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {t('Prize pool')}
              </div>
            </div>
          </div>

          {status.progress?.has_next && (
            <div className='rounded-xl border p-4'>
              <div className='mb-2 flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>
                  {t('Next card at cumulative spend')}
                </span>
                <span className='font-mono text-xs'>
                  {formatQuota(status.progress.consumed_quota)} /{' '}
                  {formatQuota(status.progress.next_threshold)}
                </span>
              </div>
              <Progress
                value={Math.min(
                  100,
                  status.progress.next_threshold > 0
                    ? (status.progress.consumed_quota /
                        status.progress.next_threshold) *
                        100
                    : 0
                )}
                className='h-2'
              />
            </div>
          )}

          <div className='rounded-xl border p-4'>
            <h3 className='mb-3 flex items-center gap-2 text-sm font-semibold'>
              <Package className='size-4' />
              {t('My Lottery Cards')}
            </h3>
            {availableCards <= 0 ? (
              <p className='text-muted-foreground py-2 text-center text-sm'>
                {t('No lottery cards available')}
              </p>
            ) : (
              <ul className='flex flex-col gap-2 text-sm'>
                <li className='flex items-center justify-between'>
                  <span className='flex items-center gap-2'>
                    <Ticket className='size-4 text-emerald-500' />
                    {t('Available draws')}
                  </span>
                  <span className='font-semibold'>{availableCards}</span>
                </li>
                {expiringCards.map((card) => (
                  <li
                    key={card.id}
                    className='text-muted-foreground flex items-center justify-between'
                  >
                    <span className='flex items-center gap-2'>
                      <Clock className='size-4 text-orange-500' />
                      {t('Limited-time card')}
                    </span>
                    <span className='font-mono text-xs'>
                      {t('Expires')}:{' '}
                      {formatTimestampToDate(card.expire_time ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className='w-full'>
        <h2 className='mb-3 text-sm font-semibold'>{t('Draw History')}</h2>
        {records.length === 0 ? (
          <Empty className='min-h-40 border'>
            <EmptyHeader>
              <EmptyTitle>{t('No draw records yet')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='rounded-xl border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Time')}</TableHead>
                  <TableHead>{t('Prize')}</TableHead>
                  <TableHead className='text-right'>
                    {t('Quota Awarded')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className='text-muted-foreground text-xs'>
                      {record.created_time
                        ? formatTimestampToDate(record.created_time)
                        : '-'}
                    </TableCell>
                    <TableCell>{record.prize_name}</TableCell>
                    <TableCell className='text-right font-mono'>
                      {formatQuota(record.total_quota ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > LOTTERY_PAGE_SIZE && (
          <div className='mt-3 flex items-center justify-center gap-3'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1}
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
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
