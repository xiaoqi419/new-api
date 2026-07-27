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
import { Download, Loader2, RefreshCw } from 'lucide-react'
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

import { downloadInvoice, getAllInvoices } from './api'
import { InvoiceIssueDialog } from './components/invoice-issue-dialog'
import { InvoiceRejectDialog } from './components/invoice-reject-dialog'
import {
  INVOICE_PAGE_SIZE,
  INVOICE_STATUS_ISSUED,
  INVOICE_STATUS_PENDING,
} from './constants'
import { invoiceStatusMeta, titleTypeKey } from './lib'
import type { Invoice } from './types'

export function InvoiceAdmin() {
  const { t } = useTranslation()
  const [status, setStatus] = useState(-1)
  const [page, setPage] = useState(1)
  const [issueTarget, setIssueTarget] = useState<Invoice | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Invoice | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['invoices-admin', status, page],
    queryFn: async () => {
      const res = await getAllInvoices(status, page, INVOICE_PAGE_SIZE)
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

  const statusItems = [
    { value: 'all', label: t('All') },
    { value: '0', label: t('Pending') },
    { value: '1', label: t('Issued') },
    { value: '2', label: t('Rejected') },
  ]
  const currentStatusValue = status < 0 ? 'all' : String(status)
  const currentStatusLabel =
    statusItems.find((s) => s.value === currentStatusValue)?.label ?? t('All')

  const changeStatus = (value: string) => {
    setStatus(value === 'all' ? -1 : Number(value))
    setPage(1)
  }

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
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Invoice Management')}
      </SectionPageLayout.Title>
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

          {!isLoading && invoices.length === 0 && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>{t('No invoice requests')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {!isLoading && invoices.length > 0 && (
            <div className='rounded-xl border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-16'>ID</TableHead>
                    <TableHead>{t('Username')}</TableHead>
                    <TableHead>{t('Amount')}</TableHead>
                    <TableHead>{t('Invoice Title')}</TableHead>
                    <TableHead>{t('Tax Number')}</TableHead>
                    <TableHead>{t('Email')}</TableHead>
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
                        <TableCell className='text-muted-foreground'>
                          {invoice.id}
                        </TableCell>
                        <TableCell>{invoice.username}</TableCell>
                        <TableCell>${invoice.amount}</TableCell>
                        <TableCell>
                          <span className='font-medium'>{invoice.title}</span>
                          <span className='text-muted-foreground ml-1 text-xs'>
                            ({t(titleTypeKey(invoice.title_type))})
                          </span>
                        </TableCell>
                        <TableCell>{invoice.tax_number || '-'}</TableCell>
                        <TableCell>{invoice.email || '-'}</TableCell>
                        <TableCell>
                          <StatusBadge
                            label={t(meta.key)}
                            variant={meta.variant}
                            copyable={false}
                          />
                        </TableCell>
                        <TableCell className='text-muted-foreground text-xs'>
                          {invoice.created_time
                            ? formatTimestampToDate(invoice.created_time)
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className='flex justify-end gap-2'>
                            {invoice.status === INVOICE_STATUS_PENDING && (
                              <>
                                <Button
                                  size='sm'
                                  onClick={() => setIssueTarget(invoice)}
                                >
                                  {t('Issue')}
                                </Button>
                                <Button
                                  variant='outline'
                                  size='sm'
                                  onClick={() => setRejectTarget(invoice)}
                                >
                                  {t('Reject')}
                                </Button>
                              </>
                            )}
                            {invoice.status === INVOICE_STATUS_ISSUED && (
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
                            )}
                            {invoice.status === 2 && (
                              <span className='text-muted-foreground text-xs'>
                                {invoice.reject_reason || '-'}
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

        <InvoiceIssueDialog
          open={issueTarget !== null}
          invoice={issueTarget}
          onOpenChange={(o) => {
            if (!o) setIssueTarget(null)
          }}
        />
        <InvoiceRejectDialog
          open={rejectTarget !== null}
          invoice={rejectTarget}
          onOpenChange={(o) => {
            if (!o) setRejectTarget(null)
          }}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
