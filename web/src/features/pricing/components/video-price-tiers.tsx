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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import { Video } from '@/components/icons'

import { getAvailableGroups } from '../lib/model-helpers'
import { formatGroupPrice } from '../lib/price'
import type {
  PricingModel,
  TokenUnit,
  UsableGroupMap,
  VideoPriceAxis,
  VideoPriceTier,
} from '../types'

type VideoPriceTierTableProps = {
  model: PricingModel
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  priceRate: number
  usdExchangeRate: number
  groupRatio: Record<string, number>
  usableGroup: UsableGroupMap
}

type TierRow = {
  key: string
  conditions: string[]
  listPrice: string
  groupPrices: Record<string, string>
}

export function VideoPriceTierTable(props: VideoPriceTierTableProps) {
  const { t } = useTranslation()
  const tiers = props.model.video_price_tiers

  const groups = useMemo(
    () => getAvailableGroups(props.model, props.usableGroup || {}),
    [props.model, props.usableGroup]
  )

  const rows = useMemo<TierRow[]>(() => {
    if (!tiers || tiers.base_price <= 0) return []

    return tiers.tiers.map((tier, index) => {
      const ratio = tier.price / tiers.base_price
      const groupPrices: Record<string, string> = {}
      for (const group of groups) {
        groupPrices[group] = formatTierPrice(
          props,
          ratio,
          props.groupRatio[group] || 1
        )
      }
      return {
        key: `tier-${index}`,
        conditions: tiers.axes.map((axis) => describeAxis(axis, tier, t)),
        listPrice: formatTierPrice(props, ratio, 1),
        groupPrices,
      }
    })
  }, [groups, props, t, tiers])

  if (rows.length === 0) return null

  return (
    <section className='min-w-0'>
      <div className='mb-3 flex items-start gap-2'>
        <span className='bg-chart-1/15 text-tag-1 mt-0.5 inline-flex size-6 items-center justify-center rounded-lg shadow-sm'>
          <Video className='size-3.5' />
        </span>
        <div>
          <div className='text-foreground text-base font-medium'>
            {t('Video tier pricing')}
          </div>
          <div className='text-muted-foreground text-xs'>
            {t(
              'Unit price changes with the output resolution, video input, and audio output of each request.'
            )}
          </div>
        </div>
      </div>

      <div className='space-y-1.5 sm:hidden'>
        {rows.map((row) => (
          <div key={row.key} className='rounded-md border p-2'>
            <div className='mb-1.5 flex flex-wrap items-center gap-1.5'>
              <span className='text-muted-foreground text-xs'>
                {row.conditions.join(' · ')}
              </span>
            </div>
            <div className='flex items-baseline justify-between gap-3'>
              <span className='text-muted-foreground text-xs'>
                {t('List price')}
              </span>
              <span className='font-mono text-sm font-semibold'>
                {row.listPrice}
              </span>
            </div>
            {groups.map((group) => (
              <div
                key={group}
                className='mt-1 flex items-baseline justify-between gap-3'
              >
                <GroupBadge
                  group={group}
                  ratio={props.groupRatio[group] || 1}
                  size='sm'
                />
                <span className='font-mono text-sm font-semibold'>
                  {row.groupPrices[group]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <StaticDataTable
        className='hidden rounded-none border-0 sm:block'
        tableClassName='text-sm'
        headerRowClassName='hover:bg-transparent'
        data={rows}
        getRowKey={(row) => row.key}
        columns={[
          {
            id: 'tier',
            header: t('Tier'),
            className: 'text-muted-foreground py-2 font-medium',
            cellClassName: 'align-top py-2.5',
            cell: (row) => <span>{row.conditions.join(' · ')}</span>,
          },
          {
            id: 'list-price',
            header: t('List price'),
            className: 'text-muted-foreground py-2 text-right font-medium',
            cellClassName: 'text-right align-top py-2.5 font-mono',
            cell: (row) => (
              <span
                className={groups.length > 0 ? 'text-muted-foreground' : ''}
              >
                {row.listPrice}
              </span>
            ),
          },
          ...groups.map((group) => ({
            id: `group-${group}`,
            header: (
              <span className='flex justify-end'>
                <GroupBadge
                  group={group}
                  ratio={props.groupRatio[group] || 1}
                  size='sm'
                />
              </span>
            ),
            className: 'text-muted-foreground py-2 text-right font-medium',
            cellClassName: 'text-right align-top py-2.5 font-mono',
            cell: (row: TierRow) => (
              <span className='font-semibold'>{row.groupPrices[group]}</span>
            ),
          })),
        ]}
      />

      {groups.length > 0 && (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(
            'The list price is what the tier costs before any group ratio; each group column already has that group ratio applied.'
          )}
        </p>
      )}
    </section>
  )
}

function describeAxis(
  axis: VideoPriceAxis,
  tier: VideoPriceTier,
  t: (key: string) => string
): string {
  if (axis === 'resolution') {
    const resolution = tier?.resolution?.trim()
    return resolution || t('Other resolutions')
  }
  if (axis === 'video_input') {
    return tier?.has_video ? t('With video input') : t('No video input')
  }
  return tier?.has_audio ? t('With audio') : t('Silent')
}

// 复用现成的定价格式化：把档位倍率乘进模型倍率后走同一条路径，货币换算与充值折扣就不会
// 和同屏「输入」那一栏出现两套算法。分组倍率从这里传进去，列价与「按分组定价」一致。
const BASE_GROUP_KEY = '_base'

function formatTierPrice(
  props: VideoPriceTierTableProps,
  ratio: number,
  groupRatio: number
): string {
  return formatGroupPrice(
    { ...props.model, model_ratio: props.model.model_ratio * ratio },
    BASE_GROUP_KEY,
    'input',
    props.tokenUnit,
    props.showRechargePrice,
    props.priceRate,
    props.usdExchangeRate,
    { [BASE_GROUP_KEY]: groupRatio }
  )
}
