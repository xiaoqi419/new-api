import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'

import { TicketsDialogs } from './components/tickets-dialogs'
import { TicketsPrimaryButtons } from './components/tickets-primary-buttons'
import { TicketsProvider } from './components/tickets-provider'
import { TicketsTable } from './components/tickets-table'

export function Tickets() {
  const { t } = useTranslation()
  return (
    <TicketsProvider>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>{t('Tickets')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <TicketsPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <TicketsTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <TicketsDialogs />
    </TicketsProvider>
  )
}
