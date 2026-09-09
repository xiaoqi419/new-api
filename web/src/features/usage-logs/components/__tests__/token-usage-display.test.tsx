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
import { flexRender, type CellContext } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, describe, expect, test, vi } from 'vitest'

import type { UsageLog } from '../../data/schema'
import { useCommonLogsColumns } from '../columns/common-logs-columns'

vi.mock('@/lib/lobe-icon', () => ({ getLobeIcon: () => null }))

function createLog(overrides: Partial<UsageLog> = {}): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1,
    type: 2,
    content: '',
    username: '',
    token_name: '',
    model_name: 'test-model',
    quota: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 0,
    is_stream: false,
    channel: 1,
    channel_name: '',
    token_id: 1,
    group: 'default',
    ip: '',
    other: '',
    request_id: '',
    upstream_request_id: '',
    ...overrides,
  }
}

function TokenCellHarness(props: { log: UsageLog }) {
  const columns = useCommonLogsColumns(false)
  const tokenColumn = columns.find(
    (column) =>
      'accessorKey' in column && column.accessorKey === 'prompt_tokens'
  )

  if (!tokenColumn?.cell) throw new Error('Token column is missing')

  return flexRender(tokenColumn.cell, {
    row: { original: props.log },
  } as CellContext<UsageLog, unknown>)
}

function renderTokenCell(log: UsageLog) {
  return render(<TokenCellHarness log={log} />)
}

describe('usage log token display', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      Cache: 'Cache',
      Input: 'Input',
      Output: 'Output',
      Total: 'Total',
    })
  })

  test('shows canonical input, output, total, and cache-read percentage', () => {
    renderTokenCell(
      createLog({
        prompt_tokens: 100,
        completion_tokens: 20,
        input_tokens: 120,
        cache_read_tokens: 30,
        cache_write_tokens: 10,
      })
    )

    expect(screen.getByText('Input 120')).toBeInTheDocument()
    expect(screen.getByText('Output 20')).toBeInTheDocument()
    expect(screen.getByText('Total 140')).toBeInTheDocument()
    expect(screen.getByText('Cache 30 / 120 (25%)')).toBeInTheDocument()
  })

  test('shows a cached-only request when legacy prompt and output usage are zero', () => {
    renderTokenCell(
      createLog({
        input_tokens: 100,
        cache_read_tokens: 100,
      })
    )

    expect(screen.getByText('Input 100')).toBeInTheDocument()
    expect(screen.getByText('Output -')).toBeInTheDocument()
    expect(screen.getByText('Total 100')).toBeInTheDocument()
    expect(screen.getByText('Cache 100 / 100 (100%)')).toBeInTheDocument()
  })

  test('falls back to legacy token fields when canonical fields are absent', () => {
    renderTokenCell(
      createLog({
        prompt_tokens: 80,
        completion_tokens: 20,
        other: JSON.stringify({ cache_tokens: 40 }),
      })
    )

    expect(screen.getByText('Input 80')).toBeInTheDocument()
    expect(screen.getByText('Output 20')).toBeInTheDocument()
    expect(screen.getByText('Total 100')).toBeInTheDocument()
    expect(screen.getByText('Cache 40 / 80 (50%)')).toBeInTheDocument()
  })

  test('preserves explicit canonical zeroes instead of using legacy values', () => {
    renderTokenCell(
      createLog({
        prompt_tokens: 80,
        completion_tokens: 20,
        input_tokens: 0,
        cache_read_tokens: 0,
        other: JSON.stringify({ cache_tokens: 40 }),
      })
    )

    expect(screen.getByText('Input -')).toBeInTheDocument()
    expect(screen.getByText('Output 20')).toBeInTheDocument()
    expect(screen.getByText('Total 20')).toBeInTheDocument()
    expect(screen.queryByText(/Cache/)).not.toBeInTheDocument()
  })

  test('shows a placeholder when no token usage exists', () => {
    renderTokenCell(createLog())

    expect(screen.getByText('-')).toBeInTheDocument()
    expect(
      screen.queryByText(/Input|Output|Total|Cache/)
    ).not.toBeInTheDocument()
  })
})
