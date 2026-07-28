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
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type {
  CommunityLinkAction,
  CommunityLinkType,
} from '@/features/community'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type AdminCommunityEntry = {
  id: string
  type: CommunityLinkType
  label: string
  value: string
  action: CommunityLinkAction
  qrImageUrl: string
  enabled: boolean
}

const TYPE_OPTIONS: CommunityLinkType[] = [
  'qq',
  'wechat',
  'telegram',
  'discord',
  'custom',
]

function newId(): string {
  const fromCrypto = globalThis.crypto?.randomUUID?.()
  return fromCrypto ?? `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

function parseAdminEntries(raw: string): AdminCommunityEntry[] {
  if (!raw || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map((item) => {
    const record = (item ?? {}) as Record<string, unknown>
    const type = record.type
    return {
      id: newId(),
      type: TYPE_OPTIONS.includes(type as CommunityLinkType)
        ? (type as CommunityLinkType)
        : 'custom',
      label: typeof record.label === 'string' ? record.label : '',
      value: typeof record.value === 'string' ? record.value : '',
      action: record.action === 'link' ? 'link' : 'copy',
      qrImageUrl: typeof record.qrImageUrl === 'string' ? record.qrImageUrl : '',
      enabled: record.enabled !== false,
    }
  })
}

function serializeAdminEntries(entries: AdminCommunityEntry[]): string {
  const cleaned = entries
    .map((entry) => ({
      type: entry.type,
      label: entry.label.trim(),
      value: entry.value.trim(),
      action: entry.action,
      qrImageUrl: entry.qrImageUrl.trim() || undefined,
      enabled: entry.enabled,
    }))
    .filter(
      (entry) =>
        entry.label !== '' || entry.value !== '' || entry.qrImageUrl !== undefined
    )
  if (cleaned.length === 0) return ''
  return JSON.stringify(cleaned)
}

const selectClassName =
  'border-input bg-transparent focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none'

type CommunityLinksSectionProps = {
  defaultValue: string
}

export function CommunityLinksSection({
  defaultValue,
}: CommunityLinksSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const initialEntries = useMemo(
    () => parseAdminEntries(defaultValue),
    [defaultValue]
  )
  const [entries, setEntries] = useState<AdminCommunityEntry[]>(initialEntries)

  useEffect(() => {
    setEntries(initialEntries)
  }, [initialEntries])

  const typeLabels: Record<CommunityLinkType, string> = {
    qq: t('QQ Group'),
    wechat: t('WeChat'),
    telegram: t('Telegram'),
    discord: t('Discord'),
    custom: t('Custom'),
  }

  const updateEntry = (id: string, patch: Partial<AdminCommunityEntry>) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    )
  }

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id))
  }

  const moveEntry = (index: number, direction: -1 | 1) => {
    setEntries((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const addEntry = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: newId(),
        type: 'qq',
        label: '',
        value: '',
        action: 'copy',
        qrImageUrl: '',
        enabled: true,
      },
    ])
  }

  const onSave = async () => {
    await updateOption.mutateAsync({
      key: 'CommunityLinks',
      value: serializeAdminEntries(entries),
    })
  }

  const resetToInitial = () => setEntries(initialEntries)

  return (
    <SettingsSection title={t('Official Community')}>
      <SettingsPageFormActions
        onSave={onSave}
        onReset={resetToInitial}
        isSaving={updateOption.isPending}
        resetLabel='Reset'
        saveLabel='Save community links'
      />

      <p className='text-muted-foreground text-sm'>
        {t(
          'Configure the entries shown in the Official Community dropdown in the header. Each entry can be copied, opened as a link, or shown as a QR code.'
        )}
      </p>

      <div className='flex flex-col gap-4'>
        {entries.length === 0 && (
          <div className='text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm'>
            {t('No community entries yet. Add one to get started.')}
          </div>
        )}

        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className={cn(
              'flex flex-col gap-3 rounded-lg border p-4',
              !entry.enabled && 'opacity-60'
            )}
          >
            <div className='flex flex-wrap items-center gap-2'>
              <select
                className={cn(selectClassName, 'w-auto min-w-32')}
                value={entry.type}
                onChange={(e) =>
                  updateEntry(entry.id, {
                    type: e.target.value as CommunityLinkType,
                  })
                }
              >
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type]}
                  </option>
                ))}
              </select>

              <div className='ms-auto flex items-center gap-2'>
                <div className='flex items-center gap-2'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Enabled')}
                  </span>
                  <Switch
                    checked={entry.enabled}
                    onCheckedChange={(checked) =>
                      updateEntry(entry.id, { enabled: checked })
                    }
                  />
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  disabled={index === 0}
                  onClick={() => moveEntry(index, -1)}
                  aria-label={t('Move up')}
                >
                  <ArrowUp className='size-4' />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  disabled={index === entries.length - 1}
                  onClick={() => moveEntry(index, 1)}
                  aria-label={t('Move down')}
                >
                  <ArrowDown className='size-4' />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='text-destructive size-8'
                  onClick={() => removeEntry(entry.id)}
                  aria-label={t('Delete')}
                >
                  <Trash2 className='size-4' />
                </Button>
              </div>
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              <div className='flex flex-col gap-1.5'>
                <Label>{t('Label')}</Label>
                <Input
                  value={entry.label}
                  placeholder={t('e.g. QQ Group')}
                  onChange={(e) =>
                    updateEntry(entry.id, { label: e.target.value })
                  }
                />
              </div>
              <div className='flex flex-col gap-1.5'>
                <Label>{t('Action')}</Label>
                <select
                  className={selectClassName}
                  value={entry.action}
                  onChange={(e) =>
                    updateEntry(entry.id, {
                      action: e.target.value as CommunityLinkAction,
                    })
                  }
                >
                  <option value='copy'>{t('Copy the value')}</option>
                  <option value='link'>{t('Open as link')}</option>
                </select>
              </div>
            </div>

            <div className='flex flex-col gap-1.5'>
              <Label>
                {entry.action === 'link'
                  ? t('Link URL')
                  : t('Value (e.g. group number)')}
              </Label>
              <Input
                value={entry.value}
                placeholder={
                  entry.action === 'link'
                    ? 'https://t.me/your_group'
                    : '123456789'
                }
                onChange={(e) =>
                  updateEntry(entry.id, { value: e.target.value })
                }
              />
            </div>

            <div className='flex flex-col gap-1.5'>
              <Label>{t('QR code image URL (optional)')}</Label>
              <Input
                value={entry.qrImageUrl}
                placeholder='https://example.com/qr.png'
                onChange={(e) =>
                  updateEntry(entry.id, { qrImageUrl: e.target.value })
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'If provided, this image is shown as the QR code. Otherwise a QR code is generated from the link URL.'
                )}
              </p>
            </div>
          </div>
        ))}

        <div>
          <Button type='button' variant='outline' onClick={addEntry}>
            <Plus className='size-4' />
            {t('Add community entry')}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
