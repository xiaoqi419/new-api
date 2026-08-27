/*
Copyright (C) 2026 QuantumNous

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

import { Info } from '@/components/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { formatMonitorTs } from '../lib'
import type { CachePrediction, CachePredictionReason } from '../types'

const insufficientReasonKeys: Record<
  Exclude<CachePredictionReason, ''>,
  string
> = {
  no_eligible_requests: 'No eligible successful requests',
  no_cache_evidence: 'No cache evidence',
  too_few_samples: 'Too few successful requests',
  insufficient_history: 'Insufficient history',
}

const supportKeys = {
  none: 'No support',
  low: 'Low support',
  medium: 'Medium support',
  high: 'High support',
} as const

function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${rate.toFixed(1)}%`
}

function formatNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat().format(value)
}

function formatWindow(
  window: CachePrediction['observed_window'] | undefined
): string {
  if (!window || window.start <= 0 || window.end <= 0) return '—'
  return `${formatMonitorTs(window.start)} - ${formatMonitorTs(window.end)}`
}

interface CachePredictionMetricProps {
  prediction?: CachePrediction
  variant: 'summary' | 'inline'
}

export function CachePredictionMetric(props: CachePredictionMetricProps) {
  const { t } = useTranslation()
  const prediction = props.prediction
  const observedRate = formatRate(prediction?.observed_rate)
  const predictedRate = formatRate(prediction?.predicted_rate)
  const reasonKey =
    prediction?.insufficient_data && prediction.reason
      ? insufficientReasonKeys[prediction.reason]
      : undefined
  const supportKey = prediction ? supportKeys[prediction.support] : undefined
  let tooltipMessage: string | undefined
  if (!prediction) {
    tooltipMessage = t(
      'Cache prediction data is unavailable for this endpoint.'
    )
  } else if (reasonKey) {
    tooltipMessage = t(reasonKey)
  }
  const contentClassName =
    props.variant === 'summary'
      ? 'text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs'
      : 'flex min-w-0 flex-wrap items-center gap-1 text-xs'

  return (
    <div className={contentClassName}>
      <span className='text-foreground shrink-0 font-medium'>
        {t('Cache prediction')}
      </span>
      <span className='min-w-0 break-words tabular-nums'>
        {t('Observed')}:{' '}
        <span className='text-foreground font-medium'>{observedRate}</span>
      </span>
      <span className='min-w-0 break-words tabular-nums'>
        {t('Predicted')}:{' '}
        <span className='text-foreground font-medium'>{predictedRate}</span>
      </span>
      {tooltipMessage && (
        <span className='text-muted-foreground min-w-0 wrap-break-word'>
          {tooltipMessage}
        </span>
      )}
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2'
                aria-label={t('Cache prediction details')}
              >
                <Info className='size-3.5' aria-hidden='true' />
              </button>
            }
          />
          <TooltipContent className='max-w-[min(20rem,calc(100vw-2rem))] items-start wrap-break-word whitespace-normal'>
            <div className='flex min-w-0 flex-col gap-2'>
              <p className='font-medium'>{t('Cache prediction')}</p>
              {tooltipMessage && <p>{tooltipMessage}</p>}
              {prediction && (
                <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-left'>
                  <dt className='text-background/75'>{t('Observed rate')}</dt>
                  <dd className='min-w-0 break-words tabular-nums'>
                    {observedRate}
                  </dd>
                  <dt className='text-background/75'>{t('Predicted rate')}</dt>
                  <dd className='min-w-0 break-words tabular-nums'>
                    {predictedRate}
                  </dd>
                  <dt className='text-background/75'>{t('Samples')}</dt>
                  <dd className='min-w-0 break-words tabular-nums'>
                    {formatNumber(prediction.sample_count)}
                  </dd>
                  <dt className='text-background/75'>{t('Input tokens')}</dt>
                  <dd className='min-w-0 break-words tabular-nums'>
                    {formatNumber(prediction.input_tokens)}
                  </dd>
                  <dt className='text-background/75'>{t('Support')}</dt>
                  <dd className='min-w-0 break-words'>
                    {supportKey ? t(supportKey) : '—'}
                  </dd>
                  <dt className='text-background/75'>{t('Observed window')}</dt>
                  <dd className='min-w-0 break-words tabular-nums'>
                    {formatWindow(prediction.observed_window)}
                  </dd>
                  <dt className='text-background/75'>
                    {t('Prediction window')}
                  </dt>
                  <dd className='min-w-0 break-words tabular-nums'>
                    {formatWindow(prediction.prediction_window)}
                  </dd>
                  <dt className='text-background/75'>
                    {t('Forecast horizon')}
                  </dt>
                  <dd className='min-w-0 break-words tabular-nums'>
                    {prediction.forecast_horizon_seconds > 0
                      ? t('{{count}} hours', {
                          count: prediction.forecast_horizon_seconds / 3600,
                        })
                      : '—'}
                  </dd>
                </dl>
              )}
              <p>
                {t(
                  'Weights successful request tokens from recent hourly data with a 24-hour half-life.'
                )}
              </p>
              <p>{t('This is not an upstream guarantee.')}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
