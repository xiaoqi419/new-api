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
import { Download, Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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

import { downloadInvoice, getSelfInvoices } from './api'
import { InvoiceApplyDialog } from './components/invoice-apply-dialog'
import { INVOICE_PAGE_SIZE, INVOICE_STATUS_ISSUED } from './constants'
import { invoiceStatusMeta, titleTypeKey } from './lib'

export function UserInvoices() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [applyOpen, setApplyOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['invoices-self', page],
    queryFn: async () => {
      const res = await getSelfInvoices(page, INVOICE_PAGE_SIZE)
      return {
        items: res.data?.items ?? [],
        total: res.data?.total ?? 0,
      }
    },
    placeholderData: (prev) => prev,
  })
  const invoices = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE))

  const handleDownload = async (id: number) => {
    setDownloadingId(id)
    try {
      await downloadInvoice(id)
    } catch {
      toast.error(t('Download failed'))
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <>
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-4'>
        <div className='flex justify-end'>
          <Button size='sm' onClick={() => setApplyOpen(true)}>
            <Plus className='mr-1 size-3.5' />
            {t('Apply for Invoice')}
          </Button>
        </div>
        {isLoading && <Skeleton className='h-64 w-full rounded-xl' />}

        {!isLoading && invoices.length === 0 && (
          <Empty className='min-h-64 border'>
            <EmptyHeader>
              <EmptyTitle>{t('No invoice requests yet')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}

        {!isLoading && invoices.length > 0 && (
          <div className='rounded-xl border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Amount')}</TableHead>
                  <TableHead>{t('Invoice Title')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Applied At')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const meta = invoiceStatusMeta(invoice.status)
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>${invoice.amount}</TableCell>
                      <TableCell>
                        <span className='font-medium'>{invoice.title}</span>
                        <span className='text-muted-foreground ml-1 text-xs'>
                          ({t(titleTypeKey(invoice.title_type))})
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <StatusBadge
                            label={t(meta.key)}
                            variant={meta.variant}
                            copyable={false}
                          />
                          {invoice.status === 2 && invoice.reject_reason && (
                            <span className='text-destructive text-xs'>
                              {invoice.reject_reason}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-muted-foreground text-xs'>
                        {invoice.created_time
                          ? formatTimestampToDate(invoice.created_time)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className='flex justify-end'>
                          {invoice.status === INVOICE_STATUS_ISSUED ? (
                            <Button
                              variant='outline'
                              size='sm'
                              disabled={downloadingId === invoice.id}
                              onClick={() => handleDownload(invoice.id)}
                            >
                              {downloadingId === invoice.id ? (
                                <Loader2 className='mr-1 size-3.5 animate-spin' />
                              ) : (
                                <Download className='mr-1 size-3.5' />
                              )}
                              {t('Download')}
                            </Button>
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

        {total > INVOICE_PAGE_SIZE && (
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

      <InvoiceApplyDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </>
  )
}
