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

import { Plus, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getBannerColorClass,
  PICKABLE_COLORS,
  type SemanticColor,
} from '@/lib/colors'
import {
  DEFAULT_PROMO_BANNER_COLOR,
  parsePromoBannerConfig,
  serializePromoBannerConfig,
} from '@/lib/promo-banner'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type BannerRow = {
  key: string
  text: string
  button_text: string
  button_link: string
  color: SemanticColor
}

let bannerRowSeq = 0
function makeBannerRowKey() {
  bannerRowSeq += 1
  return `banner-${bannerRowSeq}-${Math.random().toString(36).slice(2)}`
}

type PromoBannerSectionProps = {
  defaultValue: string
}

export function PromoBannerSection({ defaultValue }: PromoBannerSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const parsed = useMemo(
    () => parsePromoBannerConfig(defaultValue),
    [defaultValue]
  )

  const [enabled, setEnabled] = useState(parsed.enabled)
  const [rows, setRows] = useState<BannerRow[]>(() =>
    parsed.items.map((item) => ({ key: makeBannerRowKey(), ...item }))
  )

  const updateRow = (key: string, patch: Partial<BannerRow>) =>
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    )
  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        key: makeBannerRowKey(),
        text: '',
        button_text: '',
        button_link: '',
        color: PICKABLE_COLORS[prev.length % PICKABLE_COLORS.length].value,
      },
    ])
  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((row) => row.key !== key))

  const handleSave = () => {
    updateOption.mutate({
      key: 'PromoBannerConfig',
      value: serializePromoBannerConfig({
        enabled,
        items: rows.map((row) => ({
          text: row.text,
          button_text: row.button_text,
          button_link: row.button_link,
          color: row.color ?? DEFAULT_PROMO_BANNER_COLOR,
        })),
      }),
    })
  }

  return (
    <SettingsSection title={t('Promotion Banner')}>
      <SettingsPageFormActions
        onSave={handleSave}
        isSaving={updateOption.isPending}
      />
      <p className='text-muted-foreground text-sm'>
        {t(
          'A strip pinned above the header on every page, for public visitors and signed-in users alike. Add several entries and the strip cycles through them one line at a time, each in its own color. Visitors can close it, and it comes back on the next page load.'
        )}
      </p>

      <SettingsSwitchField
        checked={enabled}
        onCheckedChange={setEnabled}
        label={t('Enabled')}
        className='py-0'
      />

      <div className='flex flex-col gap-3'>
        <div className='flex items-center justify-between'>
          <Label>{t('Banner entries')}</Label>
          <Button variant='outline' size='sm' onClick={addRow}>
            <Plus data-icon='inline-start' />
            {t('Add')}
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className='text-muted-foreground text-xs'>
            {t('No entries yet. Add one to show the strip.')}
          </p>
        ) : (
          <div className='flex flex-col gap-3'>
            {rows.map((row) => (
              <div
                key={row.key}
                className='flex flex-col gap-2 rounded-lg border p-3'
              >
                <div className='flex items-center gap-2'>
                  <Input
                    className='flex-1'
                    value={row.text}
                    onChange={(e) =>
                      updateRow(row.key, { text: e.target.value })
                    }
                    placeholder={t(
                      '🔥 Flexible GPT plans · 0.3x on the first top-up'
                    )}
                  />
                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={() => removeRow(row.key)}
                    aria-label={t('Remove')}
                  >
                    <Trash2 className='size-4' />
                  </Button>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                  <Input
                    className='w-40'
                    value={row.button_text}
                    onChange={(e) =>
                      updateRow(row.key, { button_text: e.target.value })
                    }
                    placeholder={t('Buy now')}
                  />
                  <Input
                    className='min-w-48 flex-1'
                    value={row.button_link}
                    onChange={(e) =>
                      updateRow(row.key, { button_link: e.target.value })
                    }
                    placeholder={t('/pricing')}
                  />
                  <Select
                    items={PICKABLE_COLORS.map((option) => ({
                      value: option.value,
                      label: (
                        <div className='flex items-center gap-2'>
                          <div
                            className={`size-4 rounded-full ${getBannerColorClass(option.value)}`}
                          />
                          {option.label}
                        </div>
                      ),
                    }))}
                    value={row.color}
                    onValueChange={(value) =>
                      updateRow(row.key, { color: value as SemanticColor })
                    }
                  >
                    <SelectTrigger className='w-36'>
                      <SelectValue placeholder={t('Select a color')} />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {PICKABLE_COLORS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className='flex items-center gap-2'>
                              <div
                                className={`size-4 rounded-full ${getBannerColorClass(option.value)}`}
                              />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className='text-muted-foreground text-xs'>
          {t(
            'Each entry stays on screen for 5 seconds. Hovering the strip pauses both the rotation and the scrolling text. A button only shows when both its label and link are filled in; a path such as /pricing stays on this site while a full https:// address opens in a new tab.'
          )}
        </p>
      </div>
    </SettingsSection>
  )
}
