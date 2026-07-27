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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import { issueInvoice } from '../api'
import { MAX_INVOICE_FILE_BYTES } from '../constants'
import type { Invoice } from '../types'

interface InvoiceIssueDialogProps {
  open: boolean
  invoice: Invoice | null
  onOpenChange: (open: boolean) => void
}

export function InvoiceIssueDialog({
  open,
  invoice,
  onOpenChange,
}: InvoiceIssueDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    if (open) setFile(null)
  }, [open])

  const mutation = useMutation({
    mutationFn: (payload: { id: number; file: File }) =>
      issueInvoice(payload.id, payload.file),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Invoice issued'))
      void queryClient.invalidateQueries({ queryKey: ['invoices-admin'] })
      onOpenChange(false)
    },
  })

  const pickFile = (selected: File | null) => {
    if (!selected) {
      setFile(null)
      return
    }
    if (!selected.name.toLowerCase().endsWith('.pdf')) {
      toast.error(t('Only PDF files are supported'))
      return
    }
    if (selected.size > MAX_INVOICE_FILE_BYTES) {
      toast.error(t('File size cannot exceed 10MB'))
      return
    }
    setFile(selected)
  }

  const submit = () => {
    if (!invoice) return
    if (!file) {
      toast.error(t('Please select an invoice PDF file'))
      return
    }
    mutation.mutate({ id: invoice.id, file })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Upload Invoice PDF')}
      description={
        invoice
          ? `${t('Issue invoice for')} ${invoice.username} · $${invoice.amount}`
          : undefined
      }
      contentClassName='sm:max-w-md'
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
            {t('Confirm Issue')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-3'>
        <p className='text-muted-foreground text-sm'>
          {t('Upload the issued invoice file (PDF, up to 10MB).')}
        </p>
        <input
          ref={inputRef}
          type='file'
          accept='application/pdf'
          className='hidden'
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <div className='flex items-center gap-2'>
          <Button variant='outline' onClick={() => inputRef.current?.click()}>
            <Upload className='mr-2 size-4' />
            {t('Choose File')}
          </Button>
          <span className='text-muted-foreground min-w-0 flex-1 truncate text-sm'>
            {file ? file.name : t('No file selected')}
          </span>
        </div>
      </div>
    </Dialog>
  )
}
