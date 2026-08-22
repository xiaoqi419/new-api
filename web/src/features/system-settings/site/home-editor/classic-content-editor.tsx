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
import { Switch } from '@/components/ui/switch'
import { FEATURE_ICON_NAMES } from '@/features/home/lib/icon-mapper'
import type {
  ClassicLandingContent,
  FeatureBentoItem,
  FeatureCardItem,
  FeaturesContent,
  HeroAppItem,
  HeroContent,
  SectionToggles,
} from '@/features/home/types'

import { uid, type WithId } from './ids'
import { TextField } from './shared'

type EditorContent = {
  sections: SectionToggles
  hero: Omit<HeroContent, 'apps'> & { apps: WithId<HeroAppItem>[] }
  features: Omit<FeaturesContent, 'bento' | 'additional'> & {
    bento: WithId<FeatureBentoItem>[]
    additional: WithId<FeatureCardItem>[]
  }
}

function toEditor(c: ClassicLandingContent): EditorContent {
  return {
    sections: c.sections,
    hero: { ...c.hero, apps: c.hero.apps.map((a) => ({ ...a, _id: uid() })) },
    features: {
      ...c.features,
      bento: c.features.bento.map((b) => ({ ...b, _id: uid() })),
      additional: c.features.additional.map((f) => ({ ...f, _id: uid() })),
    },
  }
}

function fromEditor(e: EditorContent): ClassicLandingContent {
  return {
    sections: e.sections,
    hero: {
      ...e.hero,
      apps: e.hero.apps.map((a) => ({
        name: a.name,
        url: a.url,
        iconUrl: a.iconUrl,
      })),
    },
    features: {
      ...e.features,
      bento: e.features.bento.map((b) => ({ title: b.title, desc: b.desc })),
      additional: e.features.additional.map((f) => ({
        icon: f.icon,
        title: f.title,
        desc: f.desc,
      })),
    },
  }
}

type ClassicContentEditorProps = {
  value: ClassicLandingContent
  onChange: (content: ClassicLandingContent) => void
}

export function ClassicContentEditor({
  value,
  onChange,
}: ClassicContentEditorProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState<EditorContent>(() => toEditor(value))

  const emit = (next: EditorContent) => {
    setContent(next)
    onChange(fromEditor(next))
  }

  const setSections = (patch: Partial<SectionToggles>) =>
    emit({ ...content, sections: { ...content.sections, ...patch } })
  const setHero = (patch: Partial<Omit<HeroContent, 'apps'>>) =>
    emit({ ...content, hero: { ...content.hero, ...patch } })
  const setFeatures = (
    patch: Partial<Omit<FeaturesContent, 'bento' | 'additional'>>
  ) => emit({ ...content, features: { ...content.features, ...patch } })

  const updateApp = (index: number, patch: Partial<HeroAppItem>) =>
    emit({
      ...content,
      hero: {
        ...content.hero,
        apps: content.hero.apps.map((a, i) =>
          i === index ? { ...a, ...patch } : a
        ),
      },
    })
  const removeApp = (index: number) =>
    emit({
      ...content,
      hero: {
        ...content.hero,
        apps: content.hero.apps.filter((_, i) => i !== index),
      },
    })
  const addApp = () =>
    emit({
      ...content,
      hero: {
        ...content.hero,
        apps: [...content.hero.apps, { name: '', url: '', _id: uid() }],
      },
    })

  const updateBento = (
    index: number,
    patch: { title?: string; desc?: string }
  ) =>
    emit({
      ...content,
      features: {
        ...content.features,
        bento: content.features.bento.map((b, i) =>
          i === index ? { ...b, ...patch } : b
        ),
      },
    })

  const updateCard = (
    index: number,
    patch: { icon?: string; title?: string; desc?: string }
  ) =>
    emit({
      ...content,
      features: {
        ...content.features,
        additional: content.features.additional.map((f, i) =>
          i === index ? { ...f, ...patch } : f
        ),
      },
    })
  const removeCard = (index: number) =>
    emit({
      ...content,
      features: {
        ...content.features,
        additional: content.features.additional.filter((_, i) => i !== index),
      },
    })
  const addCard = () =>
    emit({
      ...content,
      features: {
        ...content.features,
        additional: [
          ...content.features.additional,
          {
            icon: FEATURE_ICON_NAMES[0] ?? 'Zap',
            title: '',
            desc: '',
            _id: uid(),
          },
        ],
      },
    })

  const toggles: { key: keyof SectionToggles; label: string }[] = [
    { key: 'stats', label: t('Stats') },
    { key: 'features', label: t('Features') },
    { key: 'howItWorks', label: t('How It Works') },
    { key: 'cta', label: t('Call To Action') },
  ]

  return (
    <>
      {/* Section visibility */}
      <div className='flex flex-col gap-3 border-t pt-4'>
        <h4 className='text-sm font-semibold'>{t('Section visibility')}</h4>
        <div className='flex flex-wrap gap-x-8 gap-y-3'>
          {toggles.map((s) => (
            <div key={s.key} className='flex items-center gap-2'>
              <Switch
                checked={content.sections[s.key]}
                onCheckedChange={(checked) => setSections({ [s.key]: checked })}
              />
              <Label className='text-xs'>{s.label}</Label>
            </div>
          ))}
        </div>
      </div>

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
          <TextField
            label={t('Highlighted title')}
            value={content.hero.highlight}
            onChange={(v) => setHero({ highlight: v })}
          />
          <TextField
            label={t('More Apps')}
            value={content.hero.moreAppsLabel}
            onChange={(v) => setHero({ moreAppsLabel: v })}
          />
        </div>
        <TextField
          label={t('Subtitle')}
          value={content.hero.subtitle}
          onChange={(v) => setHero({ subtitle: v })}
          textarea
        />
        <div className='grid gap-4 sm:grid-cols-3'>
          <TextField
            label={t('Get Started')}
            value={content.hero.getStartedLabel}
            onChange={(v) => setHero({ getStartedLabel: v })}
          />
          <TextField
            label={t('View Pricing')}
            value={content.hero.viewPricingLabel}
            onChange={(v) => setHero({ viewPricingLabel: v })}
          />
          <TextField
            label={t('Go to Dashboard')}
            value={content.hero.goToDashboardLabel}
            onChange={(v) => setHero({ goToDashboardLabel: v })}
          />
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <TextField
            label={t('Supported Applications')}
            value={content.hero.appsHeading}
            onChange={(v) => setHero({ appsHeading: v })}
          />
          <TextField
            label={t('Apps subheading')}
            value={content.hero.appsSubheading}
            onChange={(v) => setHero({ appsSubheading: v })}
          />
        </div>

        {/* Apps list */}
        <div className='flex flex-col gap-2'>
          <Label className='text-xs'>{t('Supported apps')}</Label>
          {content.hero.apps.map((app, i) => (
            <div
              key={app._id}
              className='bg-muted/20 flex flex-wrap items-end gap-2 rounded-md border p-2'
            >
              <div className='min-w-[120px] flex-1'>
                <TextField
                  label={t('Name')}
                  value={app.name}
                  onChange={(v) => updateApp(i, { name: v })}
                />
              </div>
              <div className='min-w-[160px] flex-1'>
                <TextField
                  label={t('URL')}
                  value={app.url}
                  onChange={(v) => updateApp(i, { url: v })}
                  placeholder='https://example.com'
                />
              </div>
              <div className='min-w-[160px] flex-1'>
                <TextField
                  label={t('Icon URL')}
                  value={app.iconUrl ?? ''}
                  onChange={(v) => updateApp(i, { iconUrl: v || undefined })}
                  placeholder='https://example.com/favicon.png'
                />
              </div>
              <Button
                variant='ghost'
                size='sm'
                className='text-destructive h-9 w-9 shrink-0 p-0'
                onClick={() => removeApp(i)}
                aria-label={t('Delete')}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          ))}
          <div>
            <Button variant='outline' size='sm' onClick={addApp}>
              <Plus data-icon='inline-start' />
              <span>{t('Add app')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className='flex flex-col gap-4 border-t pt-4'>
        <h4 className='text-sm font-semibold'>{t('Features Section')}</h4>
        <div className='grid gap-4 sm:grid-cols-3'>
          <TextField
            label={t('Core Features')}
            value={content.features.eyebrow}
            onChange={(v) => setFeatures({ eyebrow: v })}
          />
          <TextField
            label={t('Heading line 1')}
            value={content.features.headingLine1}
            onChange={(v) => setFeatures({ headingLine1: v })}
          />
          <TextField
            label={t('Heading line 2')}
            value={content.features.headingLine2}
            onChange={(v) => setFeatures({ headingLine2: v })}
          />
        </div>

        {/* Bento cards (fixed) */}
        <div className='flex flex-col gap-2'>
          <Label className='text-xs'>{t('Highlight cards')}</Label>
          {content.features.bento.map((b, i) => (
            <div
              key={b._id}
              className='bg-muted/20 grid gap-2 rounded-md border p-2 sm:grid-cols-2'
            >
              <TextField
                label={`${t('Title')} ${i + 1}`}
                value={b.title}
                onChange={(v) => updateBento(i, { title: v })}
              />
              <TextField
                label={t('Description')}
                value={b.desc}
                onChange={(v) => updateBento(i, { desc: v })}
              />
            </div>
          ))}
        </div>

        {/* Additional feature cards (add/remove) */}
        <div className='flex flex-col gap-2'>
          <Label className='text-xs'>{t('Feature cards')}</Label>
          {content.features.additional.map((f, i) => (
            <div
              key={f._id}
              className='bg-muted/20 flex flex-wrap items-end gap-2 rounded-md border p-2'
            >
              <div className='w-[140px]'>
                <Label className='text-xs'>{t('Icon')}</Label>
                <Select
                  value={f.icon}
                  onValueChange={(v) => {
                    if (typeof v === 'string') updateCard(i, { icon: v })
                  }}
                >
                  <SelectTrigger className='mt-1.5'>
                    <SelectValue placeholder={t('Icon')} />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {FEATURE_ICON_NAMES.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className='min-w-[120px] flex-1'>
                <TextField
                  label={t('Title')}
                  value={f.title}
                  onChange={(v) => updateCard(i, { title: v })}
                />
              </div>
              <div className='min-w-[180px] flex-[2]'>
                <TextField
                  label={t('Description')}
                  value={f.desc}
                  onChange={(v) => updateCard(i, { desc: v })}
                />
              </div>
              <Button
                variant='ghost'
                size='sm'
                className='text-destructive h-9 w-9 shrink-0 p-0'
                onClick={() => removeCard(i)}
                aria-label={t('Delete')}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          ))}
          <div>
            <Button variant='outline' size='sm' onClick={addCard}>
              <Plus data-icon='inline-start' />
              <span>{t('Add feature card')}</span>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
