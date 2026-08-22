import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'

import { AnnouncementsDialogs } from './components/announcements-dialogs'
import { AnnouncementsPrimaryButtons } from './components/announcements-primary-buttons'
import { AnnouncementsProvider } from './components/announcements-provider'
import { AnnouncementsTable } from './components/announcements-table'

export function AnnouncementsAdmin() {
  const { t } = useTranslation()
  return (
    <AnnouncementsProvider>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Announcement Management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <AnnouncementsPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <AnnouncementsTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <AnnouncementsDialogs />
    </AnnouncementsProvider>
  )
}
