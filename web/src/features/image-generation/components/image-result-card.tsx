import { useTranslation } from 'react-i18next'

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
import { Download, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'

interface ImageResultCardProps {
  loading: boolean
  images: string[]
  errorMsg: string
}

export function ImageResultCard(props: ImageResultCardProps) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col gap-3'>
      {props.errorMsg && (
        <div className='border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm'>
          {props.errorMsg}
        </div>
      )}

      {props.loading && props.images.length === 0 && (
        <div className='flex flex-col items-center gap-3 py-10'>
          <Loader2 className='text-muted-foreground size-8 animate-spin' />
          <span className='text-muted-foreground text-sm'>
            {t('Generating...')}
          </span>
        </div>
      )}

      {props.images.length > 0 && (
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          {props.images.map((src) => (
            <div key={src} className='flex flex-col gap-2'>
              <img
                src={src}
                alt={t('Result')}
                className='border-border w-full rounded-lg border object-contain'
              />
              <Button
                variant='outline'
                size='sm'
                onClick={() => window.open(src, '_blank')}
              >
                <Download className='mr-1 size-3.5' />
                {t('Download / Open')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {!props.loading && props.images.length === 0 && !props.errorMsg && (
        <p className='text-muted-foreground text-sm'>
          {t('Fill in the parameters on the left and click "Generate Image".')}
        </p>
      )}
    </div>
  )
}
