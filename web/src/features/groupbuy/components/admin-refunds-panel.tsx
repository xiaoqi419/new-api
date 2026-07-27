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

import { listRefunds, markRefunded } from '../admin-api'
import { ADMIN_PAGE_SIZE } from '../constants'
import type { AdminGroupBuyParticipant } from '../types'
import { AdminConfirmDialog } from './admin-confirm-dialog'

export function AdminRefundsPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [target, setTarget] = useState<AdminGroupBuyParticipant | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['gb-admin-refunds', page],
    queryFn: async () => {
      const res = await listRefunds(page, ADMIN_PAGE_SIZE)
      return {
        items: res.data?.items ?? [],
        total: res.data?.total ?? 0,
      }
    },
    placeholderData: (prev) => prev,
  })
  const records = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))

  const mutation = useMutation({
    mutationFn: (id: number) => markRefunded(id),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Marked as refunded'))
      void queryClient.invalidateQueries({ queryKey: ['gb-admin-refunds'] })
      setTarget(null)
    },
  })

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'These channels cannot be refunded automatically (e.g. Epay). Refund on the payment platform, then mark as done.'
          )}
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['gb-admin-refunds'] })
          }
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
            <EmptyTitle>{t('No pending refunds')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {!isLoading && records.length > 0 && (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16'>ID</TableHead>
                <TableHead>{t('Group Buy ID')}</TableHead>
                <TableHead>{t('User ID')}</TableHead>
                <TableHead>{t('Username')}</TableHead>
                <TableHead>{t('Trade No')}</TableHead>
                <TableHead>{t('Amount')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((rec) => (
                <TableRow key={rec.id}>
                  <TableCell className='text-muted-foreground'>
                    {rec.id}
                  </TableCell>
                  <TableCell>{rec.group_buy_id}</TableCell>
                  <TableCell>{rec.user_id}</TableCell>
                  <TableCell>{rec.username}</TableCell>
                  <TableCell className='font-mono text-xs'>
                    {rec.trade_no}
                  </TableCell>
                  <TableCell>
                    ¥{Number(rec.pay_money ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end'>
                      <Button size='sm' onClick={() => setTarget(rec)}>
                        {t('Mark refunded')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > ADMIN_PAGE_SIZE && (
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

      <AdminConfirmDialog
        open={target !== null}
        title={t('Mark refunded')}
        description={t(
          'Confirm you have manually refunded this payment on the payment platform?'
        )}
        confirmText={t('Mark refunded')}
        loading={mutation.isPending}
        onOpenChange={(o) => {
          if (!o) setTarget(null)
        }}
        onConfirm={() => {
          if (target) mutation.mutate(target.id)
        }}
      />
    </div>
  )
}
