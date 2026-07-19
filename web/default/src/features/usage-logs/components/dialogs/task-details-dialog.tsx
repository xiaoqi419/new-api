/*
Copyright (C) 2023-2026 QuantumNous

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
import { Check, Copy } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import type { TaskLog } from '../../types'

interface TaskDetailsDialogProps {
  log: TaskLog
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskDetailsDialog(props: TaskDetailsDialogProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const json = useMemo(() => JSON.stringify(props.log, null, 2), [props.log])

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Details')}
      description={t('View the complete details for this task')}
      descriptionClassName='sr-only'
      contentClassName='sm:max-w-2xl'
      contentHeight='min(72dvh, 720px)'
    >
      <div className='relative min-w-0'>
        <Button
          variant='ghost'
          size='sm'
          className='absolute top-1.5 right-1.5 z-10 h-6 w-6 p-0'
          onClick={() => copyToClipboard(json)}
          title={t('Copy to clipboard')}
          aria-label={t('Copy to clipboard')}
        >
          {copiedText === json ? (
            <Check className='size-3.5 text-green-600' />
          ) : (
            <Copy className='size-3.5' />
          )}
        </Button>
        <pre className='bg-muted/30 max-h-[60vh] min-w-0 overflow-auto rounded-md border p-3 pr-9 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap'>
          {json}
        </pre>
      </div>
    </Dialog>
  )
}
