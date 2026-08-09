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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  IconDiscord,
  IconGithub,
  IconLinuxDo,
  IconTelegram,
  IconWeChat,
} from '@/assets/brand-icons'
import { ClickCaptchaDialog } from '@/components/click-captcha-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useOAuthLogin } from '../hooks/use-oauth-login'
import type { SystemStatus } from '../types'
import { authSecondaryButtonClassName } from './auth-card'
import { TelegramLoginDialog } from './telegram-login-dialog'

type OAuthProvidersProps = {
  status: SystemStatus | null
  disabled?: boolean
  className?: string
  onWeChatLogin?: () => void
  redirectTo?: string
}

type ProviderButton = {
  key: string
  /** Full sentence, kept as the tooltip because the tile only has room for a name. */
  label: string
  shortLabel: string
  onClick: () => void
  icon?: ReactNode
  disabled?: boolean
}

const gridColumnsClassName: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
}

export function OAuthProviders({
  status,
  disabled = false,
  className,
  onWeChatLogin,
  redirectTo,
}: OAuthProvidersProps) {
  const { t } = useTranslation()
  const {
    isLoading,
    githubButtonText,
    githubButtonDisabled,
    handleGitHubLogin,
    handleDiscordLogin,
    handleOIDCLogin,
    handleLinuxDOLogin,
    handleTelegramLogin,
    handleCustomOAuthLogin,
    isTelegramDialogOpen,
    isTelegramPending,
    handleTelegramAuthorization,
    setIsTelegramDialogOpen,
    isClickCaptchaEnabled,
    isCaptchaDialogOpen,
    setIsCaptchaDialogOpen,
    handleCaptchaSolved,
  } = useOAuthLogin(status, redirectTo)

  const providerButtons: ProviderButton[] = []

  if (status?.wechat_login && onWeChatLogin) {
    providerButtons.push({
      key: 'wechat',
      label: t('Continue with WeChat'),
      shortLabel: t('WeChat'),
      onClick: onWeChatLogin,
      icon: <IconWeChat className='size-[19px]' />,
    })
  }

  if (status?.github_oauth) {
    providerButtons.push({
      key: 'github',
      label: githubButtonText || t('Continue with GitHub'),
      shortLabel: 'GitHub',
      onClick: handleGitHubLogin,
      icon: <IconGithub className='size-[19px]' />,
      disabled: githubButtonDisabled,
    })
  }

  if (status?.discord_oauth) {
    providerButtons.push({
      key: 'discord',
      label: t('Continue with Discord'),
      shortLabel: 'Discord',
      onClick: handleDiscordLogin,
      icon: <IconDiscord className='size-[19px]' />,
    })
  }

  if (status?.oidc_enabled) {
    const oidcDisplayName = status.oidc_display_name?.trim() || 'OIDC'
    providerButtons.push({
      key: 'oidc',
      label: t('Continue with {{name}}', {
        name: oidcDisplayName,
      }),
      shortLabel: oidcDisplayName,
      onClick: handleOIDCLogin,
    })
  }

  if (status?.linuxdo_oauth) {
    providerButtons.push({
      key: 'linuxdo',
      label: t('Continue with LinuxDO'),
      shortLabel: 'LinuxDO',
      onClick: handleLinuxDOLogin,
      icon: <IconLinuxDo className='size-[19px]' />,
    })
  }

  if (status?.telegram_oauth) {
    providerButtons.push({
      key: 'telegram',
      label: t('Continue with Telegram'),
      shortLabel: 'Telegram',
      onClick: handleTelegramLogin,
      icon: <IconTelegram data-icon='inline-start' />,
    })
  }

  // Custom OAuth providers
  const customProviders = status?.custom_oauth_providers
  if (customProviders && customProviders.length > 0) {
    for (const provider of customProviders) {
      providerButtons.push({
        key: `custom-${provider.slug}`,
        label: t('Continue with {{name}}', { name: provider.name }),
        shortLabel: provider.name,
        onClick: () => handleCustomOAuthLogin(provider),
      })
    }
  }

  if (providerButtons.length === 0) return null

  return (
    <>
      <div
        className={cn(
          'grid gap-3',
          gridColumnsClassName[providerButtons.length] ?? 'grid-cols-3',
          className
        )}
      >
        {providerButtons.map(
          ({
            key,
            label,
            shortLabel,
            onClick,
            icon,
            disabled: extraDisabled,
          }) => (
            <Button
              key={key}
              variant='outline'
              type='button'
              title={label}
              disabled={disabled || isLoading || extraDisabled}
              onClick={onClick}
              className={cn(authSecondaryButtonClassName, 'w-full px-2')}
            >
              {icon}
              <span className='truncate'>{shortLabel}</span>
            </Button>
          )
        )}
      </div>

      {isClickCaptchaEnabled && (
        <ClickCaptchaDialog
          open={isCaptchaDialogOpen}
          onOpenChange={setIsCaptchaDialogOpen}
          onSolved={handleCaptchaSolved}
        />
      )}

      <TelegramLoginDialog
        open={isTelegramDialogOpen}
        botName={status?.telegram_bot_name ?? ''}
        pending={isTelegramPending}
        onOpenChange={setIsTelegramDialogOpen}
        onAuthorization={handleTelegramAuthorization}
      />
    </>
  )
}
