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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { AlertTriangle, RefreshCw } from '@/components/icons'
import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/context/theme-provider'
import { fetchTokenKeysBatch, getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Path where the backend serves the embedded canvas build (`canvasBasePath`).
 * Without the trailing slash, which the static handler redirects away anyway.
 */
const CANVAS_APP_PATH = '/canvas-app'

const THEME_MESSAGE = 'new-api:canvas-theme'
const TOKENS_REQUEST_MESSAGE = 'new-api:canvas-tokens-request'
const TOKENS_MESSAGE = 'new-api:canvas-tokens'
const MAX_SEEN_REQUEST_IDS = 64
const MAX_REQUEST_ID_LENGTH = 200
const CANVAS_TOKEN_PAGE_SIZE = 100
const CANVAS_TOKEN_BATCH_SIZE = 100
const MAX_CANVAS_TOKEN_PAGES = 1_000
const MAX_CANVAS_ERROR_LENGTH = 300
const REDACTED_CANVAS_SECRET = '[REDACTED]'
// Static handlers can return the Canvas index for a missing JS/CSS asset, so
// the iframe may emit `load` even though the child never reaches its bridge
// handshake. Keep the wait bounded while allowing a normal app startup window.
const CANVAS_READY_TIMEOUT_MS = 8_000

function containsControlCharacters(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

// Keep request identifiers safe to put in logs, cache keys and postMessage
// envelopes. Missing identifiers remain supported for older iframe builds; an
// explicitly supplied malformed identifier is rejected instead of silently
// replacing it with a generated one.
// oxlint-disable-next-line react/only-export-components
export function isValidCanvasRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_REQUEST_ID_LENGTH &&
    value.trim().length > 0 &&
    !containsControlCharacters(value)
  )
}

type CanvasTokenRequest = {
  id: string
  generation: number
  userId: number
  force: boolean
}

/** Stable account-reset envelope shared with the embedded bridge. */
// oxlint-disable-next-line react/only-export-components
export function createCanvasUserResetMessage(
  generation: number,
  userId: number
) {
  return {
    type: TOKENS_MESSAGE,
    requestId: `canvas-user-change-${generation}`,
    tokens: [] as const,
    userId,
    reset: true as const,
  }
}

/**
 * Design tokens shared with the embedded app: it ships the same shadcn variable
 * names, so forwarding our computed values re-skins it with the active theme.
 */
const SHARED_TOKENS = [
  '--radius',
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--border',
  '--input',
  '--ring',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
]

/**
 * Ant Design derives palettes from the color it is given and cannot parse the
 * `oklch()` values our tokens use, so resolve them to a plain sRGB string first.
 * Reading `fillStyle` back is not enough because browsers echo CSS Color 4
 * values unchanged; rasterizing one pixel forces the conversion. An invalid
 * value leaves the previously assigned fallback in place.
 */
function toParsableColor(value: string, fallback: string) {
  const context = document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true })
  if (!context) return fallback
  context.fillStyle = fallback
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * The embedded app cannot read the signed-in user's keys itself: authentication
 * is a rotating access token kept in this app's memory rather than a cookie the
 * iframe would send along. The list endpoint only returns masked keys, so the
 * usable ones come from the batch endpoint, which is why this is fetched once on
 * demand instead of on every mount.
 */
// oxlint-disable-next-line react/only-export-components
export function normalizeRelayKey(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 512) return ''
  const body = trimmed.replace(/^(?:sk-)+/i, '')
  return body ? `sk-${body}` : ''
}

// oxlint-disable-next-line react/only-export-components
export function sanitizeCanvasError(
  value: unknown,
  secrets: readonly string[] = []
) {
  let text = ''
  if (value instanceof Error) {
    text = value.message
  } else if (typeof value === 'string') {
    text = value
  }
  text = text.trim()
  if (!text) return 'Failed to load API keys'

  // Do not forward an upstream HTML document to the embedded application. It
  // can contain both credentials and an unbounded amount of markup.
  if (/<(?:!doctype|html|head|body|title|script|style)\b/i.test(text)) {
    return 'Failed to load API keys'
  }

  const uniqueSecrets = [
    ...new Set(
      secrets
        .filter((secret): secret is string => typeof secret === 'string')
        .map((secret) => secret.trim())
        .filter((secret) => secret.length >= 4)
    ),
  ].sort((a, b) => b.length - a.length)
  for (const secret of uniqueSecrets) {
    const variants = new Set([secret])
    try {
      variants.add(encodeURIComponent(secret))
    } catch {
      // Keep redacting the original value if it is not URI encodable.
    }
    for (const variant of variants) {
      text = text.split(variant).join(REDACTED_CANVAS_SECRET)
    }
  }

  // Keep this list aligned with the Canvas media error sanitizer. Errors from
  // the list and batch endpoints may include a URL, echoed headers, or a
  // provider-specific credential even when the host no longer has the key.
  text = text
    .replaceAll(/(?:https?|wss?|ftp):\/\/[^\s<>"'`]+/gi, REDACTED_CANVAS_SECRET)
    .replaceAll(/(?:blob|data):[^\s<>"'`]+/gi, REDACTED_CANVAS_SECRET)
    .replaceAll(/Bearer\s+[^\s,;)}\]]+/gi, `Bearer ${REDACTED_CANVAS_SECRET}`)
    .replaceAll(
      /([?&](?:api[_-]?key|key|token|access[_-]?token|secret|password)=)[^&#\s"'<>]+/gi,
      `$1${REDACTED_CANVAS_SECRET}`
    )
    .replaceAll(
      /(?:authorization|proxy-authorization)\s*[:=]\s*(?:[A-Za-z]+\s+)?[^\s,;\]}]+/gi,
      REDACTED_CANVAS_SECRET
    )
    .replaceAll(
      /(?:cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi,
      REDACTED_CANVAS_SECRET
    )
    .replaceAll(
      /((?:x-api-key|api[_-]?key)\s*[:=]\s*)(?:[A-Za-z]+\s+)?[^\s,;\]}]+/gi,
      `$1${REDACTED_CANVAS_SECRET}`
    )
    .replaceAll(
      /((?:"?(?:api[_-]?key|key|token|access[_-]?token|secret|password)"?)\s*[:=]\s*"?)[^\s,"'}]+/gi,
      `$1${REDACTED_CANVAS_SECRET}`
    )
    .replaceAll(
      /\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._~-]*\b/gi,
      REDACTED_CANVAS_SECRET
    )
    .replaceAll(
      /\b(?:sk|rk|pk)_[A-Za-z0-9][A-Za-z0-9._-]*\b/gi,
      REDACTED_CANVAS_SECRET
    )
    .replaceAll(/\bsess_[A-Za-z0-9][A-Za-z0-9._-]*\b/gi, REDACTED_CANVAS_SECRET)
    .replaceAll(/\bAIza[0-9A-Za-z_-]{20,}\b/gi, REDACTED_CANVAS_SECRET)
    .replaceAll(
      /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g,
      REDACTED_CANVAS_SECRET
    )

  return text.slice(0, MAX_CANVAS_ERROR_LENGTH) || 'Failed to load API keys'
}

// oxlint-disable-next-line react/only-export-components
export async function fetchCanvasTokens() {
  const items: Array<{
    id: number
    name?: string
    status?: number
  }> = []
  let page = 1
  let total: number | null = null
  let pageSize = CANVAS_TOKEN_PAGE_SIZE
  const pageSignatures = new Set<string>()

  while (page <= MAX_CANVAS_TOKEN_PAGES) {
    const list = await getApiKeys({ p: page, size: CANVAS_TOKEN_PAGE_SIZE })
    if (!list.success) {
      throw new Error(list.message || 'Failed to load API keys')
    }

    const data = list.data
    const pageItems = Array.isArray(data?.items) ? data.items : []
    const reportedTotal = Number(data?.total)
    if (Number.isFinite(reportedTotal) && reportedTotal >= 0) {
      total = Math.floor(reportedTotal)
    }
    const reportedPageSize = Number(data?.page_size)
    if (Number.isFinite(reportedPageSize) && reportedPageSize > 0) {
      pageSize = Math.min(Math.floor(reportedPageSize), CANVAS_TOKEN_PAGE_SIZE)
    }

    if (pageItems.length === 0) break

    const pageSignature = pageItems
      .map((item) => {
        if (!item || typeof item !== 'object') return 'invalid'
        const record = item as Record<string, unknown>
        return `${String(record.id)}:${String(record.status)}:${String(record.name)}`
      })
      .join('|')
    if (pageSignatures.has(pageSignature)) {
      throw new Error('Failed to load API keys')
    }
    pageSignatures.add(pageSignature)
    items.push(...(pageItems as typeof items))

    if (total !== null && items.length >= total) break
    // When the server supplies a total, follow it even if an intermediate page
    // is short (for example while a token is created or revoked concurrently).
    // Without a trustworthy total, a short page is the end-of-list signal.
    if (total === null && pageItems.length < pageSize) break
    page += 1
  }

  if (page > MAX_CANVAS_TOKEN_PAGES) {
    throw new Error('Failed to load API keys')
  }

  const enabledById = new Map<number, { id: number; name: string }>()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (!Number.isSafeInteger(item.id) || item.id <= 0) continue
    if (item.status !== API_KEY_STATUS.ENABLED || enabledById.has(item.id)) {
      continue
    }
    enabledById.set(item.id, {
      id: item.id,
      name:
        typeof item.name === 'string' && item.name.trim()
          ? item.name
          : 'Unnamed API key',
    })
  }
  const enabled = [...enabledById.values()]
  if (!enabled.length) return []

  const keys: Record<number, string> = {}
  for (
    let offset = 0;
    offset < enabled.length;
    offset += CANVAS_TOKEN_BATCH_SIZE
  ) {
    const batch = await fetchTokenKeysBatch(
      enabled
        .slice(offset, offset + CANVAS_TOKEN_BATCH_SIZE)
        .map((item) => item.id)
    )
    if (!batch.success) {
      throw new Error(batch.message || 'Failed to load API keys')
    }
    Object.assign(keys, batch.data?.keys ?? {})
  }

  const seen = new Set<string>()
  return enabled
    .map((item) => ({
      id: item.id,
      name: item.name.slice(0, 120),
      key: normalizeRelayKey(keys[item.id]),
    }))
    .filter((token) => {
      if (!token.key || seen.has(token.key)) return false
      seen.add(token.key)
      return true
    })
}

export function CanvasStudio() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const queryClient = useQueryClient()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const frameReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameReadyWatchRef = useRef<HTMLIFrameElement | null>(null)
  const frameReadyRef = useRef(false)
  const [frameReloadKey, setFrameReloadKey] = useState(0)
  const [frameLoadError, setFrameLoadError] = useState(false)
  const userId = useAuthStore((state) => state.auth.user?.id)
  const activeUserIdRef = useRef(userId)
  activeUserIdRef.current = userId
  const previousUserIdRef = useRef(userId)
  const requestGenerationRef = useRef(0)
  const pendingRequestRef = useRef<CanvasTokenRequest | null>(null)
  const respondedRequestRef = useRef('')
  const requestSequenceRef = useRef(0)
  const seenRequestIdsRef = useRef(new Set<string>())
  const forcedQueryRef = useRef<{
    requestId: string
    generation: number
    userId: number
  } | null>(null)
  const forceRefreshErrorRef = useRef('')
  const [forceRefreshVersion, setForceRefreshVersion] = useState(0)
  const [tokensRequest, setTokensRequest] = useState<CanvasTokenRequest | null>(
    null
  )

  const clearFrameReadyWatchdog = useCallback(() => {
    if (frameReadyTimerRef.current !== null) {
      clearTimeout(frameReadyTimerRef.current)
      frameReadyTimerRef.current = null
    }
    frameReadyWatchRef.current = null
  }, [])

  const invalidateFrameBridge = useCallback(() => {
    const currentUserId = activeUserIdRef.current
    if (currentUserId !== undefined) {
      void queryClient.cancelQueries({
        queryKey: ['canvas-host-tokens', currentUserId],
      })
    }
    requestGenerationRef.current += 1
    pendingRequestRef.current = null
    respondedRequestRef.current = ''
    seenRequestIdsRef.current.clear()
    forcedQueryRef.current = null
    forceRefreshErrorRef.current = ''
    setTokensRequest(null)
  }, [queryClient])

  const scheduleFrameReadyWatchdog = useCallback(
    (frame: HTMLIFrameElement) => {
      clearFrameReadyWatchdog()
      if (frameReadyRef.current) return
      frameReadyWatchRef.current = frame
      frameReadyTimerRef.current = setTimeout(() => {
        frameReadyTimerRef.current = null
        if (
          frameReadyRef.current ||
          frameReadyWatchRef.current !== frame ||
          frameRef.current !== frame
        ) {
          return
        }
        frameReadyWatchRef.current = null
        invalidateFrameBridge()
        setFrameLoadError(true)
      }, CANVAS_READY_TIMEOUT_MS)
    },
    [clearFrameReadyWatchdog, invalidateFrameBridge]
  )

  const markFrameReady = useCallback(() => {
    frameReadyRef.current = true
    clearFrameReadyWatchdog()
  }, [clearFrameReadyWatchdog])

  const sendTokens = useCallback(
    (
      request: CanvasTokenRequest,
      payload: {
        tokens?: Array<{ id: number; name: string; key: string }>
        error?: string
      }
    ) => {
      const frame = frameRef.current?.contentWindow
      if (
        !frame ||
        request.userId !== (activeUserIdRef.current ?? 0) ||
        request.generation !== requestGenerationRef.current
      ) {
        return
      }
      frame.postMessage(
        {
          type: TOKENS_MESSAGE,
          requestId: request.id,
          userId: request.userId,
          ...payload,
        },
        window.location.origin
      )
    },
    []
  )

  const tokensQuery = useQuery({
    queryKey: ['canvas-host-tokens', userId],
    queryFn: fetchCanvasTokens,
    enabled: Boolean(tokensRequest?.userId && userId === tokensRequest.userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  const refetchTokens = tokensQuery.refetch

  useEffect(() => {
    if (previousUserIdRef.current === userId) return
    const previousUserId = previousUserIdRef.current
    previousUserIdRef.current = userId
    if (previousUserId !== undefined) {
      queryClient.removeQueries({
        queryKey: ['canvas-host-tokens', previousUserId],
      })
    }
    seenRequestIdsRef.current.clear()
    forcedQueryRef.current = null
    forceRefreshErrorRef.current = ''
    requestGenerationRef.current += 1
    pendingRequestRef.current = null
    respondedRequestRef.current = ''
    setTokensRequest(null)
    const frame = frameRef.current?.contentWindow
    if (!frame) return
    const resetMessage = createCanvasUserResetMessage(
      requestGenerationRef.current,
      userId ?? 0
    )
    frame.postMessage(resetMessage, window.location.origin)
  }, [queryClient, userId])

  const sendTheme = useCallback(() => {
    const frame = frameRef.current?.contentWindow
    if (!frame) return

    const computed = getComputedStyle(document.documentElement)
    const vars: Record<string, string> = {}
    for (const token of SHARED_TOKENS) {
      const value = computed.getPropertyValue(token).trim()
      if (value) vars[token] = value
    }

    frame.postMessage(
      {
        type: THEME_MESSAGE,
        dark: document.documentElement.classList.contains('dark'),
        vars,
        accent: toParsableColor(vars['--primary'] ?? '', '#171717'),
        accentText: toParsableColor(
          vars['--primary-foreground'] ?? '',
          '#ffffff'
        ),
        surface: toParsableColor(vars['--background'] ?? '', '#ffffff'),
        text: toParsableColor(vars['--foreground'] ?? '', '#171717'),
      },
      window.location.origin
    )
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow
      ) {
        return
      }
      if (!event.data || typeof event.data !== 'object') return
      const data = event.data as Record<string, unknown>
      if (data.type === `${THEME_MESSAGE}:ready`) {
        markFrameReady()
        sendTheme()
      }
      if (data.type === TOKENS_REQUEST_MESSAGE) {
        if (data.force !== undefined && typeof data.force !== 'boolean') {
          return
        }
        const hasSuppliedRequestId = Object.hasOwn(data, 'requestId')
        if (hasSuppliedRequestId && !isValidCanvasRequestId(data.requestId)) {
          return
        }
        requestSequenceRef.current += 1
        const suppliedId =
          typeof data.requestId === 'string' ? data.requestId.trim() : ''
        const id =
          suppliedId || `canvas-token-request-${requestSequenceRef.current}`
        const requestKey = `${userId ?? 0}:${id}`
        const seenRequestIds = seenRequestIdsRef.current
        if (seenRequestIds.has(requestKey)) return
        seenRequestIds.add(requestKey)
        if (seenRequestIds.size > MAX_SEEN_REQUEST_IDS) {
          const oldestRequestKey = seenRequestIds.values().next().value
          if (oldestRequestKey) seenRequestIds.delete(oldestRequestKey)
        }
        requestGenerationRef.current += 1
        const request: CanvasTokenRequest = {
          id,
          generation: requestGenerationRef.current,
          userId: userId ?? 0,
          force: data.force === true,
        }
        pendingRequestRef.current = request
        respondedRequestRef.current = ''
        forceRefreshErrorRef.current = ''
        if (request.force && request.userId) {
          forcedQueryRef.current = {
            requestId: request.id,
            generation: request.generation,
            userId: request.userId,
          }
        } else {
          forcedQueryRef.current = null
        }
        setTokensRequest(request)
        if (!request.userId) {
          respondedRequestRef.current = request.id
          sendTokens(request, { tokens: [] })
          return
        }
        if (request.force) {
          const settleForceRefresh = (error?: unknown) => {
            const forcedQuery = forcedQueryRef.current
            if (
              !forcedQuery ||
              forcedQuery.requestId !== request.id ||
              forcedQuery.generation !== request.generation ||
              forcedQuery.userId !== request.userId ||
              requestGenerationRef.current !== request.generation ||
              activeUserIdRef.current !== request.userId
            ) {
              return
            }
            if (error) {
              forceRefreshErrorRef.current = 'Failed to load API keys'
            }
            forcedQueryRef.current = null
            setForceRefreshVersion((version) => version + 1)
          }
          try {
            // Calling the observer's refetch bypasses staleTime and always
            // executes the query function. This also gives us a completion
            // promise, so a successful refresh does not depend on
            // dataUpdatedAt advancing beyond the previous millisecond.
            void refetchTokens({ cancelRefetch: true }).then(
              () => settleForceRefresh(),
              (error) => settleForceRefresh(error)
            )
          } catch (error) {
            settleForceRefresh(error)
          }
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [markFrameReady, refetchTokens, sendTheme, sendTokens, userId])

  useEffect(() => {
    if (!tokensRequest || pendingRequestRef.current?.id !== tokensRequest.id) {
      return
    }
    if (respondedRequestRef.current === tokensRequest.id) return
    if (tokensRequest.generation !== requestGenerationRef.current) return
    if (tokensRequest.userId !== (userId ?? 0)) return
    if (!tokensQuery.data && !tokensQuery.error) return
    if (tokensRequest.force) {
      const forcedQuery = forcedQueryRef.current
      if (forcedQuery?.requestId === tokensRequest.id) {
        // A forced request is released by the refetch promise above. Waiting
        // for that promise avoids relying on Date.now()/dataUpdatedAt, which
        // can remain equal when a fast refresh completes in one millisecond.
        return
      }
      if (tokensQuery.isFetching) return
    }

    let error = ''
    if (forceRefreshErrorRef.current && tokensRequest.force) {
      error = forceRefreshErrorRef.current
      forceRefreshErrorRef.current = ''
    } else if (tokensQuery.error instanceof Error) {
      error = sanitizeCanvasError(tokensQuery.error)
    } else if (tokensQuery.error) {
      error = 'Failed to load API keys'
    }
    respondedRequestRef.current = tokensRequest.id
    sendTokens(
      tokensRequest,
      error ? { error } : { tokens: tokensQuery.data ?? [] }
    )
  }, [
    sendTokens,
    tokensRequest,
    tokensQuery.data,
    tokensQuery.error,
    tokensQuery.isFetching,
    forceRefreshVersion,
    userId,
  ])

  // Light/dark is the only axis that rewrites the color tokens, and the theme
  // provider has already applied the class by the time this runs.
  useEffect(() => {
    sendTheme()
  }, [resolvedTheme, sendTheme])

  useEffect(
    () => () => {
      clearFrameReadyWatchdog()
    },
    [clearFrameReadyWatchdog]
  )

  const handleFrameLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement>) => {
      const frame = event.currentTarget
      frameReadyWatchRef.current = frame
      if (!frameReadyRef.current) scheduleFrameReadyWatchdog(frame)
      else clearFrameReadyWatchdog()
      setFrameLoadError(false)
      // A remounted iframe may reuse a request id from its previous document.
      // Clear only the dedupe fence here; an in-flight first-load request is
      // preserved because the child can post it before the load event fires.
      seenRequestIdsRef.current.clear()
      if (respondedRequestRef.current) {
        pendingRequestRef.current = null
        respondedRequestRef.current = ''
        forcedQueryRef.current = null
        forceRefreshErrorRef.current = ''
        setTokensRequest(null)
      }
      sendTheme()
    },
    [clearFrameReadyWatchdog, scheduleFrameReadyWatchdog, sendTheme]
  )

  const handleFrameError = useCallback(() => {
    clearFrameReadyWatchdog()
    frameReadyRef.current = false
    invalidateFrameBridge()
    setFrameLoadError(true)
  }, [clearFrameReadyWatchdog, invalidateFrameBridge])

  const handleFrameRetry = useCallback(() => {
    // Fence requests from the failed document before mounting its replacement.
    // The old query may still settle after the new iframe owns frameRef; it
    // must not be allowed to post that response into the replacement window.
    clearFrameReadyWatchdog()
    frameReadyRef.current = false
    invalidateFrameBridge()
    setFrameLoadError(false)
    setFrameReloadKey((key) => key + 1)
  }, [clearFrameReadyWatchdog, invalidateFrameBridge])

  return (
    <Main className='p-0'>
      <div className='relative flex min-h-0 flex-1'>
        {frameLoadError ? (
          <div
            role='alert'
            aria-live='assertive'
            className='bg-background text-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center'
          >
            <AlertTriangle
              className='text-destructive size-8'
              aria-hidden='true'
            />
            <h2 className='text-lg font-semibold'>
              {t('Failed to load')}: {t('Infinite Canvas')}
            </h2>
            <p className='text-muted-foreground max-w-md text-sm'>
              {t('Please try again later.')}
            </p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleFrameRetry}
            >
              <RefreshCw aria-hidden='true' />
              {t('Retry')}
            </Button>
          </div>
        ) : (
          <iframe
            key={frameReloadKey}
            ref={frameRef}
            src={CANVAS_APP_PATH}
            title={t('Infinite Canvas')}
            onLoad={handleFrameLoad}
            onErrorCapture={handleFrameError}
            allow='clipboard-read; clipboard-write'
            className='min-h-0 w-full flex-1 border-0'
          />
        )}
      </div>
    </Main>
  )
}
