import { useTranslation } from 'react-i18next'

import { Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'

import { useTickets } from './tickets-provider'

export function TicketsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen } = useTickets()
  return (
    <Button size='sm' onClick={() => setOpen('create')}>
      <Plus className='h-4 w-4' />
      {t('Create Ticket')}
    </Button>
  )
}
