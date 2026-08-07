/*
Copyright (C) 2025 QuantumNous

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

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FeatureToggleCard } from '@/features/system-settings/components/feature-toggle-card'

import { AdminOrdersPanel } from './components/admin-orders-panel'
import { AdminPackagesPanel } from './components/admin-packages-panel'
import { AdminRefundsPanel } from './components/admin-refunds-panel'

export function GroupBuyAdmin() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Group Buy Management')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <FeatureToggleCard
            optionKey='GroupBuyEnabled'
            label={t('Enable group buy top-up')}
            description={t(
              'Master switch for the whole feature. While it is off the group buy hall stays empty no matter how many packages are enabled here.'
            )}
          />
          <Tabs defaultValue='packages' className='w-full'>
            <TabsList>
              <TabsTrigger value='packages'>{t('Packages')}</TabsTrigger>
              <TabsTrigger value='orders'>{t('Group Buy Orders')}</TabsTrigger>
              <TabsTrigger value='refunds'>{t('Pending Refunds')}</TabsTrigger>
            </TabsList>
            <TabsContent value='packages' className='pt-4'>
              <AdminPackagesPanel />
            </TabsContent>
            <TabsContent value='orders' className='pt-4'>
              <AdminOrdersPanel />
            </TabsContent>
            <TabsContent value='refunds' className='pt-4'>
              <AdminRefundsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
