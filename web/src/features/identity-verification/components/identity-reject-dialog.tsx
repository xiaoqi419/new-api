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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { rejectIdentityVerification } from '../api'
import type { IdentityVerification } from '../types'

interface IdentityRejectDialogProps {
  open: boolean
  record: IdentityVerification | null
  onOpenChange: (open: boolean) => void
}

export function IdentityRejectDialog({
  open,
  record,
  onOpenChange,
}: IdentityRejectDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const mutation = useMutation({
    mutationFn: (payload: { id: number; reason: string }) =>
      rejectIdentityVerification(payload.id, payload.reason),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Request rejected'))
      void queryClient.invalidateQueries({
        queryKey: ['identity-verification-admin'],
      })
      onOpenChange(false)
    },
  })

  const submit = () => {
    if (!record) return
    mutation.mutate({ id: record.id, reason: reason.trim() })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Reject Verification Request')}
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
          <Button
            variant='destructive'
            onClick={submit}
            disabled={mutation.isPending}
          >
            {mutation.isPending && (
              <Loader2 className='mr-2 size-4 animate-spin' />
            )}
            {t('Confirm Reject')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-2'>
        <Label htmlFor='iv-reject-reason'>{t('Rejection Reason')}</Label>
        <Textarea
          id='iv-reject-reason'
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={t('Enter the rejection reason')}
        />
      </div>
    </Dialog>
  )
}
