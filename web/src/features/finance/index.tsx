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
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import type { NavGroup } from '@/components/layout/types'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GroupBuyHall } from '@/features/groupbuy/hall'
import { UserInvoices } from '@/features/invoices'
import { LotteryPage } from '@/features/lottery'
import { Wallet } from '@/features/wallet'
import { useSidebarConfig } from '@/hooks/use-sidebar-config'

import {
  FINANCE_DEFAULT_SECTION,
  type FinanceSectionId,
  isFinanceSectionId,
} from './section-registry'

const route = getRouteApi('/_authenticated/finance/$section')

const SECTION_ORDER: FinanceSectionId[] = [
  'wallet',
  'groupbuy',
  'invoices',
  'lottery',
]

const SECTION_META: Record<FinanceSectionId, { titleKey: string }> = {
  wallet: { titleKey: 'Wallet' },
  groupbuy: { titleKey: 'Group Buy Hall' },
  invoices: { titleKey: 'Invoices' },
  lottery: { titleKey: 'Lucky Draw' },
}

export function FinanceCenter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = route.useParams()
  const search = route.useSearch()
  const activeSection: FinanceSectionId =
    params.section && isFinanceSectionId(params.section)
      ? params.section
      : FINANCE_DEFAULT_SECTION

  const tabNavGroups = useMemo<NavGroup[]>(
    () => [
      {
        title: 'Finance Center',
        items: SECTION_ORDER.map((section) => ({
          title: SECTION_META[section].titleKey,
          url: `/finance/${section}`,
        })),
      },
    ],
    []
  )
  const filteredTabGroups = useSidebarConfig(tabNavGroups)
  const visibleSections = useMemo(
    () =>
      (filteredTabGroups[0]?.items ?? [])
        .map((item) => {
          if (!('url' in item) || typeof item.url !== 'string') return null
          return item.url.split('/').pop() ?? null
        })
        .filter((section): section is FinanceSectionId =>
          Boolean(section && isFinanceSectionId(section))
        ),
    [filteredTabGroups]
  )

  const handleSectionChange = useCallback(
    (section: string) => {
      if (!isFinanceSectionId(section)) return
      void navigate({
        to: '/finance/$section',
        params: { section },
      })
    },
    [navigate]
  )

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t(SECTION_META[activeSection].titleKey)}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          {visibleSections.length > 1 && (
            <Tabs value={activeSection} onValueChange={handleSectionChange}>
              <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
                {visibleSections.map((section) => (
                  <TabsTrigger key={section} value={section}>
                    {t(SECTION_META[section].titleKey)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {activeSection === 'wallet' && (
            <Wallet initialShowHistory={search.show_history} />
          )}
          {activeSection === 'groupbuy' && <GroupBuyHall />}
          {activeSection === 'invoices' && <UserInvoices />}
          {activeSection === 'lottery' && <LotteryPage />}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
