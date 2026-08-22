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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatTimestampToDate } from '@/lib/format'

import { getEligibleOrders, submitInvoice } from '../api'
import { TITLE_TYPE_COMPANY, TITLE_TYPE_PERSONAL } from '../constants'
import type { TitleType } from '../types'

interface InvoiceApplyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InvoiceApplyDialog({
  open,
  onOpenChange,
}: InvoiceApplyDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [titleType, setTitleType] = useState<TitleType>(TITLE_TYPE_PERSONAL)
  const [title, setTitle] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [email, setEmail] = useState('')
  const [remark, setRemark] = useState('')

  useEffect(() => {
    if (!open) return
    setSelectedIds([])
    setTitleType(TITLE_TYPE_PERSONAL)
    setTitle('')
    setTaxNumber('')
    setEmail('')
    setRemark('')
  }, [open])

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['invoice-eligible'],
    queryFn: async () => (await getEligibleOrders()).data ?? [],
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: submitInvoice,
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Invoice request submitted'))
      void queryClient.invalidateQueries({ queryKey: ['invoices-self'] })
      onOpenChange(false)
    },
  })

  const selectedTotal = orders
    .filter((o) => selectedIds.includes(o.id))
    .reduce((sum, o) => sum + (o.money ?? 0), 0)

  const allSelected = orders.length > 0 && selectedIds.length === orders.length

  const toggleOrder = (id: number, checked: boolean) =>
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    )

  const submit = () => {
    if (selectedIds.length === 0) {
      toast.error(t('Select at least one paid order'))
      return
    }
    if (!title.trim()) {
      toast.error(t('Invoice title is required'))
      return
    }
    if (titleType === TITLE_TYPE_COMPANY && !taxNumber.trim()) {
      toast.error(t('Tax number is required for company invoices'))
      return
    }
    mutation.mutate({
      order_ids: selectedIds,
      title_type: titleType,
      title: title.trim(),
      tax_number: taxNumber.trim(),
      email: email.trim(),
      remark: remark.trim(),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Apply for Invoice')}
      contentClassName='sm:max-w-2xl'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && (
              <Loader2 className='mr-2 size-4 animate-spin' />
            )}
            {t('Submit')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label>{t('Select paid orders')}</Label>
          <div className='max-h-56 overflow-y-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-10'>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(c) =>
                        setSelectedIds(
                          c === true ? orders.map((o) => o.id) : []
                        )
                      }
                      aria-label={t('Select all')}
                    />
                  </TableHead>
                  <TableHead>{t('Trade No')}</TableHead>
                  <TableHead>{t('Amount')}</TableHead>
                  <TableHead>{t('Paid At')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className='py-6 text-center'>
                      <Loader2 className='text-primary mx-auto size-5 animate-spin' />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && orders.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className='text-muted-foreground py-6 text-center text-sm'
                    >
                      {t('No invoiceable orders')}
                    </TableCell>
                  </TableRow>
                )}
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(order.id)}
                        onCheckedChange={(c) =>
                          toggleOrder(order.id, c === true)
                        }
                        aria-label={order.trade_no}
                      />
                    </TableCell>
                    <TableCell className='font-mono text-xs'>
                      {order.trade_no}
                    </TableCell>
                    <TableCell>
                      ${Number(order.money ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-xs'>
                      {order.complete_time
                        ? formatTimestampToDate(order.complete_time)
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className='text-sm'>
            <span className='text-muted-foreground'>
              {t('Invoice total')}:{' '}
            </span>
            <span className='font-semibold'>${selectedTotal.toFixed(2)}</span>
          </p>
        </div>

        <div className='flex flex-col gap-2'>
          <Label>{t('Title Type')}</Label>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant={
                titleType === TITLE_TYPE_PERSONAL ? 'default' : 'outline'
              }
              size='sm'
              onClick={() => setTitleType(TITLE_TYPE_PERSONAL)}
            >
              {t('Personal')}
            </Button>
            <Button
              type='button'
              variant={titleType === TITLE_TYPE_COMPANY ? 'default' : 'outline'}
              size='sm'
              onClick={() => setTitleType(TITLE_TYPE_COMPANY)}
            >
              {t('Company')}
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-2'>
          <Label htmlFor='inv-title'>{t('Invoice Title')}</Label>
          <Input
            id='inv-title'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('Enter invoice title')}
          />
        </div>

        {titleType === TITLE_TYPE_COMPANY && (
          <div className='flex flex-col gap-2'>
            <Label htmlFor='inv-tax'>{t('Tax Number')}</Label>
            <Input
              id='inv-tax'
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder={t('Enter company tax number')}
            />
          </div>
        )}

        <div className='flex flex-col gap-2'>
          <Label htmlFor='inv-email'>{t('Email')}</Label>
          <Input
            id='inv-email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('For receiving the e-invoice')}
          />
        </div>

        <div className='flex flex-col gap-2'>
          <Label htmlFor='inv-remark'>{t('Remark')}</Label>
          <Textarea
            id='inv-remark'
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
            placeholder={t('Optional')}
          />
        </div>
      </div>
    </Dialog>
  )
}
