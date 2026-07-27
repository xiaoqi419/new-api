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
import { FileText, Loader2, RefreshCw, Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
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

import {
  approveIdentityVerification,
  getAllIdentityVerifications,
  viewIdentityProof,
} from './api'
import { IdentityConfigDialog } from './components/identity-config-dialog'
import { IdentityRejectDialog } from './components/identity-reject-dialog'
import { IDENTITY_PAGE_SIZE, IDENTITY_STATUS_PENDING } from './constants'
import { identityStatusMeta } from './lib'
import type { IdentityVerification } from './types'

export function IdentityVerificationAdmin() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState(-1)
  const [page, setPage] = useState(1)
  const [rejectTarget, setRejectTarget] = useState<IdentityVerification | null>(
    null
  )
  const [configOpen, setConfigOpen] = useState(false)
  const [viewingId, setViewingId] = useState<number | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['identity-verification-admin', status, page],
    queryFn: async () => {
      const res = await getAllIdentityVerifications(
        status,
        page,
        IDENTITY_PAGE_SIZE
      )
      return {
        items: res.data?.items ?? [],
        total: res.data?.total ?? 0,
      }
    },
    placeholderData: (prev) => prev,
  })
  const records = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / IDENTITY_PAGE_SIZE))

  const approveMutation = useMutation({
    mutationFn: approveIdentityVerification,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Request approved and quota granted'))
      void queryClient.invalidateQueries({
        queryKey: ['identity-verification-admin'],
      })
    },
  })

  const statusItems = [
    { value: 'all', label: t('All') },
    { value: '0', label: t('Pending') },
    { value: '1', label: t('Approved') },
    { value: '2', label: t('Rejected') },
  ]
  const currentStatusValue = status < 0 ? 'all' : String(status)
  const currentStatusLabel =
    statusItems.find((s) => s.value === currentStatusValue)?.label ?? t('All')

  const changeStatus = (value: string) => {
    setStatus(value === 'all' ? -1 : Number(value))
    setPage(1)
  }

  const handleView = async (id: number) => {
    setViewingId(id)
    try {
      await viewIdentityProof(id)
    } catch {
      toast.error(t('Failed to open proof'))
    } finally {
      setViewingId(null)
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Identity Verification Management')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button size='sm' variant='outline' onClick={() => setConfigOpen(true)}>
          <Settings className='mr-1 size-3.5' />
          {t('Settings')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <div className='flex items-center justify-between gap-3'>
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground text-sm'>
                {t('Status')}
              </span>
              <Select
                items={statusItems}
                value={currentStatusValue}
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
                <EmptyTitle>
                  {t('No identity verification requests')}
                </EmptyTitle>
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
                    <TableHead>{t('Identity Type')}</TableHead>
                    <TableHead>{t('Real Name')}</TableHead>
                    <TableHead>{t('Organization')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('Applied At')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => {
                    const meta = identityStatusMeta(record.status)
                    return (
                      <TableRow key={record.id}>
                        <TableCell className='text-muted-foreground'>
                          {record.id}
                        </TableCell>
                        <TableCell>{record.username}</TableCell>
                        <TableCell className='font-medium'>
                          {record.type_name}
                        </TableCell>
                        <TableCell>{record.real_name || '-'}</TableCell>
                        <TableCell>{record.org || '-'}</TableCell>
                        <TableCell>
                          <StatusBadge
                            label={t(meta.key)}
                            variant={meta.variant}
                            copyable={false}
                          />
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs'>
                          {record.created_time
                            ? formatTimestampToDate(record.created_time)
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className='flex flex-wrap justify-end gap-2'>
                            <Button
                              variant='outline'
                              size='sm'
                              disabled={viewingId === record.id}
                              onClick={() => handleView(record.id)}
                            >
                              {viewingId === record.id ? (
                                <Loader2 className='mr-1 size-3.5 animate-spin' />
                              ) : (
                                <FileText className='mr-1 size-3.5' />
                              )}
                              {t('View Proof')}
                            </Button>
                            {record.status === IDENTITY_STATUS_PENDING && (
                              <>
                                <Button
                                  size='sm'
                                  disabled={
                                    approveMutation.isPending &&
                                    approveMutation.variables === record.id
                                  }
                                  onClick={() =>
                                    approveMutation.mutate(record.id)
                                  }
                                >
                                  {approveMutation.isPending &&
                                    approveMutation.variables === record.id && (
                                      <Loader2 className='mr-1 size-3.5 animate-spin' />
                                    )}
                                  {t('Approve')}
                                </Button>
                                <Button
                                  variant='outline'
                                  size='sm'
                                  onClick={() => setRejectTarget(record)}
                                >
                                  {t('Reject')}
                                </Button>
                              </>
                            )}
                            {record.status === 2 && record.reject_reason && (
                              <span className='text-muted-foreground self-center text-xs'>
                                {record.reject_reason}
                              </span>
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

          {total > IDENTITY_PAGE_SIZE && (
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

        <IdentityRejectDialog
          open={rejectTarget !== null}
          record={rejectTarget}
          onOpenChange={(o) => {
            if (!o) setRejectTarget(null)
          }}
        />
        <IdentityConfigDialog open={configOpen} onOpenChange={setConfigOpen} />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
