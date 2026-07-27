import React, { useState } from 'react'

import useDialogState from '@/hooks/use-dialog'

import type { Announcement, AnnouncementsDialogType } from '../types'

type AnnouncementsContextType = {
  open: AnnouncementsDialogType | null
  setOpen: (str: AnnouncementsDialogType | null) => void
  currentRow: Announcement | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Announcement | null>>
  refreshTrigger: number
  triggerRefresh: () => void
}

const AnnouncementsContext =
  React.createContext<AnnouncementsContextType | null>(null)

export function AnnouncementsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useDialogState<AnnouncementsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Announcement | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)

  return (
    <AnnouncementsContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      {children}
    </AnnouncementsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAnnouncements = () => {
  const ctx = React.useContext(AnnouncementsContext)
  if (!ctx) {
    throw new Error(
      'useAnnouncements has to be used within <AnnouncementsProvider>'
    )
  }
  return ctx
}
