import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'

import { TicketsAdminTable } from './components/tickets-admin-table'
import { TicketsProvider } from './components/tickets-provider'

export function TicketsAdmin() {
  const { t } = useTranslation()
  return (
    <TicketsProvider>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Ticket Management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <TicketsAdminTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TicketsProvider>
  )
}
