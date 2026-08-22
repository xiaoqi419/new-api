import { AnnouncementsDeleteDialog } from './announcements-delete-dialog'
import { AnnouncementsMutateDrawer } from './announcements-mutate-drawer'
import { useAnnouncements } from './announcements-provider'

export function AnnouncementsDialogs() {
  const { open, setOpen, currentRow } = useAnnouncements()
  const isUpdate = open === 'update'

  return (
    <>
      <AnnouncementsMutateDrawer
        open={open === 'create' || isUpdate}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={isUpdate ? currentRow || undefined : undefined}
      />
      <AnnouncementsDeleteDialog />
    </>
  )
}
