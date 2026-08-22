import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { Plus, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  CliCodeStep,
  CliQuickstartContent,
  CliRoadmapItem,
  CliRoadmapStatus,
  CliToolCard,
} from '@/features/home/types'

import { uid, type WithId } from './ids'
import { TextField } from './shared'

const LANGUAGES = ['bash', 'json', 'toml', 'ini', 'yaml', 'dotenv', 'plaintext']
const STATUSES: CliRoadmapStatus[] = ['done', 'in-progress', 'planned']
const ICON_OPTIONS = ['claude', 'openai', 'gemini', 'generic']
const ICON_LABELS: Record<string, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
}

type EditorTool = Omit<CliToolCard, 'steps'> & {
  _id: string
  steps: WithId<CliCodeStep>[]
}
type CliEditorContent = {
  hero: CliQuickstartContent['hero']
  tools: EditorTool[]
  roadmap: Omit<CliQuickstartContent['roadmap'], 'items'> & {
    items: WithId<CliRoadmapItem>[]
  }
}

function toEditor(c: CliQuickstartContent): CliEditorContent {
  return {
    hero: c.hero,
    tools: c.tools.map((tool) => ({
      ...tool,
      _id: uid(),
      steps: tool.steps.map((s) => ({ ...s, _id: uid() })),
    })),
    roadmap: {
      ...c.roadmap,
      items: c.roadmap.items.map((it) => ({ ...it, _id: uid() })),
    },
  }
}

function fromEditor(e: CliEditorContent): CliQuickstartContent {
  return {
    hero: e.hero,
    tools: e.tools.map((tool) => ({
      icon: tool.icon,
      badge: tool.badge,
      name: tool.name,
      description: tool.description,
      tags: tool.tags,
      steps: tool.steps.map((s) => ({
        filename: s.filename,
        language: s.language,
        code: s.code,
      })),
    })),
    roadmap: {
      badge: e.roadmap.badge,
      heading: e.roadmap.heading,
      subtitle: e.roadmap.subtitle,
      items: e.roadmap.items.map((it) => ({
        title: it.title,
        description: it.description,
        status: it.status,
      })),
    },
  }
}

type CliContentEditorProps = {
  value: CliQuickstartContent
  onChange: (content: CliQuickstartContent) => void
}

export function CliContentEditor({ value, onChange }: CliContentEditorProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState<CliEditorContent>(() =>
    toEditor(value)
  )

  const emit = (next: CliEditorContent) => {
    setContent(next)
    onChange(fromEditor(next))
  }

  const setHero = (patch: Partial<CliQuickstartContent['hero']>) =>
    emit({ ...content, hero: { ...content.hero, ...patch } })
  const setRoadmap = (
    patch: Partial<Omit<CliQuickstartContent['roadmap'], 'items'>>
  ) => emit({ ...content, roadmap: { ...content.roadmap, ...patch } })

  const updateTool = (ti: number, patch: Partial<Omit<CliToolCard, 'steps'>>) =>
    emit({
      ...content,
      tools: content.tools.map((tool, i) =>
        i === ti ? { ...tool, ...patch } : tool
      ),
    })
  const removeTool = (ti: number) =>
    emit({ ...content, tools: content.tools.filter((_, i) => i !== ti) })
  const addTool = () =>
    emit({
      ...content,
      tools: [
        ...content.tools,
        {
          _id: uid(),
          icon: 'generic',
          badge: '',
          name: '',
          description: '',
          tags: [],
          steps: [],
        },
      ],
    })

  const updateStep = (ti: number, si: number, patch: Partial<CliCodeStep>) =>
    emit({
      ...content,
      tools: content.tools.map((tool, i) =>
        i === ti
          ? {
              ...tool,
              steps: tool.steps.map((s, j) =>
                j === si ? { ...s, ...patch } : s
              ),
            }
          : tool
      ),
    })
  const removeStep = (ti: number, si: number) =>
    emit({
      ...content,
      tools: content.tools.map((tool, i) =>
        i === ti
          ? { ...tool, steps: tool.steps.filter((_, j) => j !== si) }
          : tool
      ),
    })
  const addStep = (ti: number) =>
    emit({
      ...content,
      tools: content.tools.map((tool, i) =>
        i === ti
          ? {
              ...tool,
              steps: [
                ...tool.steps,
                { _id: uid(), filename: '', language: 'bash', code: '' },
              ],
            }
          : tool
      ),
    })

  const updateItem = (ri: number, patch: Partial<CliRoadmapItem>) =>
    emit({
      ...content,
      roadmap: {
        ...content.roadmap,
        items: content.roadmap.items.map((it, i) =>
          i === ri ? { ...it, ...patch } : it
        ),
      },
    })
  const removeItem = (ri: number) =>
    emit({
      ...content,
      roadmap: {
        ...content.roadmap,
        items: content.roadmap.items.filter((_, i) => i !== ri),
      },
    })
  const addItem = () =>
    emit({
      ...content,
      roadmap: {
        ...content.roadmap,
        items: [
          ...content.roadmap.items,
          { _id: uid(), title: '', description: '', status: 'planned' },
        ],
      },
    })

  const statusLabels: Record<CliRoadmapStatus, string> = {
    done: t('Completed'),
    'in-progress': t('In Progress'),
    planned: t('Planned'),
  }
  const statusLabel = (status: CliRoadmapStatus) => statusLabels[status]

  return (
    <>
      {/* Hero */}
      <div className='flex flex-col gap-4 border-t pt-4'>
        <h4 className='text-sm font-semibold'>{t('Hero Section')}</h4>
        <div className='grid gap-4 sm:grid-cols-2'>
          <TextField
            label={t('Badge')}
            value={content.hero.badge}
            onChange={(v) => setHero({ badge: v })}
          />
          <TextField
            label={t('Title')}
            value={content.hero.title}
            onChange={(v) => setHero({ title: v })}
          />
        </div>
        <TextField
          label={t('Subtitle')}
          value={content.hero.subtitle}
          onChange={(v) => setHero({ subtitle: v })}
        />
        <TextField
          label={t('Description')}
          value={content.hero.description}
          onChange={(v) => setHero({ description: v })}
          textarea
        />
        <div className='sm:w-1/2'>
          <TextField
            label={t('Get Started')}
            value={content.hero.ctaLabel}
            onChange={(v) => setHero({ ctaLabel: v })}
          />
        </div>
      </div>

      {/* Tools */}
      <div className='flex flex-col gap-3 border-t pt-4'>
        <h4 className='text-sm font-semibold'>{t('CLI Tools')}</h4>
        {content.tools.map((tool, ti) => (
          <div
            key={tool._id}
            className='bg-muted/20 flex flex-col gap-3 rounded-md border p-3'
          >
            <div className='flex items-start justify-between gap-2'>
              <span className='text-muted-foreground text-xs font-semibold'>
                {tool.name || t('New tool')}
              </span>
              <Button
                variant='ghost'
                size='sm'
                className='text-destructive h-8 w-8 shrink-0 p-0'
                onClick={() => removeTool(ti)}
                aria-label={t('Delete')}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <TextField
                label={t('Name')}
                value={tool.name}
                onChange={(v) => updateTool(ti, { name: v })}
              />
              <TextField
                label={t('Badge')}
                value={tool.badge}
                onChange={(v) => updateTool(ti, { badge: v })}
              />
            </div>
            <TextField
              label={t('Description')}
              value={tool.description}
              onChange={(v) => updateTool(ti, { description: v })}
              textarea
            />
            <TextField
              label={t('Tags (comma separated)')}
              value={tool.tags.join(', ')}
              onChange={(v) =>
                updateTool(ti, {
                  tags: v
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder='Node.js, npm'
            />
            <div className='w-[160px]'>
              <Label className='text-xs'>{t('Icon')}</Label>
              <Select
                value={tool.icon || 'generic'}
                onValueChange={(v) => {
                  if (typeof v === 'string') {
                    updateTool(ti, { icon: v })
                  }
                }}
              >
                <SelectTrigger className='mt-1.5'>
                  <SelectValue placeholder={t('Icon')} />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {ICON_OPTIONS.map((ic) => (
                      <SelectItem key={ic} value={ic}>
                        {ICON_LABELS[ic] ?? t('Generic')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {/* Steps */}
            <div className='flex flex-col gap-2'>
              <Label className='text-xs'>{t('Code steps')}</Label>
              {tool.steps.map((step, si) => (
                <div
                  key={step._id}
                  className='bg-background flex flex-col gap-2 rounded-md border p-2'
                >
                  <div className='flex flex-wrap items-end gap-2'>
                    <div className='min-w-[160px] flex-1'>
                      <TextField
                        label={t('File path or label')}
                        value={step.filename}
                        onChange={(v) => updateStep(ti, si, { filename: v })}
                        placeholder='~/.config/app.json'
                      />
                    </div>
                    <div className='w-[130px]'>
                      <Label className='text-xs'>{t('Language')}</Label>
                      <Select
                        value={step.language}
                        onValueChange={(v) => {
                          if (typeof v === 'string') {
                            updateStep(ti, si, { language: v })
                          }
                        }}
                      >
                        <SelectTrigger className='mt-1.5'>
                          <SelectValue placeholder={t('Language')} />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {LANGUAGES.map((lang) => (
                              <SelectItem key={lang} value={lang}>
                                {lang}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-destructive h-9 w-9 shrink-0 p-0'
                      onClick={() => removeStep(ti, si)}
                      aria-label={t('Delete')}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                  <TextField
                    label={t('Code')}
                    value={step.code}
                    onChange={(v) => updateStep(ti, si, { code: v })}
                    textarea
                    rows={4}
                    mono
                  />
                </div>
              ))}
              <div>
                <Button variant='outline' size='sm' onClick={() => addStep(ti)}>
                  <Plus data-icon='inline-start' />
                  <span>{t('Add code step')}</span>
                </Button>
              </div>
            </div>
          </div>
        ))}
        <div>
          <Button variant='outline' size='sm' onClick={addTool}>
            <Plus data-icon='inline-start' />
            <span>{t('Add CLI tool')}</span>
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          <code className='bg-muted rounded px-1 py-0.5 font-mono'>
            {'{{base_url}}'}
          </code>{' '}
          {t(
            'is replaced with this instance URL at render time; use it in code snippets.'
          )}
        </p>
      </div>

      {/* Roadmap */}
      <div className='flex flex-col gap-4 border-t pt-4'>
        <h4 className='text-sm font-semibold'>{t('Roadmap')}</h4>
        <div className='grid gap-4 sm:grid-cols-3'>
          <TextField
            label={t('Badge')}
            value={content.roadmap.badge}
            onChange={(v) => setRoadmap({ badge: v })}
          />
          <TextField
            label={t('Heading')}
            value={content.roadmap.heading}
            onChange={(v) => setRoadmap({ heading: v })}
          />
          <TextField
            label={t('Subtitle')}
            value={content.roadmap.subtitle}
            onChange={(v) => setRoadmap({ subtitle: v })}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label className='text-xs'>{t('Roadmap items')}</Label>
          {content.roadmap.items.map((item, ri) => (
            <div
              key={item._id}
              className='bg-muted/20 flex flex-wrap items-end gap-2 rounded-md border p-2'
            >
              <div className='min-w-[120px] flex-1'>
                <TextField
                  label={t('Title')}
                  value={item.title}
                  onChange={(v) => updateItem(ri, { title: v })}
                />
              </div>
              <div className='min-w-[180px] flex-[2]'>
                <TextField
                  label={t('Description')}
                  value={item.description}
                  onChange={(v) => updateItem(ri, { description: v })}
                />
              </div>
              <div className='w-[140px]'>
                <Label className='text-xs'>{t('Status')}</Label>
                <Select
                  value={item.status}
                  onValueChange={(v) => {
                    if (typeof v === 'string') {
                      updateItem(ri, { status: v as CliRoadmapStatus })
                    }
                  }}
                >
                  <SelectTrigger className='mt-1.5'>
                    <SelectValue placeholder={t('Status')} />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant='ghost'
                size='sm'
                className='text-destructive h-9 w-9 shrink-0 p-0'
                onClick={() => removeItem(ri)}
                aria-label={t('Delete')}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          ))}
          <div>
            <Button variant='outline' size='sm' onClick={addItem}>
              <Plus data-icon='inline-start' />
              <span>{t('Add roadmap item')}</span>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
