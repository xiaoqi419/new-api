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

import { ArrowRight, Rocket } from '@/components/icons'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { PerformanceHealthPanel } from './performance-health-panel'
import { SummaryCards } from './summary-cards'

export function OverviewDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  return (
    <div className='flex flex-col gap-4'>
      <CardStaggerContainer>
        <CardStaggerItem className='bg-card overflow-hidden rounded-2xl border shadow-xs'>
          <div className='flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5'>
            <div className='flex min-w-0 items-center gap-3'>
              <span className='bg-warning/10 text-warning flex size-10 shrink-0 items-center justify-center rounded-xl'>
                <Rocket className='size-5' aria-hidden='true' />
              </span>
              <div className='min-w-0'>
                <h3 className='text-sm font-semibold'>
                  {t('Get started in the workbench')}
                </h3>
                <p className='text-muted-foreground text-xs'>
                  {t('Set up your API integration step by step.')}
                </p>
              </div>
            </div>
            <Button render={<Link to='/workbench' />}>
              <Rocket data-icon='inline-start' />
              {t('Open workbench')}
              <ArrowRight data-icon='inline-end' />
            </Button>
          </div>
        </CardStaggerItem>
      </CardStaggerContainer>

      <SummaryCards />

      {isAdmin && (
        <CardStaggerContainer>
          <CardStaggerItem>
            <PerformanceHealthPanel />
          </CardStaggerItem>
        </CardStaggerContainer>
      )}
    </div>
  )
}
