import { useTranslation } from 'react-i18next'

import { Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'

import { useAnnouncements } from './announcements-provider'

export function AnnouncementsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useAnnouncements()
  return (
    <Button
      size='sm'
      onClick={() => {
        setCurrentRow(null)
        setOpen('create')
      }}
    >
      <Plus className='h-4 w-4' />
      {t('Create Announcement')}
    </Button>
  )
}
