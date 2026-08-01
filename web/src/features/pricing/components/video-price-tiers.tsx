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
import { Video } from '@/components/icons'
import { Badge } from '@/components/ui/badge'

import { formatGroupPrice } from '../lib/price'
import type {
  PricingModel,
  TokenUnit,
  VideoPriceAxis,
  VideoPriceTier,
} from '../types'

type VideoPriceTierTableProps = {
  model: PricingModel
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  priceRate: number
  usdExchangeRate: number
}

type TierRow = {
  key: string
  conditions: string[]
  ratio: number
  price: string
  isBase: boolean
}

export function VideoPriceTierTable(props: VideoPriceTierTableProps) {
  const { t } = useTranslation()
  const tiers = props.model.video_price_tiers

  const rows = useMemo<TierRow[]>(() => {
    if (!tiers || tiers.base_price <= 0) return []

    const describe = (tier: VideoPriceTier | null): string[] => {
      const parts: string[] = []
      for (const axis of tiers.axes) {
        parts.push(describeAxis(axis, tier, t))
      }
      return parts
    }

    // 基准档不在 tiers 里：它是「所有未单独列出的组合」,单价等于 base_price。
    const base: TierRow = {
      key: 'base',
      conditions: describe(null),
      ratio: 1,
      price: formatTierPrice(props, 1),
      isBase: true,
    }

    const rest = tiers.tiers.map((tier, index) => {
      const ratio = tier.price / tiers.base_price
      return {
        key: `tier-${index}`,
        conditions: describe(tier),
        ratio,
        price: formatTierPrice(props, ratio),
        isBase: false,
      }
    })

    return [base, ...rest]
  }, [props, t, tiers])

  if (rows.length <= 1) return null

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
              {row.isBase && (
                <Badge variant='secondary' className='bg-chart-1/15 text-tag-1'>
                  {t('Base tier')}
                </Badge>
              )}
              <span className='text-muted-foreground text-xs'>
                {row.conditions.join(' · ')}
              </span>
            </div>
            <div className='flex items-baseline justify-between gap-3'>
              <span className='font-mono text-sm font-semibold'>
                {row.price}
              </span>
              <span className='text-muted-foreground font-mono text-xs'>
                {formatRatio(row.ratio)}
              </span>
            </div>
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
            cell: (row) => (
              <div className='flex flex-wrap items-center gap-1.5'>
                {row.isBase && (
                  <Badge
                    variant='secondary'
                    className='bg-chart-1/15 text-tag-1'
                  >
                    {t('Base tier')}
                  </Badge>
                )}
                <span className={row.isBase ? 'text-muted-foreground' : ''}>
                  {row.conditions.join(' · ')}
                </span>
              </div>
            ),
          },
          {
            id: 'ratio',
            header: t('Ratio'),
            className: 'text-muted-foreground py-2 text-right font-medium',
            cellClassName: 'text-right align-top py-2.5 font-mono',
            cell: (row) => (
              <span className='text-muted-foreground'>
                {formatRatio(row.ratio)}
              </span>
            ),
          },
          {
            id: 'price',
            header: t('Unit price'),
            className: 'text-muted-foreground py-2 text-right font-medium',
            cellClassName: 'text-right align-top py-2.5 font-mono',
            cell: (row) => <span className='font-semibold'>{row.price}</span>,
          },
        ]}
      />
    </section>
  )
}

function describeAxis(
  axis: VideoPriceAxis,
  tier: VideoPriceTier | null,
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

function formatRatio(ratio: number): string {
  return `×${Number(ratio.toFixed(4))}`
}

// 复用现成的定价格式化：把档位倍率乘进模型倍率后走同一条路径，货币换算与充值折扣就不会
// 和同屏「输入」那一栏出现两套算法。分组倍率同样固定为 1，保证基准档与「输入」逐字相同。
const BASE_GROUP_KEY = '_base'

function formatTierPrice(
  props: VideoPriceTierTableProps,
  ratio: number
): string {
  return formatGroupPrice(
    { ...props.model, model_ratio: props.model.model_ratio * ratio },
    BASE_GROUP_KEY,
    'input',
    props.tokenUnit,
    props.showRechargePrice,
    props.priceRate,
    props.usdExchangeRate,
    { [BASE_GROUP_KEY]: 1 }
  )
}
