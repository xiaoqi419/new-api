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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'
import { cn } from '@/lib/utils'

interface CurrencyQuotaFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  className?: string
  inputClassName?: string
}

/**
 * Amount input that behaves like the user-management wallet dialog: the admin
 * types in the site display currency (USD/CNY/tokens) while the stored value
 * stays in raw quota units. Shows a live converted preview below the field.
 */
export function CurrencyQuotaField(props: CurrencyQuotaFieldProps) {
  const currencyLabel = getCurrencyLabel()
  const { meta } = getCurrencyDisplay()
  const tokensOnly = meta.kind === 'tokens'
  const quota = parseQuotaFromDollars(Number(props.value) || 0)

  return (
    <div className={cn('flex flex-col gap-1', props.className)}>
      <Label htmlFor={props.id} className='text-xs'>
        {props.label} ({currencyLabel})
      </Label>
      <Input
        id={props.id}
        type='number'
        min={0}
        step={tokensOnly ? 1 : 0.000001}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className={props.inputClassName}
      />
      <span className='text-muted-foreground text-[11px]'>
        = {formatQuota(quota)}
      </span>
    </div>
  )
}
