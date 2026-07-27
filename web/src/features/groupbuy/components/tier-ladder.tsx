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
import { Check, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { formatShare } from '../lib'
import type { GroupBuyTier } from '../types'

interface TierLadderProps {
  tiers: GroupBuyTier[]
  paid: number
  currentAmount: number
}

export function TierLadder({ tiers, paid, currentAmount }: TierLadderProps) {
  const { t } = useTranslation()

  return (
    <div className='mt-4 flex flex-col gap-2'>
      {tiers.map((tier) => {
        const unlocked = paid >= tier.count
        const isCurrent = currentAmount === tier.per_share_amount && unlocked
        return (
          <div
            key={tier.count}
            className={cn(
              'flex items-center justify-between rounded-xl border px-3 py-2 transition-colors',
              isCurrent ? 'border-primary bg-primary/10' : 'border-border'
            )}
          >
            <span className='inline-flex items-center gap-2'>
              {unlocked ? (
                <Check className='text-primary size-4' />
              ) : (
                <Lock className='text-muted-foreground/40 size-4' />
              )}
              <span className='font-medium'>
                {tier.count} {t('people')}
              </span>
            </span>
            <span className={cn('font-semibold', unlocked && 'text-primary')}>
              {t('Each gets')} {formatShare(tier.per_share_amount)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
