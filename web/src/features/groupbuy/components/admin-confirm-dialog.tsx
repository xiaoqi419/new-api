/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

interface AdminConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmText: string
  destructive?: boolean
  loading?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmText,
  destructive = false,
  loading = false,
  onOpenChange,
  onConfirm,
}: AdminConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      contentClassName='sm:max-w-md'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t('Cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className='mr-2 size-4 animate-spin' />}
            {confirmText}
          </Button>
        </>
      }
    >
      <div />
    </Dialog>
  )
}
