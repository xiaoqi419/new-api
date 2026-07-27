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
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

import { formatShare, tierBounds, unlockedAmount } from '../lib'
import type { GroupBuyHallItem } from '../types'
import { GroupBuyCountdown } from './group-buy-countdown'

interface HallCardProps {
  item: GroupBuyHallItem
  onOpen: (groupNo: string) => void
}

export function HallCard({ item, onOpen }: HallCardProps) {
  const { t } = useTranslation()
  const { minCount, maxCount, floorAmount, bestAmount } = tierBounds(item)
  const cap = maxCount || 1
  const paid = item.paid_count ?? 0
  const percent = Math.min(100, Math.round((paid / cap) * 100))
  const full = paid >= cap
  const tiered = minCount !== maxCount

  return (
    <Card
      data-card-hover='false'
      className='flex flex-col gap-0 overflow-hidden py-0'
    >
      <div className='bg-primary/10 flex items-start justify-between gap-2 px-4 pt-4 pb-3'>
        <div className='flex min-w-0 flex-col'>
          <span className='truncate font-semibold'>
            {item.package_name || t('Group Buy Top-up')}
          </span>
          <span className='text-muted-foreground text-xs'>
            {tiered
              ? `${t('Tiered')} · ${minCount}-${maxCount} ${t('people')}`
              : `${maxCount} ${t('to form group')}`}
          </span>
        </div>
        <StatusBadge
          label={full ? t('Full') : t('In Progress')}
          variant={full ? 'success' : 'info'}
          copyable={false}
        />
      </div>

      <CardContent className='flex flex-1 flex-col gap-3 p-4'>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground text-xs'>{t('Ends in')}</span>
          <GroupBuyCountdown expireTime={item.expire_time} size='sm' />
        </div>

        <div>
          <div className='mb-1 flex items-center justify-between'>
            <span className='text-sm'>
              {t('Joined')} {paid} / {cap} {t('people')}
            </span>
            <span className='text-primary text-sm font-semibold'>
              {t('Now each gets')} {formatShare(unlockedAmount(item))}
            </span>
          </div>
          <Progress value={percent} className='h-2' />
        </div>

        <div className='flex items-baseline gap-2'>
          <span className='text-primary text-2xl font-bold'>
            ¥{Number(item.per_share_price).toFixed(2)}
          </span>
          <span className='text-muted-foreground text-xs'>
            / {t('per person')}
          </span>
        </div>

        <p className='text-muted-foreground text-xs'>
          {tiered
            ? `${minCount} ${t('people get')} ${formatShare(floorAmount)} → ${maxCount} ${t('people get')} ${formatShare(bestAmount)}`
            : `${maxCount} ${t('to form group')} · ${t('each gets')} ${formatShare(bestAmount)}`}
        </p>

        <Button
          className='mt-auto w-full'
          onClick={() => onOpen(item.group_no)}
        >
          {full ? t('View Group') : t('Join Group Buy')}
        </Button>
      </CardContent>
    </Card>
  )
}
