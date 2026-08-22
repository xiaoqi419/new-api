import { useMemo, useState } from 'react'
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
import { Plus, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  parseLoginPageConfig,
  serializeLoginPageConfig,
} from '@/features/auth/lib/login-page-config'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type StatRow = { key: string; value: string; label: string }

let statRowSeq = 0
function makeStatKey() {
  statRowSeq += 1
  return `stat-${statRowSeq}-${Math.random().toString(36).slice(2)}`
}

type LoginPageSectionProps = {
  defaultValue: string
}

export function LoginPageSection({ defaultValue }: LoginPageSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const parsed = useMemo(
    () => parseLoginPageConfig(defaultValue),
    [defaultValue]
  )

  const [backgroundImage, setBackgroundImage] = useState(
    parsed.background_image ?? ''
  )
  const [title, setTitle] = useState(parsed.title ?? '')
  const [description, setDescription] = useState(parsed.description ?? '')
  const [stats, setStats] = useState<StatRow[]>(() =>
    (parsed.stats ?? []).map((s) => ({ key: makeStatKey(), ...s }))
  )

  const updateStat = (key: string, field: 'value' | 'label', next: string) =>
    setStats((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: next } : row))
    )
  const addStat = () =>
    setStats((prev) => [...prev, { key: makeStatKey(), value: '', label: '' }])
  const removeStat = (key: string) =>
    setStats((prev) => prev.filter((row) => row.key !== key))

  const handleSave = () => {
    updateOption.mutate({
      key: 'LoginPageConfig',
      value: serializeLoginPageConfig({
        background_image: backgroundImage,
        title,
        description,
        stats: stats.map((row) => ({ value: row.value, label: row.label })),
      }),
    })
  }

  return (
    <SettingsSection title={t('Login Page')}>
      <SettingsPageFormActions
        onSave={handleSave}
        isSaving={updateOption.isPending}
      />
      <p className='text-muted-foreground text-sm'>
        {t(
          'Customize the branding panel shown next to the sign-in and sign-up forms.'
        )}
      </p>

      <div className='flex flex-col gap-2'>
        <Label>{t('Background image URL')}</Label>
        <Input
          value={backgroundImage}
          onChange={(e) => setBackgroundImage(e.target.value)}
          placeholder={t('https://example.com/login-bg.jpg')}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Shown on the left panel of the sign-in page. Leave empty to use a solid gradient.'
          )}
        </p>
        {backgroundImage && (
          <div className='mt-1 h-32 w-full max-w-md overflow-hidden rounded-lg border'>
            <img
              src={backgroundImage}
              alt=''
              className='h-full w-full object-cover'
            />
          </div>
        )}
      </div>

      <div className='flex flex-col gap-2'>
        <Label>{t('Title')}</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('Leave empty to use the system name')}
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label>{t('Description')}</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('A short tagline shown under the title')}
        />
      </div>

      <div className='flex flex-col gap-3'>
        <div className='flex items-center justify-between'>
          <Label>{t('Statistics')}</Label>
          <Button variant='outline' size='sm' onClick={addStat}>
            <Plus data-icon='inline-start' />
            {t('Add')}
          </Button>
        </div>
        {stats.length === 0 ? (
          <p className='text-muted-foreground text-xs'>
            {t('No statistics yet. Add one to show it on the sign-in page.')}
          </p>
        ) : (
          <div className='flex flex-col gap-2'>
            {stats.map((row) => (
              <div key={row.key} className='flex items-center gap-2'>
                <Input
                  className='w-32'
                  value={row.value}
                  onChange={(e) => updateStat(row.key, 'value', e.target.value)}
                  placeholder={t('Value (e.g. 99.9%)')}
                />
                <Input
                  className='flex-1'
                  value={row.label}
                  onChange={(e) => updateStat(row.key, 'label', e.target.value)}
                  placeholder={t('Label (e.g. Uptime)')}
                />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => removeStat(row.key)}
                  aria-label={t('Remove')}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
