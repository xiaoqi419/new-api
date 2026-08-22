import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'

import { deleteAnnouncement } from '../api'
import { ANNOUNCEMENT_ERROR, ANNOUNCEMENT_SUCCESS } from '../constants'
import { useAnnouncements } from './announcements-provider'

export function AnnouncementsDeleteDialog() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow, triggerRefresh } = useAnnouncements()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    if (!currentRow) return
    setIsDeleting(true)
    try {
      const res = await deleteAnnouncement(currentRow.id)
      if (res.success) {
        toast.success(t(ANNOUNCEMENT_SUCCESS.DELETED))
        setOpen(null)
        triggerRefresh()
      } else {
        toast.error(res.message || t(ANNOUNCEMENT_ERROR.DELETE_FAILED))
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <ConfirmDialog
      destructive
      open={open === 'delete'}
      onOpenChange={(v) => !v && setOpen(null)}
      handleConfirm={handleConfirm}
      isLoading={isDeleting}
      className='max-w-md'
      title={t('Delete Announcement?')}
      desc={currentRow ? currentRow.title : ''}
      confirmText={t('Delete')}
    />
  )
}
