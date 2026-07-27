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

import { cn } from '@/lib/utils'

import { MONITOR_DAYS_OPTIONS } from '../constants'

interface MonitorDaysToggleProps {
  value: number
  onChange: (days: number) => void
  disabled?: boolean
}

export function MonitorDaysToggle({
  value,
  onChange,
  disabled,
}: MonitorDaysToggleProps) {
  const { t } = useTranslation()

  return (
    <div className='bg-muted/60 inline-flex h-8 overflow-hidden rounded-lg border p-0.5'>
      {MONITOR_DAYS_OPTIONS.map((d) => (
        <button
          key={d}
          type='button'
          disabled={disabled}
          onClick={() => onChange(d)}
          className={cn(
            'rounded-md px-3 text-xs font-medium transition-colors',
            value === d
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('{{days}} days', { days: d })}
        </button>
      ))}
    </div>
  )
}
