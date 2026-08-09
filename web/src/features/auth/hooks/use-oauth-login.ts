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
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { clearAuthentication, isAuthBundle } from '@/lib/api'

import { createOAuthFlow, logout, telegramLogin } from '../api'
import {
  buildGitHubOAuthUrl,
  buildDiscordOAuthUrl,
  buildOIDCOAuthUrl,
  buildLinuxDOOAuthUrl,
} from '../lib/oauth'
import { pickTelegramAuthorization } from '../lib/telegram-login'
import type {
  SystemStatus,
  CustomOAuthProviderInfo,
  ClickCaptchaSolution,
} from '../types'
import { useAuthRedirect } from './use-auth-redirect'
import { toCaptchaQuery, useClickCaptchaEnabled } from './use-click-captcha'

/**
 * Hook for managing OAuth login
 */
export function useOAuthLogin(
  status: SystemStatus | null,
  redirectTo?: string
) {
  const { t } = useTranslation()
  const { handleLoginSuccess } = useAuthRedirect()
  const [isLoading, setIsLoading] = useState(false)
  const [isTelegramDialogOpen, setIsTelegramDialogOpen] = useState(false)
  const [isTelegramPending, setIsTelegramPending] = useState(false)
  const [githubButtonText, setGithubButtonText] = useState('')
  const [githubButtonDisabled, setGithubButtonDisabled] = useState(false)
  const githubTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isClickCaptchaEnabled = useClickCaptchaEnabled()
  const [isCaptchaDialogOpen, setIsCaptchaDialogOpen] = useState(false)
  // A one-shot continuation, so a ref rather than state: keeping a function in
  // state would need the awkward setState(() => fn) form and buys nothing here.
  const pendingLoginRef = useRef<
    ((captcha: ClickCaptchaSolution | null) => Promise<void>) | null
  >(null)

  useEffect(() => {
    setGithubButtonText(t('Continue with GitHub'))

    return () => {
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current)
      }
    }
  }, [t])

  const resetSession = async () => {
    const response = await logout()
    if (!response.success) {
      throw new Error(response.message || t('Failed to sign out session'))
    }
    clearAuthentication()
  }

  /**
   * Every provider redirect starts by asking the server for a state token, so
   * the challenge is raised once here instead of in each provider handler.
   */
  const withCaptcha = (
    start: (captcha: ClickCaptchaSolution | null) => Promise<void>
  ) => {
    if (!isClickCaptchaEnabled) {
      void start(null)
      return
    }
    pendingLoginRef.current = start
    setIsCaptchaDialogOpen(true)
  }

  const handleCaptchaSolved = (solution: ClickCaptchaSolution) => {
    setIsCaptchaDialogOpen(false)
    const start = pendingLoginRef.current
    pendingLoginRef.current = null
    if (start) void start(solution)
  }

  const startGitHubLogin = async (captcha: ClickCaptchaSolution | null) => {
    if (!status?.github_client_id) return
    if (githubButtonDisabled) return

    setIsLoading(true)
    setGithubButtonDisabled(true)
    setGithubButtonText(t('Redirecting to GitHub...'))

    if (githubTimeoutRef.current) {
      clearTimeout(githubTimeoutRef.current)
    }

    githubTimeoutRef.current = setTimeout(() => {
      setIsLoading(false)
      setGithubButtonText(
        t('Request timed out, please refresh and restart GitHub login')
      )
      setGithubButtonDisabled(true)
    }, 20000)

    try {
      await resetSession()
      const state = await createOAuthFlow(
        'github',
        'login',
        toCaptchaQuery(captcha)
      )

      const url = buildGitHubOAuthUrl(status.github_client_id, state)
      window.open(url, '_self')
    } catch {
      toast.error(t('Failed to start GitHub login'))
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current)
      }
      setIsLoading(false)
      setGithubButtonText(t('Continue with GitHub'))
      setGithubButtonDisabled(false)
    }
  }

  const startDiscordLogin = async (captcha: ClickCaptchaSolution | null) => {
    if (!status?.discord_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await createOAuthFlow(
        'discord',
        'login',
        toCaptchaQuery(captcha)
      )

      const url = buildDiscordOAuthUrl(status.discord_client_id, state)
      window.open(url, '_self')
    } catch {
      toast.error(t('Failed to start Discord login'))
    } finally {
      setIsLoading(false)
    }
  }

  const startOIDCLogin = async (captcha: ClickCaptchaSolution | null) => {
    if (!status?.oidc_authorization_endpoint || !status?.oidc_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await createOAuthFlow(
        'oidc',
        'login',
        toCaptchaQuery(captcha)
      )

      const url = buildOIDCOAuthUrl(
        status.oidc_authorization_endpoint,
        status.oidc_client_id,
        state
      )
      window.open(url, '_self')
    } catch {
      toast.error(t('Failed to start OIDC login'))
    } finally {
      setIsLoading(false)
    }
  }

  const startLinuxDOLogin = async (captcha: ClickCaptchaSolution | null) => {
    if (!status?.linuxdo_client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await createOAuthFlow(
        'linuxdo',
        'login',
        toCaptchaQuery(captcha)
      )

      const url = buildLinuxDOOAuthUrl(status.linuxdo_client_id, state)
      window.open(url, '_self')
    } catch {
      toast.error(t('Failed to start LinuxDO login'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleTelegramLogin = async () => {
    if (!status?.telegram_bot_name?.trim()) {
      toast.error(t('Login failed'))
      return
    }

    setIsLoading(true)
    try {
      await resetSession()
      setIsTelegramDialogOpen(true)
    } catch {
      toast.error(
        t('Failed to start {{provider}} login', { provider: 'Telegram' })
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleTelegramAuthorization = async (value: unknown) => {
    const authorization = pickTelegramAuthorization(value)
    if (!authorization) {
      toast.error(t('Login failed'))
      return
    }

    setIsTelegramPending(true)
    try {
      const response = await telegramLogin(authorization)
      if (!response.success || !isAuthBundle(response.data)) {
        toast.error(t('Login failed'))
        return
      }

      setIsTelegramDialogOpen(false)
      await handleLoginSuccess(response.data, redirectTo)
      toast.success(t('Welcome back!'))
    } catch {
      toast.error(t('Login failed'))
    } finally {
      setIsTelegramPending(false)
    }
  }

  const startCustomOAuthLogin = async (
    provider: CustomOAuthProviderInfo,
    captcha: ClickCaptchaSolution | null
  ) => {
    if (!provider.authorization_endpoint || !provider.client_id) return

    setIsLoading(true)
    try {
      await resetSession()
      const state = await createOAuthFlow(
        provider.slug,
        'login',
        toCaptchaQuery(captcha)
      )

      const redirectUri = `${window.location.origin}/oauth/${provider.slug}`
      const url = new URL(provider.authorization_endpoint)
      url.searchParams.set('client_id', provider.client_id)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('state', state)
      if (provider.scopes) {
        url.searchParams.set('scope', provider.scopes)
      }

      window.open(url.toString(), '_self')
    } catch {
      toast.error(
        t('Failed to start {{provider}} login', { provider: provider.name })
      )
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    githubButtonText,
    githubButtonDisabled,
    isTelegramDialogOpen,
    isTelegramPending,
    isClickCaptchaEnabled,
    isCaptchaDialogOpen,
    setIsCaptchaDialogOpen,
    handleCaptchaSolved,
    handleGitHubLogin: () => withCaptcha(startGitHubLogin),
    handleDiscordLogin: () => withCaptcha(startDiscordLogin),
    handleOIDCLogin: () => withCaptcha(startOIDCLogin),
    handleLinuxDOLogin: () => withCaptcha(startLinuxDOLogin),
    handleTelegramLogin,
    handleTelegramAuthorization,
    setIsTelegramDialogOpen,
    handleCustomOAuthLogin: (provider: CustomOAuthProviderInfo) =>
      withCaptcha((captcha) => startCustomOAuthLogin(provider, captcha)),
  }
}
