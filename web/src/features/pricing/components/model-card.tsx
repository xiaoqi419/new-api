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

import { memo, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Copy } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import {
  getCardExamplePrice,
  getDynamicPriceUnitLabelKey,
  isUnconfiguredTaskUsageModel,
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import { formatPrice, formatRequestPrice } from '../lib/price'
import { taskPriceLabel, taskUsageUnitLabel } from '../lib/task-price-display'
import type { PricingModel, PriceType, TokenUnit } from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelPerfBadge, type ModelPerfBadgeData } from './model-perf-badge'

export interface ModelCardProps {
  model: PricingModel
  onClick: (modelName: string) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  perf?: ModelPerfBadgeData
}

export const ModelCard = memo(function ModelCard(props: ModelCardProps) {
  const { t, i18n } = useTranslation()
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
  const isUnconfiguredTaskUsage = isUnconfiguredTaskUsageModel(props.model)
  const billingTime = useBillingTime(props.model.billing_expr)
  const currency = useSystemConfigStore((state) => state.config.currency)
  const dynamicPriceOptions = useMemo(
    () => ({
      now: billingTime === undefined ? undefined : new Date(billingTime),
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      groupRatioMultiplier: getDynamicDisplayGroupRatio(
        props.model,
        props.selectedGroup
      ),
    }),
    [
      props.model,
      props.selectedGroup,
      billingTime,
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
    ]
  )
  const dynamicSummary = useMemo(
    () => getDynamicPricingSummary(props.model, dynamicPriceOptions),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.model, dynamicPriceOptions, currency]
  )
  const cardExamplePrice = useMemo(
    () => getCardExamplePrice(props.model, dynamicPriceOptions),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.model, dynamicPriceOptions, currency]
  )
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(props.model.model_name || '')
  }

  let priceSummary: ReactNode
  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      priceSummary = (
        <div className='col-span-full min-w-0'>
          <span className='text-warning'>
            {t('Special billing expression')}
          </span>
          <code className='text-muted-foreground mt-1 line-clamp-2 block font-mono text-xs break-all'>
            {dynamicSummary.rawExpression}
          </code>
        </div>
      )
    } else if (dynamicSummary.primaryEntries.length > 0) {
      priceSummary = (
        <>
          {dynamicSummary.primaryEntries
            .slice(0, dynamicSummary.providerCount ? 2 : undefined)
            .map((entry) => {
              const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
              const unitLabel = taskUsageUnitLabel(
                entry,
                i18n.language,
                unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
              )
              let label: ReactNode = null
              if (entry.labelKind !== 'schema') {
                label = t(entry.shortLabel)
              } else {
                label = taskPriceLabel(
                  entry.description,
                  entry.shortLabel,
                  i18n.language
                )
              }
              return (
                <div
                  key={entry.key}
                  className={cn(
                    'flex min-w-0 flex-col gap-1',
                    dynamicSummary.isTaskUsage && 'col-span-full'
                  )}
                >
                  {label && (
                    <span className='text-muted-foreground text-xs break-words whitespace-normal'>
                      {label}
                    </span>
                  )}
                  <span className='flex flex-wrap items-baseline gap-x-1 font-mono text-sm font-semibold tabular-nums'>
                    <span>{entry.formattedRange ?? entry.formatted}</span>
                    <span className='text-muted-foreground text-xs font-normal whitespace-nowrap'>
                      {' '}
                      / {unitLabel}
                    </span>
                  </span>
                </div>
              )
            })}
          {dynamicSummary.isTimePricing && (
            <span className='text-muted-foreground col-span-full text-xs'>
              {t('Current period price')}
            </span>
          )}
          {dynamicSummary.isMixedBilling && (
            <span className='text-muted-foreground col-span-full text-xs'>
              {t('Token or per-call pricing')}
            </span>
          )}
          {cardExamplePrice && (
            <span className='text-muted-foreground col-span-full text-xs break-words'>
              {cardExamplePrice.label} ≈ {cardExamplePrice.formatted}
            </span>
          )}
          {dynamicSummary.isTaskUsage &&
            dynamicSummary.tier?.label &&
            !dynamicSummary.primaryEntries.some(
              (entry) => entry.formattedRange
            ) && (
              <span className='text-muted-foreground col-span-full text-xs break-words'>
                ({dynamicSummary.tier.label})
              </span>
            )}
        </>
      )
    } else {
      priceSummary = (
        <span className='text-muted-foreground col-span-full'>
          {dynamicSummary.hasUnconfiguredProviders
            ? t('Usage-based billing · price not configured')
            : t('Dynamic Pricing')}
        </span>
      )
    }
  } else if (isUnconfiguredTaskUsage) {
    priceSummary = (
      <span className='text-muted-foreground col-span-full'>
        {t('Usage-based billing · price not configured')}
      </span>
    )
  } else if (isTokenBased) {
    const prices: { type: PriceType; label: string }[] = [
      { type: 'input', label: t('Input') },
      { type: 'output', label: t('Output') },
      ...(props.model.cache_ratio != null
        ? [{ type: 'cache' as const, label: t('Cached') }]
        : []),
    ]
    priceSummary = prices.map((price) => (
      <div key={price.type} className='flex min-w-0 flex-col gap-1'>
        <span className='text-muted-foreground text-xs'>{price.label}</span>
        <span className='font-mono text-sm font-semibold tabular-nums'>
          {formatPrice(
            props.model,
            price.type,
            tokenUnit,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
          <span className='text-muted-foreground text-xs font-normal'>
            {' '}
            / {tokenUnitLabel}
          </span>
        </span>
      </div>
    ))
  } else {
    priceSummary = (
      <div className='col-span-full flex min-w-0 flex-col gap-1'>
        <span className='font-mono text-sm font-semibold tabular-nums'>
          {formatRequestPrice(
            props.model,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
          <span className='text-muted-foreground text-xs font-normal'>
            {' '}
            / {t('request')}
          </span>
        </span>
      </div>
    )
  }

  return (
    <article
      data-pricing-model-card
      className={cn(
        'group relative flex min-h-[154px] flex-col overflow-hidden rounded-[16px] border border-[#e2e2de] bg-white p-3 transition-[border-color,box-shadow,transform] duration-200 motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:border-[#c7c7c1] hover:shadow-[0_10px_24px_rgba(0,0,0,0.08)] dark:border-white/12 dark:bg-[#151515] dark:hover:border-white/25 dark:hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)] '
      )}
    >
      <button
        type='button'
        onClick={() => props.onClick(props.model.model_name)}
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
              <div
                role='group'
                aria-label={t('Pricing')}
                className='mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0 text-[10px] leading-4'
              >
                <ModelBillingModeBadge model={props.model} />
                {priceSummary}
                {dynamicSummary?.providerCount && (
                  <span className='text-muted-foreground w-full'>
                    {t('{{count}} providers', {
                      count: dynamicSummary.providerCount,
                    })}
                    {dynamicSummary.hasUnconfiguredProviders &&
                      ` · ${t('Not configured for some providers')}`}
                  </span>
                )}
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

        <div className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]'>
          {groups.length > 0 && (
            <div>
              <span>{t('Groups')}</span>{' '}
              <span title={groups.join(', ')}>{groups[0]}</span>
              {groups.length > 1 && (
                <span title={groups.slice(1).join(', ')}>
                  {' '}
                  +{groups.length - 1}
                </span>
              )}
            </div>
          )}
          {endpoints.length > 0 && (
            <div>
              <span>{t('Endpoints')}</span>{' '}
              <span title={endpoints.join(', ')}>
                {endpoints.slice(0, 2).join(', ')}
              </span>
              {endpoints.length > 2 && (
                <span title={endpoints.slice(2).join(', ')}>
                  {' '}
                  +{endpoints.length - 2}
                </span>
              )}
            </div>
          )}
          {tags.length > 0 && (
            <div role='group' aria-label={t('Tags')}>
              <span title={tags.join(', ')}>{tags.slice(0, 2).join(', ')}</span>
              {tags.length > 2 && (
                <span title={tags.slice(2).join(', ')}>
                  {' '}
                  +{tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
        <ModelPerfBadge perf={props.perf} className='mt-2 border-t pt-2' />
        <Button
          variant='ghost'
          size='sm'
          type='button'
          onClick={() => props.onClick(props.model.model_name)}
          className='pointer-events-auto relative mt-2 self-end text-xs'
        >
          {t('Details')}
        </Button>
      </div>
    </article>
  )
})
