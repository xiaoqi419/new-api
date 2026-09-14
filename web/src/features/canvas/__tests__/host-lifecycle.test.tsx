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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { fetchTokenKeysBatch, getApiKeys } from '@/features/keys/api'

import { CanvasStudio } from '../index'

const authState = vi.hoisted(() => ({
  userId: undefined as number | undefined,
}))

vi.mock('@/components/layout', () => ({
  Main: ({ children }: { children?: unknown }) => children ?? null,
}))

vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (
    selector: (state: { auth: { user: { id: number } | null } }) => unknown
  ) =>
    selector({
      auth: {
        user: authState.userId === undefined ? null : { id: authState.userId },
      },
    }),
}))

vi.mock('@/features/keys/api', () => ({
  fetchTokenKeysBatch: vi.fn(),
  getApiKeys: vi.fn(),
}))

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const listResponse = {
  success: true,
  data: {
    items: [{ id: 1, name: 'Canvas key', status: 1 }],
    total: 1,
    page: 1,
    page_size: 100,
  },
}

const batchResponse = {
  success: true,
  data: { keys: { 1: 'relay-secret' } },
}

function tokenMessages(messages: unknown[]) {
  return messages.filter(
    (
      message
    ): message is {
      type: string
      requestId?: string
      userId?: number
      tokens?: unknown[]
    } =>
      Boolean(message) &&
      typeof message === 'object' &&
      (message as { type?: unknown }).type === 'new-api:canvas-tokens'
  )
}

function emitTokenRequest(
  iframe: HTMLIFrameElement,
  payload: Record<string, unknown>
) {
  const event = new MessageEvent('message', {
    data: {
      type: 'new-api:canvas-tokens-request',
      ...payload,
    },
    origin: window.location.origin,
  })
  Object.defineProperty(event, 'source', {
    configurable: true,
    value: iframe.contentWindow,
  })
  window.dispatchEvent(event)
}

function renderCanvas() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <CanvasStudio />
    </QueryClientProvider>
  )
  const iframe = view.container.querySelector('iframe')
  if (!iframe) throw new Error('Canvas iframe was not rendered')
  const messages: unknown[] = []
  Object.defineProperty(iframe.contentWindow, 'postMessage', {
    configurable: true,
    value: (message: unknown) => messages.push(message),
  })
  return { ...view, iframe, messages, queryClient }
}

describe('embedded canvas host token lifecycle', () => {
  beforeEach(() => {
    authState.userId = 7
    vi.mocked(getApiKeys).mockReset()
    vi.mocked(fetchTokenKeysBatch).mockReset()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('force requests refetch even when the refreshed data keeps the same timestamp', async () => {
    const firstList = deferred<typeof listResponse>()
    const firstBatch = deferred<typeof batchResponse>()
    const secondList = deferred<typeof listResponse>()
    const secondBatch = deferred<typeof batchResponse>()
    vi.mocked(getApiKeys)
      .mockReturnValueOnce(firstList.promise as never)
      .mockReturnValueOnce(secondList.promise as never)
    vi.mocked(fetchTokenKeysBatch)
      .mockReturnValueOnce(firstBatch.promise as never)
      .mockReturnValueOnce(secondBatch.promise as never)

    const { iframe, messages, queryClient } = renderCanvas()
    emitTokenRequest(iframe, { requestId: 'initial-request' })
    await waitFor(() => expect(getApiKeys).toHaveBeenCalledTimes(1))
    firstList.resolve(listResponse)
    await waitFor(() => expect(fetchTokenKeysBatch).toHaveBeenCalledTimes(1))
    firstBatch.resolve(batchResponse)
    await waitFor(() => {
      expect(tokenMessages(messages)).toContainEqual(
        expect.objectContaining({
          requestId: 'initial-request',
          userId: 7,
          tokens: [{ id: 1, name: 'Canvas key', key: 'sk-relay-secret' }],
        })
      )
    })

    emitTokenRequest(iframe, { requestId: 'force-request', force: true })
    await waitFor(() => expect(getApiKeys).toHaveBeenCalledTimes(2))
    secondList.resolve(listResponse)
    await waitFor(() => expect(fetchTokenKeysBatch).toHaveBeenCalledTimes(2))
    secondBatch.resolve(batchResponse)

    await waitFor(() => {
      expect(tokenMessages(messages)).toContainEqual(
        expect.objectContaining({
          requestId: 'force-request',
          userId: 7,
          tokens: [{ id: 1, name: 'Canvas key', key: 'sk-relay-secret' }],
        })
      )
    })
    expect(queryClient.getQueryData(['canvas-host-tokens', 7])).toEqual([
      { id: 1, name: 'Canvas key', key: 'sk-relay-secret' },
    ])
  })

  test('does not deliver an old user response after the account changes', async () => {
    const oldList = deferred<typeof listResponse>()
    const oldBatch = deferred<typeof batchResponse>()
    vi.mocked(getApiKeys).mockReturnValueOnce(oldList.promise as never)
    vi.mocked(fetchTokenKeysBatch).mockReturnValueOnce(
      oldBatch.promise as never
    )

    const { iframe, messages, rerender, queryClient } = renderCanvas()
    emitTokenRequest(iframe, { requestId: 'old-user-request' })
    await waitFor(() => expect(getApiKeys).toHaveBeenCalledTimes(1))

    authState.userId = 8
    await act(async () => {
      // Rerendering makes the mocked auth selector expose the new account.
      // No network request is needed for the account-switch fence itself.
      rerender(
        <QueryClientProvider client={queryClient}>
          <CanvasStudio />
        </QueryClientProvider>
      )
    })
    oldList.resolve(listResponse)
    await waitFor(() => expect(fetchTokenKeysBatch).toHaveBeenCalledTimes(1))
    oldBatch.resolve(batchResponse)
    await act(async () => undefined)

    expect(tokenMessages(messages)).not.toContainEqual(
      expect.objectContaining({ requestId: 'old-user-request', userId: 7 })
    )
  })

  test('answers an unauthenticated request with an empty token list', () => {
    authState.userId = undefined
    const { iframe, messages } = renderCanvas()

    emitTokenRequest(iframe, { requestId: 'logged-out-request' })

    expect(tokenMessages(messages)).toContainEqual(
      expect.objectContaining({
        requestId: 'logged-out-request',
        userId: 0,
        tokens: [],
      })
    )
    expect(getApiKeys).not.toHaveBeenCalled()
  })

  test('accepts a reused request id after the iframe load fence resets dedupe', async () => {
    vi.mocked(getApiKeys).mockResolvedValue(listResponse as never)
    vi.mocked(fetchTokenKeysBatch).mockResolvedValue(batchResponse as never)
    const { iframe, messages } = renderCanvas()

    emitTokenRequest(iframe, { requestId: 'reused-request' })
    await waitFor(() => expect(tokenMessages(messages)).toHaveLength(1))
    fireEvent.load(iframe)
    emitTokenRequest(iframe, { requestId: 'reused-request' })

    await waitFor(() => expect(tokenMessages(messages)).toHaveLength(2))
  })

  test('shows a readable retry state and remounts the iframe after a resource error', async () => {
    const { iframe, container } = renderCanvas()

    fireEvent.error(iframe)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to load: Infinite Canvas'
      )
    })
    const retryButton = screen.getByRole('button', { name: 'Retry' })
    expect(retryButton).toBeEnabled()

    fireEvent.click(retryButton)

    await waitFor(() => {
      const reloadedFrame = container.querySelector('iframe')
      expect(reloadedFrame).toBeInTheDocument()
      expect(reloadedFrame).not.toBe(iframe)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('does not deliver a pending token response to the replacement iframe', async () => {
    const oldList = deferred<typeof listResponse>()
    const oldBatch = deferred<typeof batchResponse>()
    const replacementList = deferred<typeof listResponse>()
    const replacementBatch = deferred<typeof batchResponse>()
    vi.mocked(getApiKeys)
      .mockReturnValueOnce(oldList.promise as never)
      .mockReturnValueOnce(replacementList.promise as never)
    vi.mocked(fetchTokenKeysBatch)
      .mockReturnValueOnce(oldBatch.promise as never)
      .mockReturnValueOnce(replacementBatch.promise as never)

    const { iframe: oldFrame, container } = renderCanvas()
    emitTokenRequest(oldFrame, { requestId: 'pending-before-retry' })
    await waitFor(() => expect(getApiKeys).toHaveBeenCalledTimes(1))

    fireEvent.error(oldFrame)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    const replacementFrame = await waitFor(() => {
      const frame = container.querySelector('iframe')
      if (!frame || frame === oldFrame) {
        throw new Error('iframe was not remounted')
      }
      return frame
    })
    const replacementMessages: unknown[] = []
    Object.defineProperty(replacementFrame.contentWindow, 'postMessage', {
      configurable: true,
      value: (message: unknown) => replacementMessages.push(message),
    })

    emitTokenRequest(replacementFrame, { requestId: 'pending-before-retry' })
    await waitFor(() => expect(getApiKeys).toHaveBeenCalledTimes(2))

    oldList.resolve(listResponse)
    oldBatch.resolve(batchResponse)
    await act(async () => undefined)

    expect(replacementMessages).not.toContainEqual(
      expect.objectContaining({
        type: 'new-api:canvas-tokens',
        requestId: 'pending-before-retry',
      })
    )

    replacementList.resolve(listResponse)
    await waitFor(() => expect(fetchTokenKeysBatch).toHaveBeenCalledTimes(1))
    replacementBatch.resolve(batchResponse)
  })

  test('shows a retry state when the iframe loads without a theme-ready handshake', async () => {
    vi.useFakeTimers()
    const { iframe, container } = renderCanvas()

    fireEvent.load(iframe)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load: Infinite Canvas'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    const replacementFrame = container.querySelector('iframe')
    expect(replacementFrame).toBeInTheDocument()
    expect(replacementFrame).not.toBe(iframe)
  })
})
