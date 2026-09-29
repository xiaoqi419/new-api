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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'

import { fetchPelicanMonitor } from './api'
import { PelicanSettingsCard } from './settings'

export function PelicanSettingsPage() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['pelican-monitor', '24h'],
    queryFn: ({ signal }) => fetchPelicanMonitor('24h', signal),
    meta: { errorToast: false },
  })
  const settings = query.data?.settings

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Degradation monitor settings')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto w-full max-w-3xl'>
          {settings ? (
            <PelicanSettingsCard
              settings={settings}
              forcedOff={Boolean(settings.enabled) && !query.data?.enabled}
            />
          ) : null}
          {!settings && query.isPending ? (
            <Skeleton className='h-80 rounded-xl' />
          ) : null}
          {!settings && !query.isPending ? (
            <EmptyState title={t('The monitor could not refresh.')} bordered />
          ) : null}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
