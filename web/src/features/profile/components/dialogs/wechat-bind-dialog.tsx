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
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { WeChatMpCodePanel } from '@/features/auth/components/wechat-mp-code-panel'
import { useWeChatMpCode } from '@/features/auth/hooks/use-wechat-mp-code'
import { useStatus } from '@/hooks/use-status'

import {
  bindWeChat,
  checkWeChatMpBind,
  requestWeChatMpBindCode,
} from '../../api'

interface WeChatBindDialogProps {
  open: boolean
  qrCodeUrl: string
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function WeChatBindDialog(props: WeChatBindDialogProps) {
  const { status } = useStatus()
  if (status?.wechat_mp) {
    return <WeChatMpBindDialog {...props} />
  }
  return <WeChatCodeBindDialog {...props} />
}

/**
 * Built-in Official Account flow: this page issues the code and polls until the
 * user forwards it to the Official Account.
 */
function WeChatMpBindDialog(props: WeChatBindDialogProps) {
  const { t } = useTranslation()

  const checkOnce = useCallback(
    async (code: string) => {
      const response = await checkWeChatMpBind(code)
      if (!response?.success) {
        toast.error(response?.message || t('Request failed'))
        props.onOpenChange(false)
        return true
      }
      if (response.data?.status !== 'bound') {
        return false
      }
      toast.success(t('Binding successful!'))
      props.onOpenChange(false)
      props.onSuccess()
      return true
    },
    [props, t]
  )

  const mpCode = useWeChatMpCode({
    active: props.open,
    requestCode: requestWeChatMpBindCode,
    checkOnce,
  })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Bind WeChat Account')}
      description={t(
        'Scan the QR code to follow the Official Account, then send it the code below.'
      )}
      contentClassName='max-w-sm'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <Button
          type='button'
          variant='outline'
          onClick={() => props.onOpenChange(false)}
        >
          {t('Cancel')}
        </Button>
      }
    >
      <WeChatMpCodePanel
        phase={mpCode.phase}
        code={mpCode.code}
        qrCodeUrl={mpCode.qrCodeUrl || props.qrCodeUrl}
        errorMessage={mpCode.errorMessage}
        onRefresh={mpCode.refresh}
      />
    </Dialog>
  )
}

/** Legacy external wechat-server flow: the user types in the received code. */
function WeChatCodeBindDialog(props: WeChatBindDialogProps) {
  const { t } = useTranslation()
  const [verificationCode, setVerificationCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleOpenChange = (open: boolean) => {
    if (submitting) return
    if (!open) setVerificationCode('')
    props.onOpenChange(open)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const code = verificationCode.trim()
    if (!code || submitting) return

    setSubmitting(true)
    try {
      const response = await bindWeChat(code)
      if (!response.success) {
        toast.error(t('Request failed'))
        return
      }

      toast.success(t('Binding successful!'))
      setVerificationCode('')
      props.onOpenChange(false)
      props.onSuccess()
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={handleOpenChange}
      title={t('Bind WeChat Account')}
      description={t(
        'Scan the QR code to follow the official account and reply with “验证码” to receive your verification code.'
      )}
      contentClassName='max-w-sm'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='wechat-bind-form'
            disabled={submitting || !verificationCode.trim()}
          >
            {submitting && <Spinner data-icon='inline-start' />}
            {t('Bind')}
          </Button>
        </>
      }
    >
      <form id='wechat-bind-form' onSubmit={handleSubmit}>
        <FieldGroup>
          {props.qrCodeUrl ? (
            <div className='flex justify-center'>
              <img
                src={props.qrCodeUrl}
                alt={t('WeChat login QR code')}
                className='size-48 rounded-lg border object-contain'
              />
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('QR code is not configured. Please contact support.')}
            </p>
          )}

          <Field data-disabled={submitting}>
            <FieldLabel htmlFor='wechat-bind-code'>
              {t('Verification code')}
            </FieldLabel>
            <Input
              id='wechat-bind-code'
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder={t('Enter the verification code')}
              autoComplete='one-time-code'
              disabled={submitting}
              autoFocus
            />
          </Field>
        </FieldGroup>
      </form>
    </Dialog>
  )
}
