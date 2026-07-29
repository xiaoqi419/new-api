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
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { grantLotteryCards } from '../api'

interface LotteryGrantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LotteryGrantDialog({
  open,
  onOpenChange,
}: LotteryGrantDialogProps) {
  const { t } = useTranslation()
  const [userId, setUserId] = useState('')
  const [count, setCount] = useState('1')

  useEffect(() => {
    if (open) {
      setUserId('')
      setCount('1')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: (payload: { userId: number; count: number }) =>
      grantLotteryCards(payload.userId, payload.count),
    onSuccess: (res) => {
      if (!res.success) return
      toast.success(t('Lottery cards granted'))
      onOpenChange(false)
    },
  })

  const submit = () => {
    const uid = Number(userId)
    const n = Number(count)
    if (!uid || uid <= 0) {
      toast.error(t('Please enter a valid user ID'))
      return
    }
    if (!n || n <= 0) {
      toast.error(t('Please enter a valid count'))
      return
    }
    mutation.mutate({ userId: uid, count: n })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Grant Lottery Cards')}
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
            {t('Grant')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-3'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='grant-user-id'>{t('User ID')}</Label>
          <Input
            id='grant-user-id'
            type='number'
            min={1}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='grant-count'>{t('Number of cards')}</Label>
          <Input
            id='grant-count'
            type='number'
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  )
}
