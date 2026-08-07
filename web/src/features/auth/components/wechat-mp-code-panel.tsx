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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { RefreshCw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import type { WeChatMpPhase } from '../hooks/use-wechat-mp-code'

type WeChatMpCodePanelProps = {
  phase: WeChatMpPhase
  code: string
  qrCodeUrl: string
  errorMessage: string
  onRefresh: () => void
}

export function WeChatMpCodePanel(props: WeChatMpCodePanelProps) {
  const { t } = useTranslation()

  if (props.phase === 'loading' || props.phase === 'idle') {
    return (
      <div className='flex h-40 items-center justify-center'>
        <Spinner />
      </div>
    )
  }

  if (props.phase === 'error' || props.phase === 'expired') {
    const message =
      props.phase === 'expired'
        ? t('This code has expired. Get a new one to continue.')
        : props.errorMessage ||
          t('Could not get a verification code. Please try again.')

    return (
      <div className='flex flex-col items-center gap-3 py-6 text-center'>
        <p className='text-muted-foreground text-sm'>{message}</p>
        <Button type='button' variant='outline' onClick={props.onRefresh}>
          <RefreshCw className='size-4' />
          {t('Get a new code')}
        </Button>
      </div>
    )
  }

  return (
    <div className='flex flex-col items-center gap-4'>
      {props.qrCodeUrl ? (
        <img
          src={props.qrCodeUrl}
          alt={t('WeChat login QR code')}
          className='size-40 rounded-md border object-contain'
        />
      ) : (
        <p className='text-muted-foreground text-sm'>
          {t('QR code is not configured. Please contact support.')}
        </p>
      )}

      <div className='flex w-full flex-col items-center gap-1.5'>
        <span className='text-muted-foreground text-xs tracking-wider uppercase'>
          {t('Verification code')}
        </span>
        <div className='flex items-center gap-2'>
          <code className='bg-muted rounded-md px-3 py-1.5 font-mono text-2xl tracking-[0.3em]'>
            {props.code}
          </code>
          <CopyButton
            value={props.code}
            size='icon'
            className='size-8'
            tooltip={t('Copy code')}
            aria-label={t('Copy code')}
          />
        </div>
      </div>

      <p className='text-muted-foreground text-center text-sm'>
        {t(
          'Follow the Official Account, send this code as a message, and this page continues on its own.'
        )}
      </p>

      <div className='text-muted-foreground flex items-center gap-2 text-xs'>
        <Spinner className='size-3' />
        {t('Waiting for confirmation…')}
      </div>
    </div>
  )
}
