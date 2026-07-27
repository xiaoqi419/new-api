import { TicketCreateDrawer } from './ticket-create-drawer'
import { useTickets } from './tickets-provider'

export function TicketsDialogs() {
  const { open, setOpen } = useTickets()
  return (
    <TicketCreateDrawer
      open={open === 'create'}
      onOpenChange={(isOpen) => !isOpen && setOpen(null)}
    />
  )
}
