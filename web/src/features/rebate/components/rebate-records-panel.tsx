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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

import { cancelRebate, getRebateRecords, payRebate } from '../api'
import { REBATE_PAGE_SIZE, REBATE_STATUS_PENDING } from '../constants'
import { formatRebateRatio, rebateStatusMeta } from '../lib'

export function RebateRecordsPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rebate-records', status, page],
    queryFn: async () => {
      const res = await getRebateRecords(page, REBATE_PAGE_SIZE, status)
      return {
        items: res.data?.items ?? [],
        total: res.data?.total ?? 0,
      }
    },
    placeholderData: (prev) => prev,
  })
  const records = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / REBATE_PAGE_SIZE))

  const payMutation = useMutation({
    mutationFn: (id: number) => payRebate(id),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Rebate paid'))
      void queryClient.invalidateQueries({ queryKey: ['rebate-records'] })
    },
  })
  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelRebate(id),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Rebate cancelled'))
      void queryClient.invalidateQueries({ queryKey: ['rebate-records'] })
    },
  })

  const statusItems = [
    { value: 'all', label: t('All') },
    { value: 'pending', label: t('Pending') },
    { value: 'paid', label: t('Paid') },
    { value: 'cancelled', label: t('Cancelled') },
  ]
  const currentStatusLabel =
    statusItems.find((s) => s.value === status)?.label ?? t('All')

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground text-sm'>{t('Status')}</span>
          <Select
            items={statusItems}
            value={status}
            onValueChange={(v) => {
              if (!v) return
              setStatus(v)
              setPage(1)
            }}
          >
            <SelectTrigger className='w-40'>
              <SelectValue>{currentStatusLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {statusItems.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
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
            <EmptyTitle>{t('No rebate records yet')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {!isLoading && records.length > 0 && (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16'>ID</TableHead>
                <TableHead>{t('Inviter ID')}</TableHead>
                <TableHead>{t('Friend ID')}</TableHead>
                <TableHead>{t('Top-up Amount')}</TableHead>
                <TableHead>{t('Rebate Ratio')}</TableHead>
                <TableHead>{t('Rebate Amount')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Created At')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => {
                const meta = rebateStatusMeta(record.status)
                const isPending = record.status === REBATE_STATUS_PENDING
                return (
                  <TableRow key={record.id}>
                    <TableCell className='text-muted-foreground'>
                      {record.id}
                    </TableCell>
                    <TableCell className='font-mono'>
                      {record.inviter_id}
                    </TableCell>
                    <TableCell className='font-mono'>
                      {record.invitee_id}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {formatQuota(record.topup_quota)}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {formatRebateRatio(record.rebate_ratio)}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {formatQuota(record.rebate_quota)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={t(meta.key)}
                        variant={meta.variant}
                        copyable={false}
                      />
                    </TableCell>
                    <TableCell className='text-muted-foreground text-xs'>
                      {record.create_time
                        ? formatTimestampToDate(record.create_time, 'seconds')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-2'>
                        {isPending ? (
                          <>
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={<Button size='sm'>{t('Pay')}</Button>}
                              />
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t(
                                      'Pay this rebate to the inviter balance?'
                                    )}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {`#${record.id} · ${formatQuota(record.rebate_quota)}`}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    {t('Cancel')}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      payMutation.mutate(record.id)
                                    }
                                  >
                                    {t('Pay')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={
                                  <Button variant='outline' size='sm'>
                                    {t('Void')}
                                  </Button>
                                }
                              />
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t('Void this rebate record?')}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {`#${record.id}`}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    {t('Cancel')}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    variant='destructive'
                                    onClick={() =>
                                      cancelMutation.mutate(record.id)
                                    }
                                  >
                                    {t('Void')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        ) : (
                          <span className='text-muted-foreground'>-</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
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
