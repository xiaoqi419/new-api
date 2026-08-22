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
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
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
async function fetchCanvasTokens() {
  const list = await getApiKeys({ p: 1, size: 100 })
  if (!list.success) throw new Error(list.message || 'Failed to load API keys')

  const enabled = (list.data?.items ?? []).filter(
    (item) => item.status === API_KEY_STATUS.ENABLED
  )
  if (!enabled.length) return []

  const batch = await fetchTokenKeysBatch(enabled.map((item) => item.id))
  if (!batch.success) {
    throw new Error(batch.message || 'Failed to load API keys')
  }

  const keys = batch.data?.keys ?? {}
  return enabled
    .map((item) => ({
      id: item.id,
      name: item.name,
      key: keys[item.id] ? `sk-${keys[item.id]}` : '',
    }))
    .filter((token) => token.key)
}

export function CanvasStudio() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const userId = useAuthStore((state) => state.auth.user?.id)
  // Bumped on every request so a reload inside the iframe gets an answer too.
  const [tokensRequest, setTokensRequest] = useState(0)

  const tokensQuery = useQuery({
    queryKey: ['canvas-host-tokens', userId],
    queryFn: fetchCanvasTokens,
    enabled: tokensRequest > 0 && Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

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
      if (event.origin !== window.location.origin) return
      if (event.data?.type === `${THEME_MESSAGE}:ready`) sendTheme()
      if (event.data?.type === TOKENS_REQUEST_MESSAGE) {
        setTokensRequest((count) => count + 1)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [sendTheme])

  useEffect(() => {
    if (!tokensRequest) return
    const frame = frameRef.current?.contentWindow
    if (!frame) return
    if (!tokensQuery.data && !tokensQuery.error) return

    frame.postMessage(
      tokensQuery.error
        ? { type: TOKENS_MESSAGE, error: tokensQuery.error.message }
        : { type: TOKENS_MESSAGE, tokens: tokensQuery.data },
      window.location.origin
    )
  }, [tokensRequest, tokensQuery.data, tokensQuery.error])

  // Light/dark is the only axis that rewrites the color tokens, and the theme
  // provider has already applied the class by the time this runs.
  useEffect(() => {
    sendTheme()
  }, [resolvedTheme, sendTheme])

  return (
    <Main className='p-0'>
      <iframe
        ref={frameRef}
        src={CANVAS_APP_PATH}
        title={t('Infinite Canvas')}
        onLoad={sendTheme}
        allow='clipboard-read; clipboard-write'
        className='min-h-0 w-full flex-1 border-0'
      />
    </Main>
  )
}
