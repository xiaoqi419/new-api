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

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT, MAX_GROUP_VIEW_CHIPS } from '../constants'
import {
  GROUP_RATIO_TONE_CLASS,
  formatGroupRatioLabel,
  getGroupRatioTone,
} from '../lib/model-helpers'
import { formatGroupChipPrice, type GroupChipPriceOptions } from '../lib/price'
import type { PricingModel, TokenUnit, UsableGroupMap } from '../types'

type PriceContext = Omit<GroupChipPriceOptions, 'dynamicLabel'>

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
  group: string
  price: string
  onClick: () => void
}) {
  const iconKey = props.model.icon || props.model.vendor_icon
  const icon = iconKey ? getLobeIcon(iconKey, 14) : null

  return (
    <button
      type='button'
      onClick={props.onClick}
      title={`${props.model.model_name} · ${props.price}`}
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-lg border px-2 py-1 text-xs transition-colors',
        'border-border/70 bg-background hover:border-primary/40 hover:bg-accent/60'
      )}
    >
      {icon && (
        <span className='flex size-3.5 shrink-0 items-center justify-center'>
          {icon}
        </span>
      )}
      <span className='text-foreground truncate font-mono font-medium'>
        {props.model.model_name}
      </span>
      <span className='text-muted-foreground shrink-0 font-mono tabular-nums'>
        {props.price}
      </span>
    </button>
  )
}

function GroupRow(props: {
  group: string
  models: PricingModel[]
  description?: string
  ctx: PriceContext
  expanded: boolean
  onToggleExpanded: () => void
  onModelClick: (modelName: string, group: string) => void
}) {
  const { t } = useTranslation()
  const ratio = props.ctx.groupRatio[props.group]
  const ratioLabel = formatGroupRatioLabel(ratio)
  const ratioTone = getGroupRatioTone(ratio)
  const tokenUnitLabel = props.ctx.tokenUnit === 'K' ? '1K' : '1M'
  const dynamicLabel = t('Dynamic Pricing')

  const hiddenCount = Math.max(props.models.length - MAX_GROUP_VIEW_CHIPS, 0)
  const visibleModels =
    props.expanded || hiddenCount === 0
      ? props.models
      : props.models.slice(0, MAX_GROUP_VIEW_CHIPS)

  // Vendor segments keep the parent sort order and are only labelled when the
  // group actually spans several vendors, otherwise the header is pure noise.
  const segments = useMemo(() => {
    const byVendor = new Map<string, PricingModel[]>()
    for (const model of visibleModels) {
      const key = model.vendor_name || ''
      const bucket = byVendor.get(key)
      if (bucket) {
        bucket.push(model)
      } else {
        byVendor.set(key, [model])
      }
    }
    return [...byVendor.entries()].map(([vendor, models]) => ({
      vendor,
      models,
      icon: models[0].vendor_icon
        ? getLobeIcon(models[0].vendor_icon, 14)
        : null,
    }))
  }, [visibleModels])

  return (
    <section className='rounded-xl border p-3'>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <h3 className='text-foreground text-sm font-semibold'>{props.group}</h3>
        {ratioLabel && (
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums',
              GROUP_RATIO_TONE_CLASS[ratioTone]
            )}
          >
            {ratioLabel}
          </span>
        )}
        <span className='text-muted-foreground text-xs tabular-nums'>
          {props.models.length}{' '}
          {props.models.length === 1 ? t('model') : t('models')}
        </span>
        <span className='text-muted-foreground text-xs'>
          {t('Input')} / {t('Output')} · {tokenUnitLabel}
        </span>
      </div>

      {props.description && props.description !== props.group && (
        <p className='text-muted-foreground mt-1 text-xs'>
          {props.description}
        </p>
      )}

      <div className='mt-2.5 space-y-2'>
        {segments.map((segment) => (
          <div key={segment.vendor || '__unknown'}>
            {segments.length > 1 && (
              <div className='text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px]'>
                {segment.icon && (
                  <span className='flex size-3.5 shrink-0 items-center justify-center'>
                    {segment.icon}
                  </span>
                )}
                <span className='font-medium'>
                  {segment.vendor || t('Other')}
                </span>
                <span className='tabular-nums'>{segment.models.length}</span>
              </div>
            )}
            <div className='flex flex-wrap gap-1.5'>
              {segment.models.map((model) => (
                <ModelChip
                  key={model.model_name}
                  model={model}
                  group={props.group}
                  price={formatGroupChipPrice(model, props.group, {
                    ...props.ctx,
                    dynamicLabel,
                  })}
                  onClick={() =>
                    props.onModelClick(model.model_name, props.group)
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          type='button'
          onClick={props.onToggleExpanded}
          className='text-muted-foreground hover:text-foreground mt-2 text-xs font-medium transition-colors'
        >
          {props.expanded
            ? t('Collapse')
            : t('Show all {{count}} models', { count: props.models.length })}
        </button>
      )}
    </section>
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

  const rows = useMemo(
    () =>
      props.groups
        .map((group) => ({
          group,
          models: props.models.filter((model) =>
            (model.enable_groups || []).includes(group)
          ),
        }))
        .filter((row) => row.models.length > 0),
    [props.groups, props.models]
  )

  if (rows.length === 0) {
    return (
      <div className='rounded-xl border p-6 text-center'>
        <p className='text-muted-foreground text-sm'>
          {t('No group has models matching the current filters.')}
        </p>
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      {rows.map((row) => (
        <GroupRow
          key={row.group}
          group={row.group}
          models={row.models}
          description={props.usableGroup[row.group]}
          ctx={ctx}
          expanded={expandedGroups.has(row.group)}
          onToggleExpanded={() => toggleExpanded(row.group)}
          onModelClick={props.onModelClick}
        />
      ))}
    </div>
  )
}
