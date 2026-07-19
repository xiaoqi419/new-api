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

import { InviteRankingPanel } from './components/invite-ranking-panel'
import { RebateRatiosPanel } from './components/rebate-ratios-panel'
import { RebateRecordsPanel } from './components/rebate-records-panel'

export function RebateAdmin() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Rebate')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <Tabs defaultValue='records' className='w-full'>
          <TabsList>
            <TabsTrigger value='records'>{t('Rebate Records')}</TabsTrigger>
            <TabsTrigger value='ratios'>
              {t('Rebate Ratio Settings')}
            </TabsTrigger>
            <TabsTrigger value='ranking'>{t('Invite Ranking')}</TabsTrigger>
          </TabsList>
          <TabsContent value='records' className='pt-4'>
            <RebateRecordsPanel />
          </TabsContent>
          <TabsContent value='ratios' className='pt-4'>
            <RebateRatiosPanel />
          </TabsContent>
          <TabsContent value='ranking' className='pt-4'>
            <InviteRankingPanel />
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
