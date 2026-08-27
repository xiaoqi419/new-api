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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import type { CachePrediction, ChannelMonitorItem } from '../../types'
import { ChannelSection } from '../channel-section'

const validPrediction: CachePrediction = {
  observed_rate: 0,
  predicted_rate: 0,
  sample_count: 28,
  input_tokens: 12800,
  support: 'high',
  observed_window: { start: 1761782400, end: 1761868800, seconds: 86400 },
  prediction_window: {
    start: 1761264000,
    end: 1761868800,
    seconds: 604800,
  },
  forecast_horizon_seconds: 86400,
  insufficient_data: false,
  reason: '',
}

function makeChannel(cachePrediction?: CachePrediction): ChannelMonitorItem {
  const cachePredictionValue =
    arguments.length === 0 ? validPrediction : cachePrediction

  return {
    channel_id: 42,
    name: 'A deliberately long channel name that must not widen the page',
    type: 1,
    tag: 'primary',
    status: 'normal',
    availability: 100,
    request_count: 28,
    suspect_count: 0,
    cache_prediction: cachePredictionValue,
    models: [
      {
        model: 'a-deliberately-long-model-name-that-must-wrap-without-overflow',
        status: 'normal',
        availability: 100,
        avg_ttft: 0.2,
        avg_latency: 0.8,
        throughput: 45,
        request_count: 28,
        buckets: [],
        verdict: '',
        reported_model: '',
        probed_at: 0,
        evidence: null,
        cache_prediction: cachePredictionValue,
      },
    ],
  } as unknown as ChannelMonitorItem
}

describe('cache prediction metric', () => {
  test('shows valid zero-percent cache rates instead of an unavailable value', () => {
    render(<ChannelSection item={makeChannel()} />)

    expect(screen.getAllByText('Cache prediction')).toHaveLength(2)
    expect(screen.getAllByText('0.0%')).toHaveLength(4)
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  test('degrades old monitor responses without cache prediction fields to unavailable values', () => {
    render(<ChannelSection item={makeChannel(undefined)} />)

    expect(screen.getAllByText('—')).toHaveLength(4)
  })

  test('states the insufficiency reason beside unavailable cache rates', () => {
    render(
      <ChannelSection
        item={makeChannel({
          ...validPrediction,
          predicted_rate: null,
          support: 'none',
          insufficient_data: true,
          reason: 'too_few_samples',
        })}
      />
    )

    expect(screen.getAllByText('Too few successful requests')).toHaveLength(2)
  })

  test('includes the observed, prediction, support, sample, token, and window context in the keyboard tooltip', async () => {
    const user = userEvent.setup()
    render(<ChannelSection item={makeChannel()} />)

    await user.tab()
    expect(
      await screen.findByText(
        'Weights successful request tokens from recent hourly data with a 24-hour half-life.'
      )
    ).toBeVisible()
    expect(screen.getByText('Observed rate')).toBeVisible()
    expect(screen.getByText('Predicted rate')).toBeVisible()
    expect(screen.getByText('Samples')).toBeVisible()
    expect(screen.getByText('Input tokens')).toBeVisible()
    expect(screen.getByText('Observed window')).toBeVisible()
    expect(screen.getByText('Prediction window')).toBeVisible()
    expect(screen.getByText('High support')).toBeVisible()
    expect(screen.getByText('This is not an upstream guarantee.')).toBeVisible()
  })

  test.each([
    ['no_eligible_requests', 'No eligible successful requests'],
    ['no_cache_evidence', 'No cache evidence'],
    ['too_few_samples', 'Too few successful requests'],
    ['insufficient_history', 'Insufficient history'],
  ] as const)(
    'explains the %s prediction insufficiency reason in the keyboard tooltip',
    async (reason, label) => {
      const user = userEvent.setup()
      render(
        <ChannelSection
          item={makeChannel({
            ...validPrediction,
            observed_rate: null,
            predicted_rate: null,
            support: 'none',
            insufficient_data: true,
            reason,
          })}
        />
      )

      const trigger = screen.getAllByRole('button', {
        name: 'Cache prediction details',
      })[0]
      expect(trigger).toBeDefined()
      await user.tab()
      expect(trigger).toHaveFocus()
      expect(await screen.findAllByText(label)).toHaveLength(3)
    }
  )

  test('uses the same metric in the channel summary and model row without long-name overflow', () => {
    render(<ChannelSection item={makeChannel()} />)

    expect(screen.getByTestId('channel-section')).toHaveClass('min-w-0')
    expect(
      screen.getByText(
        'A deliberately long channel name that must not widen the page'
      )
    ).toHaveClass('min-w-0', 'wrap-break-word')
    expect(
      screen.getByText(
        'a-deliberately-long-model-name-that-must-wrap-without-overflow'
      )
    ).toHaveClass('min-w-0', 'wrap-break-word')
  })
})
