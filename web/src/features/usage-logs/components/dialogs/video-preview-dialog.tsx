import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
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
import { Copy, ExternalLink, Video } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'

interface VideoPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string
}

function VideoPreviewBody({ url }: { url: string }) {
  const { t } = useTranslation()
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasError(false)
  }, [url])

  if (!url) {
    return (
      <p className='text-muted-foreground py-4 text-center text-sm'>
        {t('None')}
      </p>
    )
  }

  if (hasError) {
    return (
      <div className='flex flex-col items-center gap-3 py-6 text-center'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'The video cannot be played here, possibly due to cross-origin or anti-hotlinking limits.'
          )}
        </p>
        <div className='flex flex-wrap items-center justify-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            className='h-8 gap-1'
            onClick={() => window.open(url, '_blank')}
          >
            <ExternalLink className='size-3.5' />
            {t('Open in new tab')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            className='h-8 gap-1'
            onClick={() => {
              navigator.clipboard.writeText(url)
              toast.success(t('Copied'))
            }}
          >
            <Copy className='size-3.5' />
            {t('Copy Link')}
          </Button>
        </div>
        <p className='text-muted-foreground max-w-full text-[10px] break-all'>
          {url}
        </p>
      </div>
    )
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={url}
      controls
      autoPlay
      preload='metadata'
      className='max-h-[70vh] w-full rounded-md bg-black'
      onError={() => setHasError(true)}
    />
  )
}

export function VideoPreviewDialog(props: VideoPreviewDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <>
          <IconBadge tone='chart-1' size='sm'>
            <Video />
          </IconBadge>
          {t('Video Preview')}
        </>
      }
      contentClassName='sm:max-w-2xl'
      titleClassName='flex items-center gap-2'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      <VideoPreviewBody url={props.url} />
    </Dialog>
  )
}
