import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Copy, Download, Loader2 } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { formatQuota } from '@/lib/format'

import type { VideoResult } from '../types'

interface VideoResultCardProps {
  submitting: boolean
  polling: boolean
  progress: string
  result: VideoResult | null
  errorMsg: string
}

export function VideoResultCard(props: VideoResultCardProps) {
  const { t } = useTranslation()
  const loading = props.submitting || props.polling

  const handleCopy = async () => {
    if (!props.result?.url) return
    if (await copyToClipboard(props.result.url)) {
      toast.success(t('Link copied'))
    }
  }

  return (
    <div className='flex flex-col gap-3'>
      {props.errorMsg && (
        <div className='border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm'>
          {props.errorMsg}
        </div>
      )}

      {loading && !props.result && (
        <div className='flex flex-col items-center gap-3 py-10'>
          <Loader2 className='text-muted-foreground size-8 animate-spin' />
          <span className='text-muted-foreground text-sm'>
            {t('Task processing')} {props.progress}
          </span>
        </div>
      )}

      {props.result?.url && (
        <div className='flex flex-col items-start gap-3'>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={props.result.url}
            controls
            className='w-full rounded-lg bg-black'
          />
          {typeof props.result.quota === 'number' && (
            <Badge variant='secondary'>
              {t('Cost this time:')} {formatQuota(props.result.quota)}
            </Badge>
          )}
          <div className='flex gap-2'>
            <Button onClick={() => window.open(props.result?.url, '_blank')}>
              <Download className='mr-1 size-3.5' />
              {t('Download / Open')}
            </Button>
            <Button variant='outline' onClick={handleCopy}>
              <Copy className='mr-1 size-3.5' />
              {t('Copy Link')}
            </Button>
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'The video link is valid for about 24 hours, please save it in time.'
            )}
          </p>
        </div>
      )}

      {!loading && !props.result && !props.errorMsg && (
        <p className='text-muted-foreground text-sm'>
          {t('Fill in the parameters on the left and click "Generate Video".')}
        </p>
      )}
    </div>
  )
}
