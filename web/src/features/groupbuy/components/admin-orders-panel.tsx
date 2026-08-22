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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Loader2, RefreshCw } from '@/components/icons'
import { StatusBadge } from '@/components/status-badge'
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
import { formatTimestampToDate } from '@/lib/format'

import { cancelOrder, getOrder, listOrders } from '../admin-api'
import { ADMIN_PAGE_SIZE } from '../constants'
import type { GroupBuyOrder } from '../types'
import { AdminConfirmDialog } from './admin-confirm-dialog'

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

function statusMeta(status: string): { key: string; variant: StatusVariant } {
  switch (status) {
    case 'success':
      return { key: 'Formed', variant: 'success' }
    case 'failed':
      return { key: 'Failed', variant: 'neutral' }
    default:
      return { key: 'In Progress', variant: 'info' }
  }
}

function payStatusKey(status?: string): string {
  switch (status) {
    case 'paid':
      return 'Paid'
    case 'refunded':
      return 'Refunded'
    case 'refund_pending':
      return 'Refund pending'
    default:
      return 'Awaiting payment'
  }
}

export function AdminOrdersPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [detailOrder, setDetailOrder] = useState<GroupBuyOrder | null>(null)
  const [cancelTarget, setCancelTarget] = useState<GroupBuyOrder | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['gb-admin-orders', status, page],
    queryFn: async () => {
      const res = await listOrders(status, page, ADMIN_PAGE_SIZE)
      return {
        items: res.data?.items ?? [],
        total: res.data?.total ?? 0,
      }
    },
    placeholderData: (prev) => prev,
  })
  const orders = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))

  const detailId = detailOrder?.id ?? null
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['gb-admin-order', detailId],
    queryFn: async () => {
      if (detailId === null) return null
      const res = await getOrder(detailId)
      return res.data ?? null
    },
    enabled: detailId !== null,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelOrder(id),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Order voided and refunds triggered'))
      void queryClient.invalidateQueries({ queryKey: ['gb-admin-orders'] })
      setCancelTarget(null)
    },
  })

  const changeStatus = (value: string) => {
    setStatus(value === 'all' ? '' : value)
    setPage(1)
  }

  const statusItems = [
    { value: 'all', label: t('All') },
    { value: 'pending', label: t('In Progress') },
    { value: 'success', label: t('Formed') },
    { value: 'failed', label: t('Failed') },
  ]
  const currentStatusLabel =
    statusItems.find((s) => s.value === (status || 'all'))?.label ?? t('All')

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground text-sm'>{t('Status')}</span>
          <Select
            items={statusItems}
            value={status || 'all'}
            onValueChange={(v) => v && changeStatus(v)}
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
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['gb-admin-orders'] })
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

      {!isLoading && orders.length === 0 && (
        <Empty className='min-h-64 border'>
          <EmptyHeader>
            <EmptyTitle>{t('No group buy orders')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {!isLoading && orders.length > 0 && (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16'>ID</TableHead>
                <TableHead>{t('Group No')}</TableHead>
                <TableHead>{t('Package')}</TableHead>
                <TableHead>{t('Progress')}</TableHead>
                <TableHead>{t('Paid per person')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Created')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const meta = statusMeta(order.status)
                return (
                  <TableRow key={order.id}>
                    <TableCell className='text-muted-foreground'>
                      {order.id}
                    </TableCell>
                    <TableCell className='font-mono text-xs'>
                      {order.group_no}
                    </TableCell>
                    <TableCell>{order.package_name}</TableCell>
                    <TableCell>
                      {order.paid_count ?? 0}/
                      {order.target_count || order.required_count}
                    </TableCell>
                    <TableCell>
                      ¥{Number(order.per_share_price ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={t(meta.key)}
                        variant={meta.variant}
                        copyable={false}
                      />
                    </TableCell>
                    <TableCell className='text-muted-foreground text-xs'>
                      {order.create_time
                        ? formatTimestampToDate(order.create_time)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setDetailOrder(order)}
                        >
                          {t('View')}
                        </Button>
                        {order.status === 'pending' && (
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => setCancelTarget(order)}
                          >
                            {t('Void')}
                          </Button>
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

      <Dialog
        open={detailOrder !== null}
        onOpenChange={(o) => {
          if (!o) setDetailOrder(null)
        }}
        title={t('Joined Members')}
        description={detailOrder?.group_no}
        contentClassName='sm:max-w-2xl'
      >
        {detailLoading ? (
          <div className='flex justify-center py-8'>
            <Loader2 className='text-primary size-6 animate-spin' />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('User ID')}</TableHead>
                <TableHead>{t('Username')}</TableHead>
                <TableHead>{t('Trade No')}</TableHead>
                <TableHead>{t('Amount')}</TableHead>
                <TableHead>{t('Payment Status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(detail?.participants ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className='text-muted-foreground'>
                    {p.user_id}
                  </TableCell>
                  <TableCell>{p.username}</TableCell>
                  <TableCell className='font-mono text-xs'>
                    {p.trade_no}
                  </TableCell>
                  <TableCell>¥{Number(p.pay_money ?? 0).toFixed(2)}</TableCell>
                  <TableCell>{t(payStatusKey(p.pay_status))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Dialog>

      <AdminConfirmDialog
        open={cancelTarget !== null}
        title={t('Void Order')}
        description={t(
          'Void this in-progress group buy and refund all paid members?'
        )}
        confirmText={t('Void')}
        destructive
        loading={cancelMutation.isPending}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null)
        }}
        onConfirm={() => {
          if (cancelTarget) cancelMutation.mutate(cancelTarget.id)
        }}
      />
    </div>
  )
}
