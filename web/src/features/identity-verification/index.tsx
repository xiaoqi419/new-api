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
import { toast } from 'sonner'

import { FileText, Loader2, Plus } from '@/components/icons'
import { StatusBadge } from '@/components/status-badge'
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
import { formatTimestampToDate } from '@/lib/format'

import { getSelfIdentityVerifications, viewIdentityProof } from './api'
import { IdentityApplyDialog } from './components/identity-apply-dialog'
import { IDENTITY_PAGE_SIZE } from './constants'
import { identityStatusMeta } from './lib'

export function UserIdentityVerification() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [applyOpen, setApplyOpen] = useState(false)
  const [viewingId, setViewingId] = useState<number | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['identity-verification-self', page],
    queryFn: async () => {
      const res = await getSelfIdentityVerifications(page, IDENTITY_PAGE_SIZE)
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
    <>
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-4'>
        <div className='flex justify-end'>
          <Button size='sm' onClick={() => setApplyOpen(true)}>
            <Plus className='mr-1 size-3.5' />
            {t('Apply for Verification')}
          </Button>
        </div>
        {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

        {!isLoading && records.length === 0 && (
          <Empty className='min-h-64 border'>
            <EmptyHeader>
              <EmptyTitle>
                {t('No identity verification requests yet')}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}

        {!isLoading && records.length > 0 && (
          <div className='rounded-xl border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Identity Type')}</TableHead>
                  <TableHead>{t('Real Name')}</TableHead>
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
                      <TableCell className='font-medium'>
                        {record.type_name}
                      </TableCell>
                      <TableCell>{record.real_name || '-'}</TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <StatusBadge
                            label={t(meta.key)}
                            variant={meta.variant}
                            copyable={false}
                          />
                          {record.status === 2 && record.reject_reason && (
                            <span className='text-destructive text-xs'>
                              {record.reject_reason}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-muted-foreground text-xs'>
                        {record.created_time
                          ? formatTimestampToDate(record.created_time)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className='flex justify-end'>
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

      <IdentityApplyDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </>
  )
}
