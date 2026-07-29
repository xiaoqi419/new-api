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
import { SwatchBook, Check } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { THEME_PRESETS, type ThemePreset } from '@/lib/theme-customization'
import { cn } from '@/lib/utils'

// Mirrors the multi-hue "default" swatch used by the full preset grid in the
// theme settings drawer, so the header quick-switcher stays visually in sync.
const DEFAULT_PRESET_SWATCH =
  'linear-gradient(135deg, oklch(0.68 0.2 25) 0%, oklch(0.8 0.17 85) 25%, oklch(0.72 0.18 155) 50%, oklch(0.66 0.19 245) 75%, oklch(0.68 0.2 315) 100%)'

export function ThemePresetSwitcher() {
  const { t } = useTranslation()
  const { customization, setPreset } = useThemeCustomization()
  const current = customization.preset

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={<Button variant='ghost' size='icon' className='h-9 w-9' />}
      >
        <SwatchBook className='size-[1.2rem]' />
        <span className='sr-only'>{t('Color preset')}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-44'>
        <DropdownMenuLabel>{t('Color preset')}</DropdownMenuLabel>
        {THEME_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.value}
            onClick={() => setPreset(preset.value as ThemePreset)}
          >
            <span
              aria-hidden='true'
              className='ring-border size-4 shrink-0 rounded-full ring-1'
              style={{
                background:
                  preset.value === 'default'
                    ? DEFAULT_PRESET_SWATCH
                    : `linear-gradient(135deg, ${preset.swatches[0]} 0%, ${preset.swatches[1] ?? preset.swatches[0]} 100%)`,
              }}
            />
            {t(`preset.${preset.value}`)}
            <Check
              size={14}
              className={cn('ms-auto', current !== preset.value && 'hidden')}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
