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
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { ClickCaptchaDialog } from '@/components/click-captcha-dialog'
import { Dialog } from '@/components/dialog'
import { Loader2, LogIn, KeyRound } from '@/components/icons'
import { PasswordInput } from '@/components/password-input'
import { Turnstile } from '@/components/turnstile'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login, wechatLoginByCode } from '@/features/auth/api'
import {
  AuthDivider,
  authInputClassName,
  authSecondaryButtonClassName,
  authSubmitClassName,
} from '@/features/auth/components/auth-card'
import { AuthTabs } from '@/features/auth/components/auth-tabs'
import { OAuthProviders } from '@/features/auth/components/oauth-providers'
import { WeChatMpLoginDialog } from '@/features/auth/components/wechat-mp-login-dialog'
import { loginFormSchema } from '@/features/auth/constants'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import {
  toCaptchaQuery,
  useClickCaptchaEnabled,
} from '@/features/auth/hooks/use-click-captcha'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import { hasOAuthProviders } from '@/features/auth/lib/oauth'
import { beginPasskeyLogin, finishPasskeyLogin } from '@/features/auth/passkey'
import type { AuthFormProps, ClickCaptchaSolution } from '@/features/auth/types'
import { useStatus } from '@/hooks/use-status'
import { isAuthBundle } from '@/lib/api'
import {
  buildAssertionResult,
  prepareCredentialRequestOptions,
  isPasskeySupported as detectPasskeySupport,
} from '@/lib/passkey'
import { getServerErrorMessageKey } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: AuthFormProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [wechatCode, setWeChatCode] = useState('')
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
  const [isWeChatDialogOpen, setIsWeChatDialogOpen] = useState(false)
  const [isWeChatSubmitting, setIsWeChatSubmitting] = useState(false)
  const [isCaptchaDialogOpen, setIsCaptchaDialogOpen] = useState(false)
  const loginFailedMessage = t('Login failed')

  const { status } = useStatus()
  const passkeyLoginEnabled = Boolean(
    status?.passkey_login ?? status?.data?.passkey_login
  )
  const passwordLoginEnabled =
    (status?.password_login_enabled ??
      status?.data?.password_login_enabled ??
      true) !== false
  const {
    isTurnstileEnabled,
    turnstileSiteKey,
    turnstileToken,
    setTurnstileToken,
    validateTurnstile,
  } = useTurnstile()
  const isClickCaptchaEnabled = useClickCaptchaEnabled()
  const { handleLoginSuccess, redirectTo2FA } = useAuthRedirect()
  const setPending2FAFlowToken = useAuthStore(
    (state) => state.auth.setPending2FAFlowToken
  )

  const passkeyButtonDisabled = isPasskeyLoading || !passkeySupported
  const hasWeChatLogin = Boolean(status?.wechat_login)
  // Built-in Official Account flow: the site issues the code and polls. The
  // legacy external wechat-server flow makes the user type in a code instead.
  const usesWeChatMpFlow = Boolean(status?.wechat_mp ?? status?.data?.wechat_mp)
  const hasAlternativeLogin = passkeyLoginEnabled || hasOAuthProviders(status)

  useEffect(() => {
    detectPasskeySupport()
      .then(setPasskeySupported)
      .catch(() => setPasskeySupported(false))
  }, [])

  const form = useForm<z.infer<typeof loginFormSchema>>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  })

  const wechatQrCodeUrl = useMemo(() => {
    return (
      status?.wechat_qrcode ||
      status?.wechat_qr_code ||
      status?.wechat_qrcode_image_url ||
      status?.wechat_qr_code_image_url ||
      status?.wechat_account_qrcode_image_url ||
      status?.WeChatAccountQRCodeImageURL ||
      status?.data?.wechat_qrcode ||
      status?.data?.WeChatAccountQRCodeImageURL ||
      ''
    )
  }, [status])

  async function submitLogin(
    data: z.infer<typeof loginFormSchema>,
    captchaSolution: ClickCaptchaSolution | null
  ) {
    setIsLoading(true)
    try {
      const res = await login({
        username: data.username,
        password: data.password,
        turnstile: turnstileToken,
        captcha: toCaptchaQuery(captchaSolution),
      })

      if (res.success) {
        if (res.data && 'require_2fa' in res.data && res.data.require_2fa) {
          if (!res.data.flow_token) {
            throw new Error(t('Login flow expired. Please sign in again.'))
          }
          setPending2FAFlowToken(res.data.flow_token)
          redirectTo2FA()
          return
        }

        if (!isAuthBundle(res.data)) {
          throw new Error(t('Login failed'))
        }
        await handleLoginSuccess(res.data, redirectTo)
        toast.success(t('Welcome back!'))
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) return
      toast.error(error instanceof Error ? error.message : loginFailedMessage)
    } finally {
      setIsLoading(false)
    }
  }

  function onSubmit(data: z.infer<typeof loginFormSchema>) {
    if (!validateTurnstile()) return

    // The captcha is asked for last: a challenge is spent on the first check
    // either way, so it is only worth showing once the form is otherwise ready.
    if (isClickCaptchaEnabled) {
      setIsCaptchaDialogOpen(true)
      return
    }
    void submitLogin(data, null)
  }

  // Closing the dialog unmounts the puzzle, so a rejected sign-in gets a fresh
  // image on the next attempt without any explicit reset.
  const handleCaptchaSolved = (solution: ClickCaptchaSolution) => {
    setIsCaptchaDialogOpen(false)
    void form.handleSubmit((data) => submitLogin(data, solution))()
  }

  const handleWeChatDialogChange = (open: boolean) => {
    setIsWeChatDialogOpen(open)
    if (!open) {
      setWeChatCode('')
      setIsWeChatSubmitting(false)
    }
  }

  async function handleWeChatLogin() {
    if (!wechatCode.trim()) {
      toast.error(t('Please enter the verification code'))
      return
    }

    setIsWeChatSubmitting(true)
    try {
      const res = await wechatLoginByCode(wechatCode)
      if (res?.success && isAuthBundle(res.data)) {
        await handleLoginSuccess(res.data, redirectTo)
        toast.success(t('Signed in via WeChat'))
        handleWeChatDialogChange(false)
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res?.message || loginFailedMessage)
      }
    } catch (error: unknown) {
      if (getServerErrorMessageKey(error)) return
      toast.error(loginFailedMessage)
    } finally {
      setIsWeChatSubmitting(false)
    }
  }

  async function handlePasskeyLogin() {
    if (!passkeySupported) {
      toast.error(t('Passkey is not supported on this device'))
      return
    }

    if (!navigator?.credentials) {
      toast.error(t('Passkey is not available in this browser'))
      return
    }

    setIsPasskeyLoading(true)
    try {
      const begin = await beginPasskeyLogin()
      if (!begin.success) {
        if (getServerErrorMessageKey(begin)) return
        throw new Error(begin.message || t('Failed to start Passkey login'))
      }

      const publicKey = prepareCredentialRequestOptions(
        begin.data?.options ?? begin.data
      )
      const flowToken = begin.data?.flow_token
      if (!flowToken) {
        throw new Error(t('Login flow expired. Please sign in again.'))
      }

      const credential = (await navigator.credentials.get({
        publicKey,
      })) as PublicKeyCredential | null

      if (!credential) {
        toast.info(t('Passkey login was cancelled'))
        return
      }

      const assertion = buildAssertionResult(credential)
      if (!assertion) {
        throw new Error(t('Invalid Passkey response'))
      }

      const finish = await finishPasskeyLogin(flowToken, assertion)
      if (!finish.success) {
        if (getServerErrorMessageKey(finish)) return
        throw new Error(finish.message || t('Failed to complete Passkey login'))
      }

      if (!isAuthBundle(finish.data)) {
        throw new Error(t('Missing user data from Passkey login response'))
      }

      await handleLoginSuccess(finish.data, redirectTo)
      toast.success(t('Signed in with Passkey'))
    } catch (error: unknown) {
      if (getServerErrorMessageKey(error)) return
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        toast.info(t('Passkey login was cancelled or timed out'))
      } else if (error instanceof Error) {
        toast.error(error.message)
      } else {
        toast.error(t('Passkey login failed'))
      }
    } finally {
      setIsPasskeyLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-[18px]', className)}
        {...props}
      >
        {passkeyLoginEnabled && (
          <div className='space-y-1'>
            <Button
              type='button'
              variant='outline'
              disabled={passkeyButtonDisabled}
              onClick={handlePasskeyLogin}
              className={cn(authSecondaryButtonClassName, 'w-full')}
            >
              {isPasskeyLoading ? (
                <Loader2 className='size-[19px] animate-spin' />
              ) : (
                <KeyRound className='size-[19px]' />
              )}
              {t('Sign in with Passkey')}
            </Button>
            {!passkeySupported && (
              <p className='text-muted-foreground text-xs'>
                {t('Passkey is not supported on this device.')}
              </p>
            )}
          </div>
        )}

        <OAuthProviders
          status={status}
          redirectTo={redirectTo}
          disabled={isLoading}
          onWeChatLogin={
            hasWeChatLogin ? () => setIsWeChatDialogOpen(true) : undefined
          }
          isWeChatLoading={isWeChatSubmitting}
        />

        {passwordLoginEnabled && (
          <>
            {hasAlternativeLogin && (
              <AuthDivider>{t('Or sign in with your account')}</AuthDivider>
            )}

            <AuthTabs active='sign-in' />

            {/* Username Field */}
            <FormField
              control={form.control}
              name='username'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Username or Email')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('Enter your username or email')}
                      className={authInputClassName}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password Field */}
            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem className='relative'>
                  <FormLabel>{t('Password')}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder={t('Enter password')}
                      className={authInputClassName}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <Link
                    to='/forgot-password'
                    className='text-muted-foreground absolute end-0 -top-0.5 z-10 text-sm font-medium hover:opacity-75'
                  >
                    {t('Forgot password?')}
                  </Link>
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type='submit'
              className={authSubmitClassName}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
              {t('Sign in')}
            </Button>

            {/* Turnstile */}
            {isTurnstileEnabled && (
              <Turnstile
                siteKey={turnstileSiteKey}
                onVerify={setTurnstileToken}
              />
            )}
          </>
        )}
      </form>

      {isClickCaptchaEnabled && (
        <ClickCaptchaDialog
          open={isCaptchaDialogOpen}
          onOpenChange={setIsCaptchaDialogOpen}
          onSolved={handleCaptchaSolved}
        />
      )}

      {hasWeChatLogin && usesWeChatMpFlow && (
        <WeChatMpLoginDialog
          open={isWeChatDialogOpen}
          redirectTo={redirectTo}
          onOpenChange={handleWeChatDialogChange}
        />
      )}

      {hasWeChatLogin && !usesWeChatMpFlow && (
        <Dialog
          open={isWeChatDialogOpen}
          onOpenChange={handleWeChatDialogChange}
          title={t('WeChat sign in')}
          description={t(
            'Scan the QR code to follow the official account and reply with “验证码” to receive your verification code.'
          )}
          contentClassName='max-w-sm'
          headerClassName='text-left'
          contentHeight='auto'
          bodyClassName='space-y-4'
          footer={
            <>
              <Button
                type='button'
                variant='outline'
                onClick={() => handleWeChatDialogChange(false)}
                disabled={isWeChatSubmitting}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='button'
                onClick={handleWeChatLogin}
                disabled={isWeChatSubmitting || !wechatCode.trim()}
                className='gap-2'
              >
                {isWeChatSubmitting ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : null}
                {t('Confirm')}
              </Button>
            </>
          }
        >
          {wechatQrCodeUrl ? (
            <div className='flex justify-center'>
              <img
                src={wechatQrCodeUrl}
                alt={t('WeChat login QR code')}
                className='h-40 w-40 rounded-md border object-contain'
              />
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('QR code is not configured. Please contact support.')}
            </p>
          )}
          <div className='grid gap-2'>
            <Label htmlFor='wechat-code'>{t('Verification code')}</Label>
            <Input
              id='wechat-code'
              placeholder={t('Enter the verification code')}
              value={wechatCode}
              onChange={(event) => setWeChatCode(event.target.value)}
              autoComplete='one-time-code'
            />
          </div>
        </Dialog>
      )}
    </Form>
  )
}
