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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Ban, Search, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { NAV_ICON_NAMES, resolveNavIcon } from '@/lib/nav-icons'
import { cn } from '@/lib/utils'

type NavIconPickerProps = {
  value?: string
  /** Called with the chosen icon name, or an empty string to clear. */
  onChange: (name: string) => void
  label?: string
}

export function NavIconPicker({ value, onChange, label }: NavIconPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const Current = resolveNavIcon(value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return NAV_ICON_NAMES
    return NAV_ICON_NAMES.filter((name) => name.toLowerCase().includes(q))
  }, [query])

  const select = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='size-9 shrink-0'
            aria-label={label ?? t('Choose an icon')}
          >
            {Current ? (
              <Current className='size-4' />
            ) : (
              <Ban className='text-muted-foreground size-4' />
            )}
          </Button>
        }
      />
      <PopoverContent align='start' className='w-72 p-2'>
        <div className='relative mb-2'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2' />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search icons')}
            className='h-8 pl-8'
          />
        </div>

        <button
          type='button'
          onClick={() => select('')}
          className={cn(
            'hover:bg-accent mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
            !value && 'bg-accent'
          )}
        >
          <X className='size-4' />
          {t('No icon')}
        </button>

        <div className='grid max-h-64 grid-cols-6 gap-1 overflow-y-auto'>
          {filtered.map((name) => {
            const Icon = resolveNavIcon(name)
            if (!Icon) return null
            return (
              <button
                key={name}
                type='button'
                title={name}
                aria-label={name}
                onClick={() => select(name)}
                className={cn(
                  'hover:bg-accent flex size-9 items-center justify-center rounded-md transition-colors',
                  value === name && 'bg-accent text-primary'
                )}
              >
                <Icon className='size-4' />
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className='text-muted-foreground col-span-6 py-6 text-center text-xs'>
              {t('No results')}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
