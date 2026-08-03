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

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  parsePromoBannerConfig,
  serializePromoBannerConfig,
} from '@/lib/promo-banner'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

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
  const [text, setText] = useState(parsed.text)
  const [buttonText, setButtonText] = useState(parsed.button_text)
  const [buttonLink, setButtonLink] = useState(parsed.button_link)

  const handleSave = () => {
    updateOption.mutate({
      key: 'PromoBannerConfig',
      value: serializePromoBannerConfig({
        enabled,
        text,
        button_text: buttonText,
        button_link: buttonLink,
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
          'A single scrolling strip pinned above the header on every page, for public visitors and signed-in users alike. Visitors can close it, and it comes back on the next page load.'
        )}
      </p>

      <SettingsSwitchField
        checked={enabled}
        onCheckedChange={setEnabled}
        label={t('Enabled')}
        className='py-0'
      />

      <div className='flex flex-col gap-2'>
        <Label>{t('Banner text')}</Label>
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t(
            '🔥 Flexible GPT plans · 0.3x on the first top-up · 0.5x all day'
          )}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Written as one line. Emoji are allowed, and a separator such as · keeps several offers readable while scrolling.'
          )}
        </p>
      </div>

      <div className='flex flex-col gap-2'>
        <Label>{t('Button label')}</Label>
        <Input
          value={buttonText}
          onChange={(e) => setButtonText(e.target.value)}
          placeholder={t('Buy now')}
        />
        <p className='text-muted-foreground text-xs'>
          {t('The button is hidden unless both a label and a link are set.')}
        </p>
      </div>

      <div className='flex flex-col gap-2'>
        <Label>{t('Button link')}</Label>
        <Input
          value={buttonLink}
          onChange={(e) => setButtonLink(e.target.value)}
          placeholder={t('/pricing')}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'A path such as /pricing stays on this site. A full https:// address opens in a new tab.'
          )}
        </p>
      </div>
    </SettingsSection>
  )
}
