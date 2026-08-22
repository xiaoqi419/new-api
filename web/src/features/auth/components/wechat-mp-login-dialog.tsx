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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { isAuthBundle } from '@/lib/api'

import { checkWeChatMpLogin, requestWeChatMpLoginCode } from '../api'
import { useAuthRedirect } from '../hooks/use-auth-redirect'
import { useWeChatMpCode } from '../hooks/use-wechat-mp-code'
import { WeChatMpCodePanel } from './wechat-mp-code-panel'
import { WeChatMpUnboundPanel } from './wechat-mp-unbound-panel'

type UnboundState = { token: string; registerEnabled: boolean }

type WeChatMpLoginDialogProps = {
  open: boolean
  redirectTo?: string
  onOpenChange: (open: boolean) => void
}

export function WeChatMpLoginDialog(props: WeChatMpLoginDialogProps) {
  const { t } = useTranslation()
  const { handleLoginSuccess } = useAuthRedirect()
  const [unbound, setUnbound] = useState<UnboundState | null>(null)

  useEffect(() => {
    if (!props.open) setUnbound(null)
  }, [props.open])

  const finishSignIn = useCallback(
    async (data: unknown) => {
      if (!isAuthBundle(data)) {
        toast.error(t('Sign in failed'))
        return
      }
      await handleLoginSuccess(data, props.redirectTo)
      toast.success(t('Signed in via WeChat'))
      props.onOpenChange(false)
    },
    [handleLoginSuccess, props, t]
  )

  const checkOnce = useCallback(
    async (token: string) => {
      const response = await checkWeChatMpLogin(token)
      if (!response?.success) {
        // A failed poll is terminal: the backend only answers with an error for
        // banned users, disabled registration, or a disabled integration.
        toast.error(response?.message || t('Sign in failed'))
        props.onOpenChange(false)
        return true
      }
      const status = (response.data as { status?: string } | undefined)?.status
      if (status === 'unbound') {
        setUnbound({
          token,
          registerEnabled:
            (response.data as { register_enabled?: boolean })
              .register_enabled !== false,
        })
        return true
      }
      if (!isAuthBundle(response.data)) {
        return false
      }
      await finishSignIn(response.data)
      return true
    },
    [finishSignIn, props, t]
  )

  const mpCode = useWeChatMpCode({
    active: props.open,
    requestCode: requestWeChatMpLoginCode,
    checkOnce,
  })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Sign in with WeChat')}
      description={
        unbound
          ? t('One more step before we sign you in.')
          : t(
              'Scan the QR code to follow the Official Account, then send it the code below.'
            )
      }
      contentClassName='max-w-sm'
      headerClassName='text-left'
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
      {unbound ? (
        <WeChatMpUnboundPanel
          token={unbound.token}
          registerEnabled={unbound.registerEnabled}
          onAuthenticated={finishSignIn}
        />
      ) : (
        <WeChatMpCodePanel
          phase={mpCode.phase}
          code={mpCode.code}
          qrCodeUrl={mpCode.qrCodeUrl}
          errorMessage={mpCode.errorMessage}
          onRefresh={mpCode.refresh}
        />
      )}
    </Dialog>
  )
}
