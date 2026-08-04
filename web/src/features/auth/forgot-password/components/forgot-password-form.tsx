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

import { ClickCaptcha } from '@/components/click-captcha'
import { ArrowRight, Loader2 } from '@/components/icons'
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
import {
  forgotPasswordFormSchema,
  PASSWORD_RESET_COUNTDOWN,
} from '@/features/auth/constants'
import { useClickCaptcha } from '@/features/auth/hooks/use-click-captcha'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import { useCountdown } from '@/hooks/use-countdown'
import { cn } from '@/lib/utils'

export function ForgotPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)

  const {
    isTurnstileEnabled,
    turnstileSiteKey,
    turnstileToken,
    setTurnstileToken,
    validateTurnstile,
  } = useTurnstile()
  const {
    isClickCaptchaEnabled,
    setSolution: setCaptchaSolution,
    resetSignal: captchaResetSignal,
    resetClickCaptcha,
    validateClickCaptcha,
    captchaQuery,
  } = useClickCaptcha()
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

  async function onSubmit(data: z.infer<typeof forgotPasswordFormSchema>) {
    if (!validateTurnstile()) return
    if (!validateClickCaptcha()) return

    setIsLoading(true)
    // One check spends the challenge, so a rejected request needs a new image.
    let captchaAccepted = false
    try {
      const res = await sendPasswordResetEmail(
        data.email,
        turnstileToken,
        captchaQuery
      )
      if (res?.success) {
        captchaAccepted = true
        form.reset()
        startCountdown()
        toast.success(t('Reset email sent, please check your inbox'))
      } else {
        toast.error(res?.message || t('Failed to send reset email'))
      }
    } catch (_error) {
      // Errors are handled by global interceptor
    } finally {
      setIsLoading(false)
      if (!captchaAccepted) resetClickCaptcha()
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-2', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder='name@example.com' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isClickCaptchaEnabled && (
          <ClickCaptcha
            onSolvedChange={setCaptchaSolution}
            resetSignal={captchaResetSignal}
            className='mt-1'
          />
        )}

        <Button
          type='submit'
          className='mt-2'
          disabled={isLoading || isActive || !turnstileReady}
        >
          {isActive
            ? t('Resend ({{seconds}}s)', { seconds: secondsLeft })
            : t('Send reset email')}
          {isLoading ? <Loader2 className='animate-spin' /> : <ArrowRight />}
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
    </Form>
  )
}
