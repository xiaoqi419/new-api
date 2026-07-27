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
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

import type { RefMediaType, SelectOption } from '../types'
import { AssetUrlInput } from './asset-url-input'

interface ReferenceMediaEditorProps {
  label: string
  list: string[]
  onChange: (list: string[]) => void
  max: number
  type: RefMediaType
  assetOptions: SelectOption[]
}

export function ReferenceMediaEditor(props: ReferenceMediaEditorProps) {
  const { t } = useTranslation()

  const setAt = (index: number, value: string) => {
    props.onChange(props.list.map((x, i) => (i === index ? value : x)))
  }
  const removeAt = (index: number) => {
    props.onChange(props.list.filter((_, i) => i !== index))
  }

  const placeholder =
    props.type === 'image' ? t('https:// or asset://') : t('Public URL')

  return (
    <div className='flex w-full flex-col gap-2'>
      <Label>{`${props.label} (${props.list.length}/${props.max})`}</Label>
      {props.list.map((url, i) => (
        // Rows are positional free-text editors; index is the stable identity.
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className='flex items-center gap-2'>
          {props.type === 'image' ? (
            <div className='flex-1'>
              <AssetUrlInput
                value={url}
                onChange={(v) => setAt(i, v)}
                placeholder={placeholder}
                assetOptions={props.assetOptions}
              />
            </div>
          ) : (
            <input
              value={url}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={placeholder}
              className='border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 flex-1 rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3'
            />
          )}
          <Button
            variant='ghost'
            size='icon'
            className='text-destructive shrink-0'
            onClick={() => removeAt(i)}
          >
            <X className='size-4' />
          </Button>
        </div>
      ))}
      {props.list.length < props.max && (
        <Button
          variant='outline'
          size='sm'
          className='self-start'
          onClick={() => props.onChange([...props.list, ''])}
        >
          <Plus className='mr-1 size-3.5' />
          {t('Add')}
        </Button>
      )}
    </div>
  )
}
