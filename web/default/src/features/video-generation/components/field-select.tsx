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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { SelectOption } from '../types'

interface FieldSelectProps {
  value: string
  items: SelectOption[]
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function FieldSelect(props: FieldSelectProps) {
  const currentLabel =
    props.items.find((i) => i.value === props.value)?.label ?? props.value

  return (
    <Select
      items={props.items}
      value={props.value}
      onValueChange={(v) => v && props.onValueChange(v)}
    >
      <SelectTrigger className={props.className ?? 'w-full'}>
        <SelectValue placeholder={props.placeholder}>
          {currentLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {props.items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
