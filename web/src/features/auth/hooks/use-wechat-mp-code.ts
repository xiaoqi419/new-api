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
import { useCallback, useEffect, useRef, useState } from 'react'

import type { WeChatMpCode } from '../types'

export const WECHAT_MP_POLL_INTERVAL_MS = 2500

export type WeChatMpPhase = 'idle' | 'loading' | 'waiting' | 'expired' | 'error'

/** Structural shape so both the auth and profile response types fit. */
type WeChatMpCodeResponse = {
  success: boolean
  message?: string
  data?: WeChatMpCode
}

type WeChatMpCodeOptions = {
  /** Poll only while the dialog is open. */
  active: boolean
  requestCode: () => Promise<WeChatMpCodeResponse>
  /**
   * One poll tick. Return `true` once the verification completed so polling
   * stops; the caller owns whatever happens next (sign-in, refetch, toast).
   */
  checkOnce: (code: string) => Promise<boolean>
}

/**
 * Drives the Official Account verification handshake: mint a code, show it,
 * and poll until the user forwards it to the Official Account.
 */
export function useWeChatMpCode(options: WeChatMpCodeOptions) {
  const [phase, setPhase] = useState<WeChatMpPhase>('idle')
  const [code, setCode] = useState('')
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // Read inside the interval so a re-render with a new closure does not require
  // tearing down and restarting the timer. Synced in an effect rather than
  // during render so a discarded render cannot publish its callbacks.
  const checkOnceRef = useRef(options.checkOnce)
  const requestCodeRef = useRef(options.requestCode)
  useEffect(() => {
    checkOnceRef.current = options.checkOnce
    requestCodeRef.current = options.requestCode
  })

  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), [])

  useEffect(() => {
    if (!options.active) {
      setPhase('idle')
      setCode('')
      setErrorMessage('')
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    let expiryTimer: ReturnType<typeof setTimeout> | undefined

    const stop = () => {
      if (timer) clearInterval(timer)
      if (expiryTimer) clearTimeout(expiryTimer)
      timer = undefined
      expiryTimer = undefined
    }

    const start = async () => {
      setPhase('loading')
      setErrorMessage('')
      let response: WeChatMpCodeResponse
      try {
        response = await requestCodeRef.current()
      } catch {
        if (!cancelled) setPhase('error')
        return
      }
      if (cancelled) return

      const issued = response.data?.code
      if (!response.success || !issued) {
        setErrorMessage(response.message || '')
        setPhase('error')
        return
      }

      setCode(issued)
      setQrCodeUrl(response.data?.qrcode ?? '')
      setPhase('waiting')

      const expireSeconds = response.data?.expire
      if (expireSeconds && expireSeconds > 0) {
        expiryTimer = setTimeout(() => {
          stop()
          if (!cancelled) setPhase('expired')
        }, expireSeconds * 1000)
      }

      timer = setInterval(async () => {
        let done = false
        try {
          done = await checkOnceRef.current(issued)
        } catch {
          return
        }
        if (done) stop()
      }, WECHAT_MP_POLL_INTERVAL_MS)
    }

    void start()

    return () => {
      cancelled = true
      stop()
    }
  }, [options.active, refreshToken])

  return { phase, code, qrCodeUrl, errorMessage, refresh }
}
