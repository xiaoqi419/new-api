import { Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { uploadTicketAttachment } from '../api'
import { MAX_TICKET_ATTACHMENTS, TICKET_ERROR } from '../constants'
import type { TicketAttachment } from '../types'

type Props = {
  value: TicketAttachment[]
  onChange: (value: TicketAttachment[]) => void
  disabled?: boolean
}

export function TicketAttachmentsField({ value, onChange, disabled }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const next = [...value]
      for (const file of files) {
        if (next.length >= MAX_TICKET_ATTACHMENTS) break
        const res = await uploadTicketAttachment(file)
        if (res.success && res.data) {
          next.push(res.data)
        } else {
          toast.error(res.message || t(TICKET_ERROR.UPLOAD_FAILED))
        }
      }
      onChange(next)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <input
        ref={inputRef}
        type='file'
        multiple
        className='hidden'
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled || uploading || value.length >= MAX_TICKET_ATTACHMENTS}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className='h-4 w-4' />
          {uploading ? t('Uploading...') : t('Add attachment')}
        </Button>
      </div>
      {value.length > 0 && (
        <ul className='flex flex-col gap-1'>
          {value.map((att) => (
            <li
              key={att.file}
              className='bg-muted/40 flex items-center gap-2 rounded px-2 py-1 text-sm'
            >
              <span className='truncate'>{att.name}</span>
              <span className='text-muted-foreground ml-auto text-xs'>
                {(att.size / 1024).toFixed(1)} KB
              </span>
              <button
                type='button'
                className='text-muted-foreground hover:text-destructive'
                aria-label={t('Remove')}
                onClick={() =>
                  onChange(value.filter((x) => x.file !== att.file))
                }
              >
                <X className='h-3.5 w-3.5' />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
