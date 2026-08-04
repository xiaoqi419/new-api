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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AlertCircle, Check } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  BANNER_GRADIENTS,
  BANNER_PRESET_COLORS,
  findBannerGradient,
  GRADIENT_PREFIX,
  isHexColor,
  MIN_TEXT_CONTRAST,
  normalizeBannerFill,
  normalizeHex,
  resolveBannerFill,
} from '@/lib/banner-fill'

type BannerFillPickerProps = {
  value: string
  onChange: (value: string) => void
}

export function BannerFillPicker({ value, onChange }: BannerFillPickerProps) {
  const { t } = useTranslation()
  const fill = normalizeBannerFill(value)
  const resolved = resolveBannerFill(fill)
  const activeGradient = findBannerGradient(fill)
  const isGradient = !!activeGradient

  // Kept separate from the committed value so a half-typed "#1a" does not reset
  // the swatch on every keystroke.
  const [draftHex, setDraftHex] = useState(isGradient ? '' : fill)
  useEffect(() => {
    if (!isGradient) setDraftHex(fill)
  }, [fill, isGradient])

  const commitHex = (next: string) => {
    setDraftHex(next)
    if (isHexColor(next)) onChange(normalizeHex(next))
  }

  const activeLabel = activeGradient ? t(activeGradient.label) : fill

  return (
    <Popover>
      <PopoverTrigger
        className='flex h-9 w-36 shrink-0 items-center gap-2 rounded-md border px-2 text-sm'
        aria-label={t('Background')}
      >
        <span
          className='size-4 shrink-0 rounded-full border'
          style={{ background: resolved.background }}
        />
        <span className='truncate'>{activeLabel}</span>
      </PopoverTrigger>

      <PopoverContent className='w-72 space-y-4'>
        <div className='space-y-2'>
          <Label className='text-xs'>{t('Presets')}</Label>
          <div className='grid grid-cols-7 gap-1.5'>
            {BANNER_PRESET_COLORS.map((preset) => (
              <button
                key={preset.value}
                type='button'
                title={preset.label}
                aria-label={preset.label}
                onClick={() => onChange(preset.value)}
                className='relative flex size-7 items-center justify-center rounded-full border transition-transform hover:scale-110'
                style={{ background: preset.value }}
              >
                {fill === preset.value ? (
                  <Check className='size-3.5 text-white' />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className='space-y-2'>
          <Label className='text-xs'>{t('Gradients')}</Label>
          <div className='grid grid-cols-4 gap-1.5'>
            {BANNER_GRADIENTS.map((gradient) => {
              const id = `${GRADIENT_PREFIX}${gradient.id}`
              return (
                <button
                  key={gradient.id}
                  type='button'
                  title={t(gradient.label)}
                  aria-label={t(gradient.label)}
                  onClick={() => onChange(id)}
                  className='relative flex h-7 items-center justify-center rounded-md border transition-transform hover:scale-105'
                  style={{
                    background: `linear-gradient(90deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
                  }}
                >
                  {fill === id ? (
                    <Check className='size-3.5 text-white' />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className='space-y-2'>
          <Label className='text-xs'>{t('Custom color')}</Label>
          <div className='flex items-center gap-2'>
            <input
              type='color'
              aria-label={t('Custom color')}
              value={isHexColor(draftHex) ? normalizeHex(draftHex) : '#155dfc'}
              onChange={(e) => commitHex(e.target.value)}
              className='size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5'
            />
            <Input
              value={draftHex}
              onChange={(e) => commitHex(e.target.value)}
              placeholder='#155dfc'
              spellCheck={false}
              className='font-mono'
            />
          </div>
        </div>

        {resolved.contrast < MIN_TEXT_CONTRAST ? (
          <p className='text-destructive flex items-start gap-1.5 text-xs'>
            <AlertCircle className='mt-0.5 size-3.5 shrink-0' />
            {t(
              'This background is hard to read text on. Pick something darker or lighter.'
            )}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
