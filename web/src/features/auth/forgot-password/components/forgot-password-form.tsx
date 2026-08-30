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
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { ClickCaptchaDialog } from '@/components/click-captcha-dialog'
import { Loader2 } from '@/components/icons'
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
import { sendPasswordResetEmail } from '@/features/auth/api'
import { AuthCapsuleCanvas } from '@/features/auth/components/auth-capsule-canvas'
import {
  authInputClassName,
  authSubmitClassName,
} from '@/features/auth/components/auth-card'
import {
  forgotPasswordFormSchema,
  PASSWORD_RESET_COUNTDOWN,
} from '@/features/auth/constants'
import {
  toCaptchaQuery,
  useClickCaptchaEnabled,
} from '@/features/auth/hooks/use-click-captcha'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import type { ClickCaptchaSolution } from '@/features/auth/types'
import { useCountdown } from '@/hooks/use-countdown'
import { cn } from '@/lib/utils'

export function ForgotPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [isCaptchaDialogOpen, setIsCaptchaDialogOpen] = useState(false)

  const {
    isTurnstileEnabled,
    turnstileSiteKey,
    turnstileToken,
    setTurnstileToken,
    validateTurnstile,
  } = useTurnstile()
  const isClickCaptchaEnabled = useClickCaptchaEnabled()
  const {
    secondsLeft,
    isActive,
    start: startCountdown,
  } = useCountdown({ initialSeconds: PASSWORD_RESET_COUNTDOWN })

  const form = useForm<z.infer<typeof forgotPasswordFormSchema>>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  })
  const turnstileReady = !isTurnstileEnabled || Boolean(turnstileToken)

  async function sendResetEmail(
    data: z.infer<typeof forgotPasswordFormSchema>,
    captchaSolution: ClickCaptchaSolution | null
  ) {
    setIsLoading(true)
    try {
      const res = await sendPasswordResetEmail(
        data.email,
        turnstileToken,
        toCaptchaQuery(captchaSolution)
      )
      if (res?.success) {
        form.reset()
        startCountdown()
        toast.success(t('Reset email sent, please check your inbox'))
      } else {
        toast.error(res?.message || t('Failed to send reset email'))
      }
    } catch {
      // Errors are handled by global interceptor
    } finally {
      setIsLoading(false)
    }
  }

  function onSubmit(data: z.infer<typeof forgotPasswordFormSchema>) {
    if (!validateTurnstile()) return

    // The captcha is asked for last: a challenge is spent on the first check
    // either way, so it is only worth showing once the form is otherwise ready.
    if (isClickCaptchaEnabled) {
      setIsCaptchaDialogOpen(true)
      return
    }
    void sendResetEmail(data, null)
  }

  // Closing the dialog unmounts the puzzle, so a rejected request gets a fresh
  // image on the next attempt without any explicit reset.
  const handleCaptchaSolved = (solution: ClickCaptchaSolution) => {
    setIsCaptchaDialogOpen(false)
    void form.handleSubmit((data) => sendResetEmail(data, solution))()
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-[18px]', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Email')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('name@example.com')}
                  className={authInputClassName}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type='submit'
          className={authSubmitClassName}
          disabled={isLoading || isActive || !turnstileReady}
        >
          <AuthCapsuleCanvas />
          <span className='auth-submit-content'>
            {isActive
              ? t('Resend ({{seconds}}s)', { seconds: secondsLeft })
              : t('Send reset email')}
            {isLoading ? <Loader2 className='animate-spin' /> : null}
          </span>
        </Button>

        {isTurnstileEnabled && (
          <div className='mt-2'>
            <Turnstile
              siteKey={turnstileSiteKey}
              onVerify={setTurnstileToken}
            />
          </div>
        )}
      </form>

      {isClickCaptchaEnabled && (
        <ClickCaptchaDialog
          open={isCaptchaDialogOpen}
          onOpenChange={setIsCaptchaDialogOpen}
          onSolved={handleCaptchaSolved}
        />
      )}
    </Form>
  )
}
