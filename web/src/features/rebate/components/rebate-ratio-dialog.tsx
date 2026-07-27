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
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { setUserRebateRatio } from '../api'
import type { RebateUser } from '../types'

interface RebateRatioDialogProps {
  open: boolean
  user: RebateUser | null
  onOpenChange: (open: boolean) => void
}

export function RebateRatioDialog({
  open,
  user,
  onOpenChange,
}: RebateRatioDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [ratio, setRatio] = useState('')

  useEffect(() => {
    if (open) {
      setRatio(
        user?.rebate_ratio === null || user?.rebate_ratio === undefined
          ? ''
          : String(user.rebate_ratio)
      )
    }
  }, [open, user])

  const mutation = useMutation({
    mutationFn: (payload: { userId: number; ratio: number | null }) =>
      setUserRebateRatio(payload.userId, payload.ratio),
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Operation failed'))
        return
      }
      toast.success(t('Rebate ratio saved'))
      void queryClient.invalidateQueries({ queryKey: ['rebate-users'] })
      onOpenChange(false)
    },
  })

  const submit = () => {
    if (!user) return
    const trimmed = ratio.trim()
    if (trimmed === '') {
      mutation.mutate({ userId: user.id, ratio: null })
      return
    }
    const value = Number(trimmed)
    if (Number.isNaN(value) || value < 0 || value > 1) {
      toast.error(t('Enter a ratio between 0 and 1'))
      return
    }
    mutation.mutate({ userId: user.id, ratio: value })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Set Exclusive Rebate Ratio')}
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
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Leave empty to use the global default ratio. Range 0 to 1, e.g. 0.1 means 10% of the top-up amount.'
          )}
        </p>
        <Label htmlFor='rebate-ratio-input'>{t('Rebate Ratio')}</Label>
        <Input
          id='rebate-ratio-input'
          type='number'
          min={0}
          max={1}
          step={0.01}
          value={ratio}
          onChange={(e) => setRatio(e.target.value)}
          placeholder={t('Leave empty to use global default')}
        />
      </div>
    </Dialog>
  )
}
