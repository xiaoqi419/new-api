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

  // Clients are configured with the site root and append the OpenAI path
  // themselves, so the `/v1` suffix is dropped from what users copy here.
  const baseUrl = normalizeApiBaseUrl(items[0]?.url).replace(/\/v1$/, '')
  const copied = copiedText === baseUrl

  return (
    <div className='bg-card flex items-center gap-2 rounded-lg border px-3 py-2'>
      <Link2 className='text-muted-foreground size-4 shrink-0' aria-hidden />
      <span className='text-muted-foreground shrink-0 text-sm font-medium'>
        {t('API Base URL')}
      </span>
      <button
        type='button'
        className='hover:text-primary min-w-0 flex-1 cursor-pointer text-left transition-colors'
        title={baseUrl}
        onClick={() => void copyToClipboard(baseUrl)}
      >
        <code className='block truncate font-mono text-sm'>{baseUrl}</code>
      </button>
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
