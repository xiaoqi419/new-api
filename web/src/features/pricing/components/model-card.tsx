import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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
import { Copy } from '@/components/icons'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import { formatPrice, formatRequestPrice } from '../lib/price'
import type { PricingModel, TokenUnit } from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelPerfBadge, type ModelPerfBadgeData } from './model-perf-badge'

export interface ModelCardProps {
  model: PricingModel
  onClick: () => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  perf?: ModelPerfBadgeData
}

export const ModelCard = memo(function ModelCard(props: ModelCardProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const priceRate = props.priceRate ?? 1
  const usdExchangeRate = props.usdExchangeRate ?? 1
  const showRechargePrice = props.showRechargePrice ?? false
  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
  const tags = parseTags(props.model.tags)
  const groups = props.model.enable_groups || []
  const endpoints = props.model.supported_endpoint_types || []
  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 28) : null
  const initial = props.model.model_name?.charAt(0).toUpperCase() || '?'
  const isDynamicPricing =
    props.model.billing_mode === 'tiered_expr' &&
    Boolean(props.model.billing_expr)
  const hasCachedPrice = isTokenBased && props.model.cache_ratio != null
  const dynamicSummary = isDynamicPricing
    ? getDynamicPricingSummary(props.model, {
        tokenUnit,
        showRechargePrice,
        priceRate,
        usdExchangeRate,
        groupRatioMultiplier: getDynamicDisplayGroupRatio(
          props.model,
          props.selectedGroup
        ),
      })
    : null

  const primaryGroup = groups[0]
  const bottomTags = [...endpoints.slice(0, 2), ...tags.slice(0, 2)]
  const hiddenCount =
    Math.max(groups.length - 1, 0) +
    Math.max(endpoints.length - 2, 0) +
    Math.max(tags.length - 2, 0)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(props.model.model_name || '')
  }

  let priceSummary: ReactNode
  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      priceSummary = (
        <span className='min-w-0'>
          <span className='text-warning'>
            {t('Special billing expression')}
          </span>
          <code className='text-muted-foreground mt-0.5 line-clamp-1 block font-mono text-[11px] break-all'>
            {dynamicSummary.rawExpression}
          </code>
        </span>
      )
    } else if (dynamicSummary.primaryEntries.length > 0) {
      priceSummary = (
        <>
          {dynamicSummary.primaryEntries.map((entry) => (
            <span
              key={entry.key}
              className='text-muted-foreground whitespace-nowrap'
            >
              {t(entry.shortLabel)}{' '}
              <span className='text-foreground font-mono font-semibold'>
                {entry.formatted}
              </span>
            </span>
          ))}
        </>
      )
    } else {
      priceSummary = (
        <span className='text-muted-foreground text-sm'>
          {t('Dynamic Pricing')}
        </span>
      )
    }
  } else if (isTokenBased) {
    priceSummary = (
      <>
        <span className='text-muted-foreground whitespace-nowrap'>
          {t('Input')}{' '}
          <span className='text-foreground font-mono font-semibold'>
            {formatPrice(
              props.model,
              'input',
              tokenUnit,
              showRechargePrice,
              priceRate,
              usdExchangeRate,
              props.selectedGroup
            )}
          </span>
        </span>
        <span className='text-muted-foreground whitespace-nowrap'>
          {t('Output')}{' '}
          <span className='text-foreground font-mono font-semibold'>
            {formatPrice(
              props.model,
              'output',
              tokenUnit,
              showRechargePrice,
              priceRate,
              usdExchangeRate,
              props.selectedGroup
            )}
          </span>
        </span>
        {hasCachedPrice && (
          <span className='text-muted-foreground whitespace-nowrap'>
            {t('Cached')}{' '}
            <span className='text-foreground font-mono font-semibold'>
              {formatPrice(
                props.model,
                'cache',
                tokenUnit,
                showRechargePrice,
                priceRate,
                usdExchangeRate,
                props.selectedGroup
              )}
            </span>
          </span>
        )}
      </>
    )
  } else {
    priceSummary = (
      <span className='text-muted-foreground whitespace-nowrap'>
        <span className='text-foreground font-mono font-semibold'>
          {formatRequestPrice(
            props.model,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
        </span>{' '}
        / {t('request')}
      </span>
    )
  }

  return (
    <article
      data-pricing-model-card
      className={cn(
        'group relative flex min-h-[154px] flex-col overflow-hidden rounded-[16px] border border-[#e2e2de] bg-white p-3 transition-[border-color,box-shadow,transform] duration-200 motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:border-[#c7c7c1] hover:shadow-[0_10px_24px_rgba(0,0,0,0.08)] dark:border-white/12 dark:bg-[#151515] dark:hover:border-white/25 dark:hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)] xl:h-[142px] xl:min-h-0'
      )}
    >
      <button
        type='button'
        onClick={props.onClick}
        className='absolute inset-0 z-0 rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[#2f00e5] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111]'
        aria-label={props.model.model_name}
      />
      <div className='pointer-events-none relative z-10 flex h-full flex-col'>
        <div className='flex items-start justify-between gap-2'>
          <div className='flex min-w-0 items-start gap-2'>
            <div className='flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f1f1f1] dark:bg-white/10'>
              {modelIcon || (
                <span className='text-xs font-bold text-[#626262] dark:text-[#a8a8a8]'>
                  {initial}
                </span>
              )}
            </div>
            <div className='min-w-0'>
              <h3
                title={props.model.model_name}
                className='text-foreground truncate font-mono text-[13px] leading-[18px] font-bold'
              >
                {props.model.model_name}
              </h3>
              <div className='mt-0.5 flex max-h-9 flex-wrap items-baseline gap-x-2 gap-y-0 overflow-hidden text-[10px] leading-4'>
                {priceSummary}
              </div>
            </div>
          </div>

          <div className='flex shrink-0 items-center'>
            <button
              type='button'
              onClick={handleCopy}
              className='pointer-events-auto rounded-full p-1.5 text-[#777] transition-colors hover:bg-[#f1f1f1] hover:text-[#111] motion-reduce:transition-none dark:text-[#a8a8a8] dark:hover:bg-white/10 dark:hover:text-white'
              title={t('Copy')}
              aria-label={t('Copy')}
            >
              <Copy className='size-3' />
            </button>
          </div>
        </div>

        <p
          title={props.model.description}
          className='mt-2 line-clamp-1 flex-1 text-[11px] leading-4 text-[#626262] dark:text-[#a8a8a8]'
        >
          {props.model.description || t('No description available.')}
        </p>

        <div className='mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1'>
          <div className='flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1'>
            {primaryGroup && (
              <span className='max-w-[84px] truncate text-[10px] font-semibold text-[#626262] dark:text-[#a8a8a8]'>
                {primaryGroup}
              </span>
            )}
            <ModelBillingModeBadge model={props.model} />
          </div>
          <ModelPerfBadge perf={props.perf} className='row-span-2 self-start' />

          <div className='flex min-w-0 items-center gap-x-1.5 overflow-hidden text-[10px]'>
            {bottomTags.map((item) => (
              <span
                key={item}
                className='truncate text-[#8a8a8a] dark:text-[#8a8a8a]'
              >
                {item}
              </span>
            ))}
            <span className='shrink-0 text-[#8a8a8a]'>{tokenUnitLabel}</span>
            {hiddenCount > 0 && (
              <span className='shrink-0 text-[#8a8a8a]'>+{hiddenCount}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
})
