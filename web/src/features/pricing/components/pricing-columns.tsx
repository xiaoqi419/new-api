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
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { BadgeListCell } from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import { getLobeIcon } from '@/lib/lobe-icon'

import { ModalityFlow } from '../lib/modality'
import type { PricingModel } from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelPriceCell, type ModelPriceCellOptions } from './model-price-cell'

// ----------------------------------------------------------------------------
// Pricing Table Columns (ephone-style: Model / Type / Price / Context / Released / Groups)
// ----------------------------------------------------------------------------

export type PricingColumnsOptions = ModelPriceCellOptions

const RECENT_RELEASE_DAYS = 45

function isRecentRelease(model: PricingModel): boolean {
  const raw = model.release_date?.trim()
  if (!raw) return false
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return false
  const diff = Date.now() - parsed
  return diff >= 0 && diff <= RECENT_RELEASE_DAYS * 24 * 60 * 60 * 1000
}

export function usePricingColumns(
  options: PricingColumnsOptions = {}
): ColumnDef<PricingModel>[] {
  const { t } = useTranslation()

  return [
    // Model column
    {
      accessorKey: 'model_name',
      meta: { label: t('Model'), pinned: 'left' },
      header: t('Model'),
      cell: ({ row }) => {
        const model = row.original
        const modelIconKey = model.icon || model.vendor_icon
        const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 16) : null

        return (
          <div className='flex max-w-full min-w-0 items-center gap-2'>
            {modelIcon}
            <span className='truncate font-mono text-sm font-medium'>
              {model.model_name}
            </span>
            {isRecentRelease(model) && (
              <span className='bg-info/10 text-foreground dark:bg-success/15 dark:text-success shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase'>
                {t('New')}
              </span>
            )}
          </div>
        )
      },
      minSize: 220,
      enableSorting: false,
    },

    // Type column (input -> output modalities, falls back to billing mode)
    {
      id: 'modality',
      header: t('Type'),
      cell: ({ row }) => {
        const model = row.original
        const flow = (
          <ModalityFlow
            input={model.input_modalities}
            output={model.output_modalities}
            size={15}
          />
        )
        if (
          (model.input_modalities?.length ?? 0) > 0 ||
          (model.output_modalities?.length ?? 0) > 0
        ) {
          return flow
        }
        return <ModelBillingModeBadge model={model} className='-ml-1.5' />
      },
      size: 120,
      enableSorting: false,
    },

    // Price column
    {
      accessorKey: 'price',
      meta: { label: t('Price') },
      header: t('Price'),
      cell: ({ row }) => (
        <ModelPriceCell model={row.original} options={options} />
      ),

      size: 160,
      enableSorting: false,
    },

    // Context length column
    {
      id: 'context',
      header: t('Context'),
      cell: ({ row }) => {
        const context = row.original.context_length
        if (!context || context <= 0) {
          return <span className='text-muted-foreground text-xs'>—</span>
        }
        return (
          <span className='font-mono text-sm tabular-nums'>
            {context.toLocaleString()}
          </span>
        )
      },
      size: 110,
      enableSorting: false,
    },

    // Release date column
    {
      id: 'release',
      header: t('Released'),
      cell: ({ row }) => {
        const release = row.original.release_date?.trim()
        if (!release) {
          return <span className='text-muted-foreground text-xs'>—</span>
        }
        return (
          <span className='text-muted-foreground font-mono text-xs tabular-nums'>
            {release}
          </span>
        )
      },
      size: 110,
      enableSorting: false,
    },

    // Enable Groups column
    {
      accessorKey: 'enable_groups',
      header: t('Groups'),
      cell: ({ row }) => {
        const groups = row.original.enable_groups || []
        return (
          <BadgeListCell
            items={groups.map((group) => (
              <GroupBadge key={group} group={group} size='sm' />
            ))}
            tooltipClassName='max-w-[280px] p-2'
          />
        )
      },
      size: 140,
      enableSorting: false,
    },
  ]
}
