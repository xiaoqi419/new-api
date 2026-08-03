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
import { StatusBadge } from '@/components/status-badge'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  avatarColorMap,
  getGroupRatioClassName,
  getVendorColor,
} from '@/lib/colors'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT, MAX_GROUP_VIEW_CHIPS } from '../constants'
import { formatGroupRatioLabel } from '../lib/model-helpers'
import { formatGroupChipPrice, type GroupChipPriceOptions } from '../lib/price'
import type { PricingModel, TokenUnit, UsableGroupMap } from '../types'

type PriceContext = Omit<GroupChipPriceOptions, 'dynamicLabel'>

/** A group's models grouped by the vendor that serves them. */
type VendorSegment = {
  name: string
  colorClassName: string
  variant: ReturnType<typeof getVendorColor>
  models: PricingModel[]
}

type GroupRow = {
  group: string
  description?: string
  ratio: number
  modelCount: number
  segments: VendorSegment[]
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
  colorClassName: string
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={props.onClick}
      title={`${props.model.model_name} · ${props.price}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] transition-opacity hover:opacity-75',
        props.colorClassName
      )}
    >
      <span className='truncate font-mono font-medium'>
        {props.model.model_name}
      </span>
      <span className='shrink-0 font-mono tabular-nums opacity-70'>
        {props.price}
      </span>
    </button>
  )
}

/**
 * One vendor's row inside a group: the vendor on the left, the models it serves
 * on the right, both in that vendor's color. Mirrors the reference layout, where
 * a group spanning five domestic vendors stays readable instead of collapsing
 * into one undifferentiated run of chips.
 */
function VendorSegmentRow(props: {
  segment: VendorSegment
  group: string
  ctx: PriceContext
  dynamicLabel: string
  onModelClick: (modelName: string, group: string) => void
}) {
  return (
    <div className='flex flex-col gap-1 sm:flex-row sm:gap-3'>
      <div className='shrink-0 pt-0.5 sm:w-[8.5rem]'>
        <StatusBadge
          variant={props.segment.variant}
          label={props.segment.name}
          showDot
          size='sm'
        />
      </div>
      <div className='flex min-w-0 flex-1 flex-wrap gap-1.5'>
        {props.segment.models.map((model) => (
          <ModelChip
            key={model.model_name}
            model={model}
            colorClassName={props.segment.colorClassName}
            price={formatGroupChipPrice(model, props.group, {
              ...props.ctx,
              dynamicLabel: props.dynamicLabel,
            })}
            onClick={() => props.onModelClick(model.model_name, props.group)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Trim a group's vendor segments down to the collapsed chip budget, dropping
 * whole trailing segments once the budget runs out so a collapsed group never
 * shows a vendor with an empty model list.
 */
function limitSegments(
  segments: VendorSegment[],
  budget: number
): VendorSegment[] {
  const limited: VendorSegment[] = []
  let remaining = budget

  for (const segment of segments) {
    if (remaining <= 0) break
    limited.push({ ...segment, models: segment.models.slice(0, remaining) })
    remaining -= segment.models.length
  }

  return limited
}

function GroupModels(props: {
  row: GroupRow
  ctx: PriceContext
  expanded: boolean
  onToggleExpanded: () => void
  onModelClick: (modelName: string, group: string) => void
}) {
  const { t } = useTranslation()
  const dynamicLabel = t('Dynamic Pricing')
  const hiddenCount = Math.max(props.row.modelCount - MAX_GROUP_VIEW_CHIPS, 0)
  const segments =
    props.expanded || hiddenCount === 0
      ? props.row.segments
      : limitSegments(props.row.segments, MAX_GROUP_VIEW_CHIPS)

  return (
    <div className='space-y-2'>
      {segments.map((segment) => (
        <VendorSegmentRow
          key={segment.name}
          segment={segment}
          group={props.row.group}
          ctx={props.ctx}
          dynamicLabel={dynamicLabel}
          onModelClick={props.onModelClick}
        />
      ))}
      {hiddenCount > 0 && (
        <button
          type='button'
          onClick={props.onToggleExpanded}
          className='text-muted-foreground hover:text-foreground text-xs font-medium transition-colors'
        >
          {props.expanded
            ? t('Collapse')
            : t('Show all {{count}} models', { count: props.row.modelCount })}
        </button>
      )}
    </div>
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
        const byVendor = new Map<string, PricingModel[]>()
        const icons = new Map<string, string | undefined>()

        for (const model of props.models) {
          if (!(model.enable_groups || []).includes(group)) continue
          const name = model.vendor_name || unknownVendorLabel
          const bucket = byVendor.get(name)
          if (bucket) {
            bucket.push(model)
          } else {
            byVendor.set(name, [model])
            icons.set(name, model.vendor_icon)
          }
        }

        const segments = [...byVendor.entries()]
          // 未归属厂商的模型排在最后,否则「其他」会插在两家真实厂商中间。
          .sort(([a], [b]) => {
            if (a === unknownVendorLabel) return 1
            if (b === unknownVendorLabel) return -1
            return a.localeCompare(b)
          })
          .map(([name, models]) => {
            const variant = getVendorColor({ name, icon: icons.get(name) })
            return {
              name,
              variant,
              colorClassName: avatarColorMap[variant],
              models,
            }
          })

        return {
          group,
          description: props.usableGroup[group],
          ratio: props.groupRatio[group] ?? 1,
          modelCount: segments.reduce((sum, s) => sum + s.models.length, 0),
          segments,
        }
      })
      .filter((row) => row.modelCount > 0)
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
              <span className='font-mono text-sm font-medium'>{row.group}</span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums',
                  getGroupRatioClassName(row.ratio)
                )}
              >
                {formatGroupRatioLabel(row.ratio) ?? `x${row.ratio}`}
              </span>
              <span className='text-muted-foreground text-xs tabular-nums'>
                {row.modelCount}{' '}
                {row.modelCount === 1 ? t('model') : t('models')}
              </span>
            </div>
            {row.description && row.description !== row.group && (
              <p className='text-muted-foreground mt-1 text-xs'>
                {row.description}
              </p>
            )}
            <div className='mt-2'>
              <GroupModels
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
        // table-fixed 是必须的:自动布局会让说明列按文字撑宽,挤掉右边的模型区。
        tableClassName='table-fixed text-sm'
        headerRowClassName='bg-muted/40 hover:bg-muted/40'
        data={rows}
        getRowKey={(row) => row.group}
        columns={GROUP_COLUMNS.map((col) => ({
          id: col.id,
          header: col.header(t),
          className: cn('text-muted-foreground py-2.5 font-medium', col.width),
        }))}
        // 厂商分段需要整行宽度:塞进最后一列时列宽只有约 480px,带价格的 chip 中位
        // 宽 239px,一行放不下两个,几十个模型会变成一条竖直长柱。
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
              <TableCell colSpan={GROUP_COLUMNS.length} className='pt-0 pb-4'>
                <GroupModels
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

      <p className='text-muted-foreground mt-2 text-xs'>
        {t(
          'Prices are input / output per {{unit}} tokens, with this group ratio already applied.',
          { unit: tokenUnitLabel }
        )}
      </p>
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
  header: (t: TranslateFn) => string
  render: (row: GroupRow, t: TranslateFn) => React.ReactNode
}[] = [
  {
    id: 'group',
    width: 'w-[9rem]',
    header: (t) => t('Group'),
    render: (row) => (
      <span className='text-foreground font-mono font-medium break-all'>
        {row.group}
      </span>
    ),
  },
  {
    id: 'description',
    width: 'w-[16rem]',
    // TableCell 基类是 whitespace-nowrap,不解除的话长说明会横向压到右边的列上。
    cellClassName: 'text-muted-foreground text-xs whitespace-normal',
    header: (t) => t('Description'),
    render: (row) =>
      row.description && row.description !== row.group ? row.description : '—',
  },
  {
    id: 'ratio',
    width: 'w-[6rem]',
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
    header: (t) => t('Vendors and their models'),
    render: (row, t) => (
      <span className='tabular-nums'>
        {row.modelCount} {row.modelCount === 1 ? t('model') : t('models')}
      </span>
    ),
  },
]
