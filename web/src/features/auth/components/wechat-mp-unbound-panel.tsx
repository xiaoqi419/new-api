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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'

import {
  bindWeChatMpToAccount,
  registerWeChatMpAccount,
  sendWeChatMpBindVerification,
} from '../api'

const RESEND_COOLDOWN_SECONDS = 60

type WeChatMpUnboundPanelProps = {
  token: string
  registerEnabled: boolean
  /** Receives the auth bundle returned by whichever branch the user picked. */
  onAuthenticated: (data: unknown) => Promise<void> | void
}

/**
 * Shown when a scanned WeChat account is not linked to anyone yet. Rather than
 * silently minting a throwaway account, the user chooses between attaching the
 * WeChat to an account they already own (proved by an emailed code) and
 * starting fresh.
 */
export function WeChatMpUnboundPanel(props: WeChatMpUnboundPanelProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'choose' | 'bind'>('choose')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const handleSendCode = async () => {
    if (!email.trim()) {
      toast.error(t('Please enter your email'))
      return
    }
    setSending(true)
    try {
      const response = await sendWeChatMpBindVerification(
        props.token,
        email.trim()
      )
      if (!response?.success) {
        toast.error(response?.message || t('Failed to send verification code'))
        return
      }
      // Deliberately vague: the backend answers the same way for addresses that
      // are not registered, so this endpoint cannot be used to probe for
      // existing accounts.
      toast.success(t('If that account exists, a code is on its way.'))
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } finally {
      setSending(false)
    }
  }

  const handleBind = async () => {
    if (!email.trim() || !code.trim()) {
      toast.error(t('Please enter your email and the verification code'))
      return
    }
    setSubmitting(true)
    try {
      const response = await bindWeChatMpToAccount(
        props.token,
        email.trim(),
        code.trim()
      )
      if (!response?.success) {
        toast.error(response?.message || t('Binding failed'))
        return
      }
      await props.onAuthenticated(response.data)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async () => {
    setSubmitting(true)
    try {
      const response = await registerWeChatMpAccount(props.token)
      if (!response?.success) {
        toast.error(response?.message || t('Sign in failed'))
        return
      }
      await props.onAuthenticated(response.data)
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'choose') {
    return (
      <div className='flex flex-col gap-4'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'This WeChat account is not linked to anyone yet. Link it to an account you already have, or start a new one.'
          )}
        </p>
        <Button type='button' onClick={() => setMode('bind')}>
          {t('Link an existing account')}
        </Button>
        {props.registerEnabled ? (
          <Button
            type='button'
            variant='outline'
            disabled={submitting}
            onClick={handleRegister}
          >
            {submitting ? <Spinner className='size-4' /> : null}
            {t('Create a new account')}
          </Button>
        ) : (
          <p className='text-muted-foreground text-center text-xs'>
            {t('New sign-ups are currently disabled.')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-1.5'>
        <Label htmlFor='wechat-bind-email'>{t('Account email')}</Label>
        <div className='flex items-center gap-2'>
          <Input
            id='wechat-bind-email'
            type='email'
            autoComplete='email'
            placeholder={t('you@example.com')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            type='button'
            variant='outline'
            className='shrink-0'
            disabled={sending || cooldown > 0}
            onClick={handleSendCode}
          >
            {cooldown > 0 ? `${cooldown}s` : t('Send code')}
          </Button>
        </div>
      </div>

      <div className='flex flex-col gap-1.5'>
        <Label htmlFor='wechat-bind-code'>{t('Verification code')}</Label>
        <Input
          id='wechat-bind-code'
          inputMode='numeric'
          autoComplete='one-time-code'
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          className='flex-1'
          onClick={() => setMode('choose')}
        >
          {t('Back')}
        </Button>
        <Button
          type='button'
          className='flex-1'
          disabled={submitting}
          onClick={handleBind}
        >
          {submitting ? <Spinner className='size-4' /> : null}
          {t('Link and sign in')}
        </Button>
      </div>
    </div>
  )
}
