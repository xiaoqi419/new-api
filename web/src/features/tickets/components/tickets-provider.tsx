import React, { useState } from 'react'

import useDialogState from '@/hooks/use-dialog'

import type { TicketsDialogType } from '../types'

type TicketsContextType = {
  open: TicketsDialogType | null
  setOpen: (str: TicketsDialogType | null) => void
  refreshTrigger: number
  triggerRefresh: () => void
}

const TicketsContext = React.createContext<TicketsContextType | null>(null)

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<TicketsDialogType>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)

  return (
    <TicketsContext value={{ open, setOpen, refreshTrigger, triggerRefresh }}>
      {children}
    </TicketsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTickets = () => {
  const ctx = React.useContext(TicketsContext)
  if (!ctx) {
    throw new Error('useTickets has to be used within <TicketsProvider>')
  }
  return ctx
}
