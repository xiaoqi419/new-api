import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
/*
Copyright (C) 2023-2026 QuantumNous

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
import { Loader2 } from '@/components/icons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { formatShare } from '../lib'
import type { GroupBuyDetail } from '../types'

export interface PayOption {
  value: string
  label: string
}

interface JoinPanelProps {
  detail: GroupBuyDetail
  currentAmount: number
  canJoin: boolean
  payWay: string
  onPayWayChange: (value: string) => void
  payOptions: PayOption[]
  submitting: boolean
  onJoin: () => void
  shareLink: string
}

export function JoinPanel({
  detail,
  currentAmount,
  canJoin,
  payWay,
  onPayWayChange,
  payOptions,
  submitting,
  onJoin,
  shareLink,
}: JoinPanelProps) {
  const { t } = useTranslation()
  const [agreed, setAgreed] = useState(false)
  const price = Number(detail.per_share_price).toFixed(2)
  const currentPayLabel =
    payOptions.find((o) => o.value === payWay)?.label ??
    t('Select payment method')

  return (
    <div className='flex flex-col gap-3'>
      {detail.status === 'success' && (
        <Alert>
          <AlertDescription>
            {t('Group buy succeeded, quota has been credited')}
          </AlertDescription>
        </Alert>
      )}
      {detail.status === 'failed' && (
        <Alert>
          <AlertDescription>
            {t('Group buy did not succeed, paid members will be refunded')}
          </AlertDescription>
        </Alert>
      )}
      {detail.joined && detail.status === 'pending' && (
        <Alert>
          <AlertDescription>
            {t('You have joined. Share the link to invite friends')}
          </AlertDescription>
        </Alert>
      )}

      {canJoin && (
        <div className='flex flex-col gap-3'>
          <Select
            items={payOptions}
            value={payWay}
            onValueChange={(v) => v && onPayWayChange(v)}
          >
            <SelectTrigger className='w-full'>
              <SelectValue>{currentPayLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {payOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <div className='flex items-center gap-2'>
            <Checkbox
              id='gb-agree'
              checked={agreed}
              onCheckedChange={(c) => setAgreed(c === true)}
            />
            <Label htmlFor='gb-agree' className='text-muted-foreground text-sm'>
              {t('I have read and agree to the Group Buy Rules')}
            </Label>
          </div>

          <Button
            size='lg'
            className='w-full'
            disabled={payOptions.length === 0 || !agreed || submitting}
            onClick={onJoin}
          >
            {submitting && <Loader2 className='mr-2 size-4 animate-spin' />}
            {t('Join Now')} ¥{price} · {t('get')} {formatShare(currentAmount)}
          </Button>
        </div>
      )}

      <div className='border-border mt-1 flex items-center gap-2 border-t pt-3'>
        <span className='text-muted-foreground min-w-0 flex-1 truncate text-sm'>
          {shareLink}
        </span>
        <CopyButton
          value={shareLink}
          variant='outline'
          tooltip={t('Copy link')}
          aria-label={t('Copy link')}
        />
      </div>
    </div>
  )
}
