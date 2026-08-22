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
import { Link, type LinkProps } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  ArrowRight,
  CreditCard,
  FileText,
  KeyRound,
  Layers,
  type LucideIcon,
  Rocket,
} from '@/components/icons'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { PerformanceHealthPanel } from './performance-health-panel'
import { SummaryCards } from './summary-cards'

/* The four destinations an operator actually reaches for from the console
 * home. Labels reuse translation keys the sidebar already ships. */
const QUICK_ACTIONS: {
  to: LinkProps['to'] | (string & {})
  labelKey: string
  Icon: LucideIcon
}[] = [
  { to: '/keys', labelKey: 'API Keys', Icon: KeyRound },
  { to: '/finance/wallet', labelKey: 'Recharge', Icon: CreditCard },
  { to: '/usage-logs/common', labelKey: 'Usage Logs', Icon: FileText },
  { to: '/pricing', labelKey: 'Model Square', Icon: Layers },
]

export function OverviewDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  return (
    <div className='flex flex-col gap-4'>
      <CardStaggerContainer>
        <CardStaggerItem className='bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1'>
          <div className='flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5'>
            <div className='flex min-w-0 items-center gap-3'>
              <IconBadge size='lg'>
                <Rocket />
              </IconBadge>
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

          <div className='grid grid-cols-2 gap-2 border-t p-3 sm:grid-cols-4 sm:gap-3 sm:p-4'>
            {QUICK_ACTIONS.map(({ to, labelKey, Icon }) => (
              <Button
                key={to}
                variant='outline'
                className='[&_svg]:text-primary justify-start'
                render={<Link to={to} />}
              >
                <Icon data-icon='inline-start' />
                {t(labelKey)}
              </Button>
            ))}
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
