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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { getGroupRatioClassName } from '@/lib/colors'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT, MAX_GROUP_VIEW_CHIPS } from '../constants'
import { formatGroupRatioLabel } from '../lib/model-helpers'
import { formatGroupChipPrice, type GroupChipPriceOptions } from '../lib/price'
import type { PricingModel, TokenUnit, UsableGroupMap } from '../types'

type PriceContext = Omit<GroupChipPriceOptions, 'dynamicLabel'>

type GroupVendor = {
  name: string
  icon: React.ReactNode
}

type GroupRow = {
  group: string
  description?: string
  ratio: number
  models: PricingModel[]
  vendors: GroupVendor[]
}

export interface GroupViewProps {
  models: PricingModel[]
  groups: string[]
  groupRatio: Record<string, number>
  usableGroup: UsableGroupMap
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  onModelClick: (modelName: string, group: string) => void
}

function ModelChip(props: {
  model: PricingModel
  price: string
  onClick: () => void
}) {
  // 不放厂商图标:供应商已经是独立一列,每个 chip 再画一遍会把 chip 撑宽约 20px,
  // 几十个 chip 累积下来会让模型列一行只放得下一个。
  return (
    <button
      type='button'
      onClick={props.onClick}
      title={`${props.model.model_name} · ${props.price}`}
      className='border-border/70 bg-background hover:border-primary/40 hover:bg-accent/60 inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors'
    >
      <span className='text-foreground truncate font-mono font-medium'>
        {props.model.model_name}
      </span>
      <span className='text-muted-foreground shrink-0 font-mono tabular-nums'>
        {props.price}
      </span>
    </button>
  )
}

function VendorPills(props: { vendors: GroupVendor[] }) {
  return (
    <div className='flex flex-wrap gap-1'>
      {props.vendors.map((vendor) => (
        <span
          key={vendor.name}
          className='border-border/70 text-muted-foreground inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]'
        >
          {vendor.icon && (
            <span className='flex size-3.5 shrink-0 items-center justify-center'>
              {vendor.icon}
            </span>
          )}
          <span className='truncate'>{vendor.name}</span>
        </span>
      ))}
    </div>
  )
}

function ModelChips(props: {
  row: GroupRow
  ctx: PriceContext
  expanded: boolean
  onToggleExpanded: () => void
  onModelClick: (modelName: string, group: string) => void
}) {
  const { t } = useTranslation()
  const dynamicLabel = t('Dynamic Pricing')
  const hiddenCount = Math.max(
    props.row.models.length - MAX_GROUP_VIEW_CHIPS,
    0
  )
  const visible =
    props.expanded || hiddenCount === 0
      ? props.row.models
      : props.row.models.slice(0, MAX_GROUP_VIEW_CHIPS)

  return (
    <>
      <div className='flex flex-wrap gap-1.5'>
        {visible.map((model) => (
          <ModelChip
            key={model.model_name}
            model={model}
            price={formatGroupChipPrice(model, props.row.group, {
              ...props.ctx,
              dynamicLabel,
            })}
            onClick={() =>
              props.onModelClick(model.model_name, props.row.group)
            }
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type='button'
          onClick={props.onToggleExpanded}
          className='text-muted-foreground hover:text-foreground mt-1.5 text-xs font-medium transition-colors'
        >
          {props.expanded
            ? t('Collapse')
            : t('Show all {{count}} models', {
                count: props.row.models.length,
              })}
        </button>
      )}
    </>
  )
}

export function GroupView(props: GroupViewProps) {
  const { t } = useTranslation()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set()
  )

  const toggleExpanded = useCallback((group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }, [])

  const ctx: PriceContext = {
    tokenUnit: props.tokenUnit ?? DEFAULT_TOKEN_UNIT,
    showRechargePrice: props.showRechargePrice ?? false,
    priceRate: props.priceRate ?? 1,
    usdExchangeRate: props.usdExchangeRate ?? 1,
    groupRatio: props.groupRatio,
  }

  const unknownVendorLabel = t('Other')

  const rows = useMemo<GroupRow[]>(() => {
    return props.groups
      .map((group) => {
        const models = props.models.filter((model) =>
          (model.enable_groups || []).includes(group)
        )
        const vendorNames = new Map<string, string | undefined>()
        for (const model of models) {
          const name = model.vendor_name || unknownVendorLabel
          if (!vendorNames.has(name)) {
            vendorNames.set(name, model.vendor_icon)
          }
        }
        return {
          group,
          description: props.usableGroup[group],
          ratio: props.groupRatio[group] ?? 1,
          models,
          vendors: [...vendorNames.entries()]
            // 未归属厂商的模型排在最后,否则「其他」会插在两个真实厂商中间。
            .sort(([a], [b]) => {
              if (a === unknownVendorLabel) return 1
              if (b === unknownVendorLabel) return -1
              return a.localeCompare(b)
            })
            .map(([name, icon]) => ({
              name,
              icon: icon ? getLobeIcon(icon, 14) : null,
            })),
        }
      })
      .filter((row) => row.models.length > 0)
  }, [
    props.groups,
    props.models,
    props.groupRatio,
    props.usableGroup,
    unknownVendorLabel,
  ])

  if (rows.length === 0) {
    return (
      <div className='rounded-xl border p-6 text-center'>
        <p className='text-muted-foreground text-sm'>
          {t('No group has models matching the current filters.')}
        </p>
      </div>
    )
  }

  const tokenUnitLabel = ctx.tokenUnit === 'K' ? '1K' : '1M'

  return (
    <>
      <div className='space-y-2 lg:hidden'>
        {rows.map((row) => (
          <section key={row.group} className='rounded-xl border p-3'>
            <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
              <GroupBadge group={row.group} ratio={row.ratio} size='sm' />
              <span className='text-muted-foreground text-xs tabular-nums'>
                {row.models.length}{' '}
                {row.models.length === 1 ? t('model') : t('models')}
              </span>
            </div>
            {row.description && row.description !== row.group && (
              <p className='text-muted-foreground mt-1 text-xs'>
                {row.description}
              </p>
            )}
            <div className='mt-1.5'>
              <VendorPills vendors={row.vendors} />
            </div>
            <p className='text-muted-foreground mt-2 text-[11px]'>
              {t(
                'Available models · price is input / output per {{unit}} tokens',
                { unit: tokenUnitLabel }
              )}
            </p>
            <div className='mt-1'>
              <ModelChips
                row={row}
                ctx={ctx}
                expanded={expandedGroups.has(row.group)}
                onToggleExpanded={() => toggleExpanded(row.group)}
                onModelClick={props.onModelClick}
              />
            </div>
          </section>
        ))}
      </div>

      <StaticDataTable
        className='hidden lg:block'
        // table-fixed 是必须的:自动布局会让说明列按文字撑宽,把模型列压成窄柱。
        tableClassName='table-fixed text-sm'
        headerRowClassName='hover:bg-transparent'
        data={rows}
        getRowKey={(row) => row.group}
        columns={GROUP_COLUMNS.map((col) => ({
          id: col.id,
          header: col.header(t, tokenUnitLabel),
          className: cn('text-muted-foreground py-2 font-medium', col.width),
        }))}
        // chip 单独占一整行:挤在最后一列里时列宽只有约 480px,而带价格的 chip 中位
        // 宽 239px,一行放不下两个,几十个模型就变成一条竖直长柱。跨列后能排 3-4 个。
        renderRow={(row, index) => (
          <>
            <TableRow className='border-b-0 hover:bg-transparent'>
              {GROUP_COLUMNS.map((col) => (
                <TableCell
                  key={col.id}
                  className={cn('pt-3 pb-1 align-top', col.cellClassName)}
                >
                  {col.render(row, t)}
                </TableCell>
              ))}
            </TableRow>
            <TableRow
              className={cn(
                'hover:bg-transparent',
                index === rows.length - 1 && 'border-b-0'
              )}
            >
              <TableCell colSpan={GROUP_COLUMNS.length} className='pt-0 pb-3'>
                <ModelChips
                  row={row}
                  ctx={ctx}
                  expanded={expandedGroups.has(row.group)}
                  onToggleExpanded={() => toggleExpanded(row.group)}
                  onModelClick={props.onModelClick}
                />
              </TableCell>
            </TableRow>
          </>
        )}
      />
    </>
  )
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string

/**
 * One definition per column, feeding both the header row and the body cells so
 * a column's label and its cell can never drift apart.
 */
const GROUP_COLUMNS: {
  id: string
  width: string
  cellClassName?: string
  header: (t: TranslateFn, tokenUnitLabel: string) => string
  render: (row: GroupRow, t: TranslateFn) => React.ReactNode
}[] = [
  {
    id: 'group',
    width: 'w-[6.5rem]',
    header: (t) => t('Group'),
    render: (row) => (
      <span className='text-foreground font-mono font-medium break-all'>
        {row.group}
      </span>
    ),
  },
  {
    id: 'description',
    width: 'w-[11rem]',
    // TableCell 基类是 whitespace-nowrap,不解除的话这句中文会横着压到供应商列上。
    cellClassName: 'text-muted-foreground text-xs whitespace-normal',
    header: (t) => t('Description'),
    render: (row) =>
      row.description && row.description !== row.group ? row.description : '—',
  },
  {
    id: 'vendor',
    width: 'w-[8rem]',
    header: (t) => t('Vendor'),
    render: (row) => <VendorPills vendors={row.vendors} />,
  },
  {
    id: 'ratio',
    width: 'w-[5.5rem]',
    header: (t) => t('Group Ratio'),
    // 分组名已占第一列,这一格只出倍率,否则同一行把分组名印两遍。
    render: (row) => (
      <span
        className={cn(
          'inline-flex rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums',
          getGroupRatioClassName(row.ratio)
        )}
      >
        {formatGroupRatioLabel(row.ratio) ?? `x${row.ratio}`}
      </span>
    ),
  },
  {
    id: 'models',
    width: '',
    cellClassName: 'text-muted-foreground text-xs',
    header: (t, tokenUnitLabel) =>
      t('Available models · price is input / output per {{unit}} tokens', {
        unit: tokenUnitLabel,
      }),
    render: (row, t) => (
      <span className='tabular-nums'>
        {row.models.length} {row.models.length === 1 ? t('model') : t('models')}
      </span>
    ),
  },
]
