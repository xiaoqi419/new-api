/*
Copyright (C) 2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your
option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { fetchTokenKeysBatch, getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'

import {
  createCanvasUserResetMessage,
  fetchCanvasTokens,
  isValidCanvasRequestId,
  normalizeRelayKey,
  sanitizeCanvasError,
} from '../index'

// Only the host contract helpers are under test. Mock the page shell and
// runtime hooks imported by CanvasStudio so Vitest does not evaluate the
// entire application layout (which pulls a browser-only emoji package whose
// directory export cannot be resolved by Windows ESM).
vi.mock('@/components/layout', () => ({
  Main: ({ children }: { children?: unknown }) => children ?? null,
}))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => undefined,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, error: undefined }),
}))

vi.mock('@/features/keys/api', () => ({
  fetchTokenKeysBatch: vi.fn(),
  getApiKeys: vi.fn(),
}))

const mockedGetApiKeys = vi.mocked(getApiKeys)
const mockedFetchTokenKeysBatch = vi.mocked(fetchTokenKeysBatch)

beforeEach(() => {
  mockedGetApiKeys.mockReset()
  mockedFetchTokenKeysBatch.mockReset()
})

describe('embedded canvas host contract', () => {
  test('marks account changes with an explicit reset envelope', () => {
    expect(createCanvasUserResetMessage(4, 22)).toEqual({
      type: 'new-api:canvas-tokens',
      requestId: 'canvas-user-change-4',
      tokens: [],
      userId: 22,
      reset: true,
    })
  })

  test('accepts bounded request ids and rejects control characters or oversized ids', () => {
    expect(isValidCanvasRequestId('canvas-token-1')).toBe(true)
    expect(isValidCanvasRequestId('  canvas-token-1  ')).toBe(true)
    expect(isValidCanvasRequestId('')).toBe(false)
    expect(isValidCanvasRequestId('   ')).toBe(false)
    expect(isValidCanvasRequestId('canvas-token-\u0001')).toBe(false)
    expect(isValidCanvasRequestId(`canvas-token-${'x'.repeat(200)}`)).toBe(
      false
    )
  })

  test('normalizes raw and already-prefixed relay keys idempotently', () => {
    expect(normalizeRelayKey('  abc123  ')).toBe('sk-abc123')
    expect(normalizeRelayKey('sk-abc123')).toBe('sk-abc123')
    expect(normalizeRelayKey('sk-sk-abc123')).toBe('sk-abc123')
    expect(normalizeRelayKey('')).toBe('')
  })

  test('redacts credentials before an error can reach the iframe', () => {
    const error = sanitizeCanvasError(
      new Error(
        'request failed Bearer sk-secret and eyJhbGciOiJIUzI1NiJ9.payload.signature'
      )
    )
    expect(error).not.toContain('sk-secret')
    expect(error).not.toContain('eyJhbGciOiJIUzI1NiJ9.payload.signature')
    expect(error).toContain('REDACTED')
  })

  test('redacts provider secrets, URLs, and cookie headers from host errors', () => {
    const message = [
      'request failed at https://relay.example/v1?api_key=query-secret',
      'Cookie: session=cookie-secret; csrf=csrf-secret',
      'AIzaSyProviderSecret123456789012345',
      'sess_live_session-secret',
      'rk_live_relay-secret',
      'pk_test_publishable-secret',
    ].join(' | ')

    const sanitized = sanitizeCanvasError(message)

    expect(sanitized).not.toContain('https://relay.example')
    expect(sanitized).not.toContain('query-secret')
    expect(sanitized).not.toContain('cookie-secret')
    expect(sanitized).not.toContain('csrf-secret')
    expect(sanitized).not.toContain('AIzaSyProviderSecret123456789012345')
    expect(sanitized).not.toContain('sess_live_session-secret')
    expect(sanitized).not.toContain('rk_live_relay-secret')
    expect(sanitized).not.toContain('pk_test_publishable-secret')
    expect(sanitized).toContain('[REDACTED]')
  })

  test('returns only enabled, deduplicated keys from the batch endpoint', async () => {
    mockedGetApiKeys.mockResolvedValue({
      success: true,
      data: {
        items: [
          { id: 1, name: 'First', status: API_KEY_STATUS.ENABLED },
          { id: 2, name: 'Disabled', status: API_KEY_STATUS.DISABLED },
          { id: 3, name: 'Duplicate', status: API_KEY_STATUS.ENABLED },
        ],
        total: 3,
        page: 1,
        page_size: 100,
      },
    } as never)
    mockedFetchTokenKeysBatch.mockResolvedValue({
      success: true,
      data: { keys: { 1: 'sk-shared', 3: 'sk-shared' } },
    })

    await expect(fetchCanvasTokens()).resolves.toEqual([
      { id: 1, name: 'First', key: 'sk-shared' },
    ])
    expect(mockedFetchTokenKeysBatch).toHaveBeenCalledWith([1, 3])
  })

  test('loads enabled keys from every pagination page before resolving credentials', async () => {
    mockedGetApiKeys
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [
            { id: 1, name: 'First', status: API_KEY_STATUS.ENABLED },
            { id: 2, name: 'Disabled', status: API_KEY_STATUS.DISABLED },
          ],
          total: 3,
          page: 1,
          page_size: 2,
        },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ id: 3, name: 'Second', status: API_KEY_STATUS.ENABLED }],
          total: 3,
          page: 2,
          page_size: 2,
        },
      } as never)
    mockedFetchTokenKeysBatch.mockResolvedValue({
      success: true,
      data: {
        keys: {
          1: 'sk-first',
          3: 'sk-second',
        },
      },
    })

    await expect(fetchCanvasTokens()).resolves.toEqual([
      { id: 1, name: 'First', key: 'sk-first' },
      { id: 3, name: 'Second', key: 'sk-second' },
    ])
    expect(mockedGetApiKeys).toHaveBeenNthCalledWith(1, { p: 1, size: 100 })
    expect(mockedGetApiKeys).toHaveBeenNthCalledWith(2, { p: 2, size: 100 })
    expect(mockedFetchTokenKeysBatch).toHaveBeenCalledWith([1, 3])
  })

  test('splits credential lookup into the endpoint maximum batch size', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `Key ${index + 1}`,
      status: API_KEY_STATUS.ENABLED,
    }))
    const secondPage = [
      { id: 101, name: 'Key 101', status: API_KEY_STATUS.ENABLED },
    ]
    mockedGetApiKeys
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: firstPage,
          total: 101,
          page: 1,
          page_size: 100,
        },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: secondPage,
          total: 101,
          page: 2,
          page_size: 100,
        },
      } as never)
    mockedFetchTokenKeysBatch
      .mockResolvedValueOnce({
        success: true,
        data: {
          keys: Object.fromEntries(
            firstPage.map((item) => [item.id, `key-${item.id}`])
          ),
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { keys: { 101: 'key-101' } },
      })

    await expect(fetchCanvasTokens()).resolves.toHaveLength(101)
    expect(mockedFetchTokenKeysBatch).toHaveBeenNthCalledWith(
      1,
      firstPage.map((item) => item.id)
    )
    expect(mockedFetchTokenKeysBatch).toHaveBeenNthCalledWith(2, [101])
  })
})
