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
import { useTranslation } from 'react-i18next'

import { ShieldAlert, ShieldCheck } from '@/components/icons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { formatMonitorTs } from '../lib'
import type { ChannelModelItem } from '../types'

/**
 * Shows whether the probe believes the upstream really serves the model it
 * claims. A suspect verdict is deliberately not rendered as a health failure:
 * the channel may answer every request perfectly while serving a cheaper model,
 * and the heuristics can produce false positives, so the badge always exposes
 * the underlying evidence instead of just a conclusion.
 */
export function AuthenticityBadge({ item }: { item: ChannelModelItem }) {
  const { t } = useTranslation()

  if (item.verdict !== 'suspect' && item.verdict !== 'trusted') {
    return null
  }

  const suspect = item.verdict === 'suspect'
  const evidence = item.evidence ?? []
  const decisive = evidence.filter((entry) => entry.severity === 'suspect')
  const context = evidence.filter((entry) => entry.severity === 'info')

  return (
    <Popover>
      <PopoverTrigger
        className={
          suspect
            ? 'text-destructive hover:bg-destructive/10 flex shrink-0 items-center gap-1 rounded px-1 text-xs font-medium'
            : 'text-muted-foreground hover:bg-muted flex shrink-0 items-center rounded px-1'
        }
        aria-label={
          suspect ? t('Suspected model mismatch') : t('Model identity verified')
        }
      >
        {suspect ? (
          <>
            <ShieldAlert className='size-3.5' />
            <span className='hidden sm:inline'>{t('Suspect')}</span>
          </>
        ) : (
          <ShieldCheck className='size-3.5' />
        )}
      </PopoverTrigger>
      <PopoverContent className='w-80 text-xs' align='start'>
        <div className='flex flex-col gap-2'>
          <div className='text-sm font-medium'>
            {suspect
              ? t('Suspected model mismatch')
              : t('Model identity verified')}
          </div>

          <div className='text-muted-foreground flex flex-col gap-0.5'>
            <span>
              {t('Requested')}: {item.model}
            </span>
            <span>
              {t('Upstream reported')}: {item.reported_model || '-'}
            </span>
            {item.probed_at > 0 && (
              <span>
                {t('Last probed')}: {formatMonitorTs(item.probed_at)}
              </span>
            )}
          </div>

          {decisive.length > 0 && (
            <div className='flex flex-col gap-1'>
              <span className='text-destructive font-medium'>
                {t('Findings')}
              </span>
              <ul className='text-foreground list-disc pl-4'>
                {decisive.map((entry) => (
                  <li key={entry.signal}>{entry.detail}</li>
                ))}
              </ul>
            </div>
          )}

          {context.length > 0 && (
            <div className='flex flex-col gap-1'>
              <span className='text-muted-foreground font-medium'>
                {t('Other observations')}
              </span>
              <ul className='text-muted-foreground list-disc pl-4'>
                {context.map((entry) => (
                  <li key={entry.signal}>{entry.detail}</li>
                ))}
              </ul>
            </div>
          )}

          {suspect && (
            <p className='text-muted-foreground border-t pt-2'>
              {t(
                'These checks compare vendor families only and can produce false positives. The channel was not disabled automatically.'
              )}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
