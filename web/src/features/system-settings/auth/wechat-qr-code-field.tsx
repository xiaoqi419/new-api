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
import { type ChangeEvent, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ImageIcon, Trash2, Upload } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const MAX_QR_CODE_BYTES = 256 * 1024

type WeChatQrCodeFieldProps = {
  value: string
  onChange: (value: string) => void
}

/**
 * QR code picker backed by a single option string: either a plain image URL or
 * an inlined data URL. Uploads are inlined because the deployment has no image
 * hosting, and the option column is the only storage available.
 */
export function WeChatQrCodeField(props: WeChatQrCodeFieldProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_QR_CODE_BYTES) {
      toast.error(t('QR code image must be 256 KB or smaller'))
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        props.onChange(reader.result)
      }
    })
    reader.addEventListener('error', () => {
      toast.error(t('Failed to read the selected image'))
    })
    reader.readAsDataURL(file)
  }

  return (
    <div className='flex flex-col gap-3 sm:flex-row sm:items-start'>
      <div className='bg-muted/30 flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border'>
        {props.value ? (
          <img
            src={props.value}
            alt={t('WeChat login QR code')}
            className='size-full object-contain'
          />
        ) : (
          <ImageIcon className='text-muted-foreground size-6' />
        )}
      </div>

      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <Input
          placeholder={t('https://example.com/qr-code.png')}
          autoComplete='off'
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <div className='flex flex-wrap gap-2'>
          <input
            ref={fileInputRef}
            type='file'
            accept='image/png,image/jpeg,image/webp'
            className='hidden'
            onChange={handleFileChange}
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className='size-4' />
            {props.value ? t('Replace image') : t('Upload image')}
          </Button>
          {props.value && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => props.onChange('')}
            >
              <Trash2 className='size-4' />
              {t('Clear')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
