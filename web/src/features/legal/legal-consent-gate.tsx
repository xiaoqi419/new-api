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
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { logout } from '@/features/auth/api'
import { useStatus } from '@/hooks/use-status'
import { clearAuthenticatedClientState } from '@/lib/auth-session'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { agreeLegal } from './api'

function parseSetting(setting: AuthUser['setting']): Record<string, unknown> {
  if (!setting) return {}
  if (typeof setting === 'string') {
    try {
      return JSON.parse(setting) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return setting
}

function getAgreedVersion(user: AuthUser | null): string {
  if (!user) return ''
  const value = parseSetting(user.setting).agreed_legal_version
  return typeof value === 'string' ? value : ''
}

export function LegalConsentGate() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const user = useAuthStore((s) => s.auth.user)
  const setUser = useAuthStore((s) => s.auth.setUser)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const agreementEnabled = Boolean(
    status?.user_agreement_enabled ?? status?.data?.user_agreement_enabled
  )
  const privacyEnabled = Boolean(
    status?.privacy_policy_enabled ?? status?.data?.privacy_policy_enabled
  )
  const legalVersion = String(
    status?.legal_version ?? status?.data?.legal_version ?? ''
  )
  const agreedVersion = getAgreedVersion(user)

  const shouldShow =
    Boolean(user) &&
    legalVersion !== '' &&
    (agreementEnabled || privacyEnabled) &&
    agreedVersion !== legalVersion

  const handleAgree = async () => {
    if (!checked || submitting) return
    setSubmitting(true)
    try {
      const res = await agreeLegal()
      if (!res.success) {
        toast.error(res.message || t('Failed to update setting'))
        return
      }
      const newVersion = res.data?.agreed_legal_version || legalVersion
      if (user) {
        const nextSetting = {
          ...parseSetting(user.setting),
          agreed_legal_version: newVersion,
        }
        setUser({ ...user, setting: nextSetting })
      }
      setChecked(false)
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to update setting')
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDisagree = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await logout()
    } catch {
      /* ignore logout failure, still clear local state */
    }
    clearAuthenticatedClientState(queryClient)
    void navigate({ to: '/sign-in', replace: true })
  }

  if (!shouldShow) return null

  return (
    <Dialog
      open
      onOpenChange={() => {}}
      showCloseButton={false}
      title={t('Terms of service updated')}
      description={t(
        'Our terms have been updated. Please review and agree to continue.'
      )}
      contentClassName='sm:max-w-md'
      contentHeight='auto'
      footer={
        <>
          <Button
            variant='outline'
            onClick={handleDisagree}
            disabled={submitting}
          >
            {t('Disagree and sign out')}
          </Button>
          <Button onClick={handleAgree} disabled={!checked || submitting}>
            {t('Agree and continue')}
          </Button>
        </>
      }
    >
      <div className='border-border/60 bg-muted/40 flex items-start gap-3 rounded-md border p-3'>
        <Checkbox
          id='legal-gate-consent'
          checked={checked}
          onCheckedChange={(value) => setChecked(value === true)}
          className='mt-0.5'
        />
        <Label
          htmlFor='legal-gate-consent'
          className='text-muted-foreground items-start gap-1 text-left text-sm leading-5 font-normal'
        >
          <span>
            {t('I have read and agree to the')}{' '}
            {agreementEnabled && (
              <a
                href='/user-agreement'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:underline'
              >
                {t('User Agreement')}
              </a>
            )}
            {agreementEnabled && privacyEnabled && ' and the '}
            {privacyEnabled && (
              <a
                href='/privacy-policy'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:underline'
              >
                {t('Privacy Policy')}
              </a>
            )}
            .
          </span>
        </Label>
      </div>
    </Dialog>
  )
}
