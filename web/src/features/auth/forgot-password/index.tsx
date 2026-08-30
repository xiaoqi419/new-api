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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthCard } from '../components/auth-card'
import { AuthExperienceLayout } from '../components/auth-experience-layout'
import { ForgotPasswordForm } from './components/forgot-password-form'

export function ForgotPassword() {
  const { t } = useTranslation()
  return (
    <AuthExperienceLayout page='forgot-password'>
      <AuthCard
        showBrand={false}
        variant='canvas'
        title={t('Forgot password')}
        description={t(
          'Enter your registered email and we will send you a link to reset your password.'
        )}
      >
        <ForgotPasswordForm />

        <p className='text-muted-foreground mt-[14px] text-center text-sm'>
          {t("Don't have an account?")}
          <Link
            to='/sign-up'
            className='text-primary ms-1.5 font-bold hover:underline'
          >
            {t('Sign up')}
          </Link>
        </p>
      </AuthCard>
    </AuthExperienceLayout>
  )
}
