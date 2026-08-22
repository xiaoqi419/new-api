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
import { Textarea } from '@/components/ui/textarea'

/** Labeled single-line or multi-line text field used across home editors. */
export function TextField(props: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  textarea?: boolean
  rows?: number
  mono?: boolean
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <Label className='text-xs'>{props.label}</Label>
      {props.textarea ? (
        <Textarea
          rows={props.rows ?? 3}
          value={props.value}
          placeholder={props.placeholder}
          className={props.mono ? 'font-mono text-xs' : undefined}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <Input
          value={props.value}
          placeholder={props.placeholder}
          className={props.mono ? 'font-mono text-xs' : undefined}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </div>
  )
}
