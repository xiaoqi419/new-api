import { useTranslation } from 'react-i18next'

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
import { Check, Copy, Link2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { normalizeApiBaseUrl } from '@/lib/api-base-url'

export function ApiBaseUrlBar() {
  const { t } = useTranslation()
  const { items } = useApiInfo()
  const { copyToClipboard, copiedText } = useCopyToClipboard()

  const baseUrl = normalizeApiBaseUrl(items[0]?.url)
  const copied = copiedText === baseUrl

  return (
    <div className='bg-card flex items-center gap-2 rounded-lg border px-3 py-2'>
      <Link2 className='text-muted-foreground size-4 shrink-0' aria-hidden />
      <span className='text-muted-foreground shrink-0 text-sm font-medium'>
        {t('API Base URL')}
      </span>
      <code
        className='min-w-0 flex-1 truncate font-mono text-sm'
        title={baseUrl}
      >
        {baseUrl}
      </code>
      <Button
        variant='ghost'
        size='icon'
        className='size-8 shrink-0'
        aria-label={t('Copy')}
        onClick={() => void copyToClipboard(baseUrl)}
      >
        {copied ? <Check className='size-4' /> : <Copy className='size-4' />}
      </Button>
    </div>
  )
}
