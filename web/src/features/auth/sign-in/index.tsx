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
import { useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'

import { AuthCard } from '../components/auth-card'
import { AuthExperienceLayout } from '../components/auth-experience-layout'
import { TermsFooter } from '../components/terms-footer'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })
  const { status } = useStatus()

  return (
    <AuthExperienceLayout page='sign-in'>
      <AuthCard
        showBrand={false}
        title={t('Welcome back!')}
        description={t('Sign in to continue to your workspace.')}
        className='border-border/80 bg-card/95 rounded-[8px] px-5 py-6 shadow-[0_24px_70px_-36px_color-mix(in_oklab,var(--primary)_38%,transparent)] backdrop-blur-sm sm:px-7 sm:py-8'
      >
        <UserAuthForm redirectTo={redirect} />

        <TermsFooter
          variant='sign-in'
          status={status}
          className='mt-[14px] leading-relaxed'
        />
      </AuthCard>
    </AuthExperienceLayout>
  )
}
