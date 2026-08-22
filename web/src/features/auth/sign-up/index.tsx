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
import { useStatus } from '@/hooks/use-status'

import { AuthCard } from '../components/auth-card'
import { AuthExperienceLayout } from '../components/auth-experience-layout'
import { TermsFooter } from '../components/terms-footer'
import { SignUpForm } from './components/sign-up-form'

export function SignUp() {
  const { status } = useStatus()

  return (
    <AuthExperienceLayout page='sign-up'>
      <AuthCard
        showBrand={false}
        className='border-border/80 bg-card/95 rounded-[8px] px-5 py-6 shadow-[0_24px_70px_-36px_color-mix(in_oklab,var(--primary)_38%,transparent)] backdrop-blur-sm sm:px-7 sm:py-8'
      >
        <SignUpForm />

        <TermsFooter
          variant='sign-up'
          status={status}
          className='mt-[14px] leading-relaxed'
        />
      </AuthCard>
    </AuthExperienceLayout>
  )
}
