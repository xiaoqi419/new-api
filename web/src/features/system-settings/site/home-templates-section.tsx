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
import { ExternalLink, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  mergeClassicContent,
  mergeCliContent,
} from '@/features/home/templates/defaults'
import {
  DEFAULT_TEMPLATE_ID,
  getTemplateDefaultContent,
  HOME_TEMPLATES,
} from '@/features/home/templates/registry'
import type {
  ClassicLandingContent,
  CliQuickstartContent,
  HomePageConfig,
  TemplateContent,
} from '@/features/home/types'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { ClassicContentEditor } from './home-editor/classic-content-editor'
import { CliContentEditor } from './home-editor/cli-content-editor'

const CLI_TEMPLATE_ID = 'cli-quickstart'

function parseConfig(raw: string): HomePageConfig {
  if (!raw || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as HomePageConfig
  } catch {
    // Ignore malformed stored config.
  }
  return {}
}

function mergeTemplateContent(
  id: string,
  def: TemplateContent,
  stored: unknown
): TemplateContent {
  if (id === CLI_TEMPLATE_ID) {
    return mergeCliContent(
      def as CliQuickstartContent,
      stored as Partial<CliQuickstartContent> | undefined
    )
  }
  return mergeClassicContent(
    def as ClassicLandingContent,
    stored as Partial<ClassicLandingContent> | undefined
  )
}

type HomeTemplatesSectionProps = {
  defaultValue: string
}

export function HomeTemplatesSection({
  defaultValue,
}: HomeTemplatesSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const parsed = useMemo(() => parseConfig(defaultValue), [defaultValue])

  const [activeTemplate, setActiveTemplate] = useState(
    parsed.active_template ?? DEFAULT_TEMPLATE_ID
  )
  const [drafts, setDrafts] = useState<Record<string, TemplateContent>>(() => {
    const out: Record<string, TemplateContent> = {}
    for (const tpl of HOME_TEMPLATES) {
      out[tpl.id] = mergeTemplateContent(
        tpl.id,
        getTemplateDefaultContent(tpl.id, t),
        parsed.templates?.[tpl.id]
      )
    }
    return out
  })

  const setDraft = (id: string, content: TemplateContent) =>
    setDrafts((d) => ({ ...d, [id]: content }))

  const handleSave = () => {
    const config: HomePageConfig = {
      active_template: activeTemplate,
      templates: { ...parsed.templates, ...drafts },
    }
    updateOption.mutate({
      key: 'HomePageConfig',
      value: JSON.stringify(config),
    })
  }

  return (
    <SettingsSection title={t('Home Page Management')}>
      <SettingsPageFormActions
        onSave={handleSave}
        isSaving={updateOption.isPending}
      />
      <p className='text-muted-foreground text-sm'>
        {t(
          'Choose the active homepage template and edit its content. Leave a field blank to fall back to the built-in default. Note: a custom HTML/URL set in System Information still takes precedence over templates.'
        )}
      </p>

      {/* Template selector */}
      <div className='flex flex-col gap-2'>
        <Label className='text-xs'>{t('Templates')}</Label>
        <div className='grid gap-3 sm:grid-cols-2'>
          {HOME_TEMPLATES.map((tpl) => (
            <Card
              key={tpl.id}
              className={`shadow-none ${tpl.id === activeTemplate ? 'border-primary' : ''}`}
            >
              <CardHeader className='flex flex-row items-start justify-between gap-2'>
                <div className='flex min-w-0 flex-col gap-1'>
                  <CardTitle className='flex items-center gap-2 text-sm'>
                    <span className='truncate'>{t(tpl.nameKey)}</span>
                    {tpl.id === activeTemplate && (
                      <StatusBadge
                        label={t('Active')}
                        variant='success'
                        copyable={false}
                      />
                    )}
                  </CardTitle>
                  <span className='text-muted-foreground text-xs'>
                    {t(tpl.descriptionKey)}
                  </span>
                </div>
                {tpl.id !== activeTemplate && (
                  <Button
                    variant='outline'
                    size='sm'
                    className='shrink-0'
                    onClick={() => setActiveTemplate(tpl.id)}
                  >
                    {t('Set active')}
                  </Button>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
        <a
          href='/'
          target='_blank'
          rel='noreferrer'
          className='text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-xs'
        >
          <ExternalLink className='size-3.5' />
          {t('Preview home page')}
        </a>
      </div>

      {/* Active template content editor */}
      {activeTemplate === CLI_TEMPLATE_ID ? (
        <CliContentEditor
          key={activeTemplate}
          value={drafts[activeTemplate] as CliQuickstartContent}
          onChange={(c) => setDraft(activeTemplate, c)}
        />
      ) : (
        <ClassicContentEditor
          key={activeTemplate}
          value={drafts[activeTemplate] as ClassicLandingContent}
          onChange={(c) => setDraft(activeTemplate, c)}
        />
      )}

      {/* Reset */}
      <div className='border-t pt-4'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() =>
            setDraft(
              activeTemplate,
              getTemplateDefaultContent(activeTemplate, t)
            )
          }
        >
          <RotateCcw data-icon='inline-start' />
          <span>{t('Reset to default content')}</span>
        </Button>
      </div>
    </SettingsSection>
  )
}
