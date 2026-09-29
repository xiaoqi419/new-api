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
import { cn } from '@/lib/utils'

import type { PelicanSlot } from './api'
import { formatSlotLabel } from './format'

function getSlotColor(status: string) {
  if (status === 'pass') return 'bg-emerald-500 hover:bg-emerald-400'
  if (status === 'fail') return 'bg-rose-500 hover:bg-rose-400'
  if (status === 'error') return 'bg-amber-400 hover:bg-amber-300'
  if (status === 'running') return 'bg-blue-500 animate-pulse hover:bg-blue-400'
  return 'bg-neutral-200 dark:bg-neutral-800'
}

export function ProbeBlocks(props: {
  slots: PelicanSlot[]
  locale?: string
  labelFor: (status: string) => string
  selectedId?: number | null
  onOpen: (id: number) => void
}) {
  const first = props.slots[0]?.start ?? 0

  return (
    <div className='w-full'>
      <div className='flex h-5 w-full items-stretch gap-px rounded-[3px] bg-muted/30 p-[1px]'>
        {props.slots.map((slot) => {
          const isSelected = slot.id != null && slot.id === props.selectedId
          const baseColor = getSlotColor(slot.status)
          const timeLabel = formatSlotLabel(slot.start, props.locale)
          const tooltip = `${props.labelFor(slot.status)} · ${timeLabel}`

          if (!slot.id) {
            return (
              <span
                key={slot.start}
                title={tooltip}
                className={cn('h-full min-w-0 flex-1 rounded-[1.5px] transition-colors', baseColor)}
              />
            )
          }

          return (
            <button
              key={slot.start}
              type='button'
              title={tooltip}
              aria-pressed={isSelected}
              aria-label={tooltip}
              onClick={() => props.onOpen(slot.id ?? 0)}
              className={cn(
                'h-full min-w-0 flex-1 rounded-[1.5px] border-0 p-0 transition-transform duration-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:z-20',
                baseColor,
                isSelected
                  ? 'z-10 scale-y-125 ring-2 ring-sky-500 ring-offset-1 ring-offset-background'
                  : 'hover:scale-y-125 hover:z-10'
              )}
            />
          )
        })}
      </div>
      <div className='mt-1 flex items-center justify-between text-[11px] text-muted-foreground/80 tabular-nums'>
        <span>{formatSlotLabel(first, props.locale)}</span>
        <span>{props.labelFor('now')}</span>
      </div>
    </div>
  )
}
