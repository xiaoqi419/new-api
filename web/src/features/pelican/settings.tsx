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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { updateSystemOption } from '@/features/system-settings/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  fetchMonitorGroups,
  type PelicanCatalogGroup,
  type PelicanSettings,
} from './api'

interface PelicanSettingsCardProps {
  settings: PelicanSettings
  forcedOff: boolean
}

interface PelicanChoice {
  group: string
  model: string
}

interface PelicanDraft {
  enabled: boolean
  choices: PelicanChoice[]
  logic: string
  answer: string
  drawing: string
}

const AUTO_MODEL = '__auto__'

function choicesFrom(groups: PelicanSettings['groups']): PelicanChoice[] {
  if (!Array.isArray(groups)) return []
  return groups.flatMap((item) => {
    if (typeof item === 'string') {
      const group = item.trim()
      return group === '' ? [] : [{ group, model: '' }]
    }
    const group = item.group?.trim() ?? ''
    if (group === '') return []
    return [{ group, model: item.model?.trim() ?? '' }]
  })
}

function draftFrom(settings: PelicanSettings): PelicanDraft {
  return {
    enabled: settings.enabled,
    choices: choicesFrom(settings.groups),
    logic: shownText(settings.logic_prompt, settings.logic_prompt_default),
    answer: shownText(settings.logic_answer, settings.logic_answer_default),
    drawing: shownText(settings.drawing_prompt, settings.drawing_prompt_default),
  }
}

function shownText(stored: string, fallback: string) {
  if (stored.trim() === '') return fallback
  return stored
}

function storedText(value: string, fallback: string) {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === fallback.trim()) return ''
  return trimmed
}

function orderedChoices(
  selected: PelicanChoice[],
  catalog: PelicanCatalogGroup[] | undefined
) {
  if (!catalog) return selected
  const byName = new Map(selected.map((choice) => [choice.group, choice]))
  const known = catalog.flatMap((group) => {
    const choice = byName.get(group.name)
    return choice ? [choice] : []
  })
  const extra = selected.filter(
    (choice) => !catalog.some((group) => group.name === choice.group)
  )
  return [...known, ...extra]
}

function monitorRows(
  catalog: PelicanCatalogGroup[] | undefined,
  fallback: string[] | undefined,
  choices: PelicanChoice[]
): PelicanCatalogGroup[] {
  if (catalog) {
    const extras = choices
      .filter((choice) => !catalog.some((group) => group.name === choice.group))
      .map((choice) => ({
        name: choice.group,
        models: choice.model === '' ? [] : [choice.model],
      }))
    return [...catalog, ...extras]
  }
  return (fallback ?? []).map((name) => ({ name, models: [] }))
}

export function PelicanSettingsCard(props: PelicanSettingsCardProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const catalogKnown = Array.isArray(props.settings.catalog)
  const groupsQuery = useQuery({
    queryKey: ['pelican-monitor-groups'],
    queryFn: ({ signal }) => fetchMonitorGroups(signal),
    enabled: !catalogKnown,
    staleTime: 60_000,
  })
  const serverDraft = draftFrom(props.settings)
  const serverKey = JSON.stringify(serverDraft)
  const [draft, setDraft] = useState(serverDraft)
  const [seenKey, setSeenKey] = useState(serverKey)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (dirty || serverKey === seenKey) return
    setDraft(serverDraft)
    setSeenKey(serverKey)
  }, [dirty, seenKey, serverDraft, serverKey])

  const save = useMutation({
    mutationFn: async () => {
      const requests = [
        { key: 'PelicanMonitorEnabled', value: draft.enabled },
        {
          key: 'PelicanMonitorGroups',
          value: JSON.stringify(
            orderedChoices(
              draft.choices,
              catalogKnown ? props.settings.catalog : undefined
            )
          ),
        },
        {
          key: 'PelicanLogicPrompt',
          value: storedText(draft.logic, props.settings.logic_prompt_default),
        },
        {
          key: 'PelicanLogicAnswer',
          value: storedText(draft.answer, props.settings.logic_answer_default),
        },
        {
          key: 'PelicanDrawingPrompt',
          value: storedText(
            draft.drawing,
            props.settings.drawing_prompt_default
          ),
        },
      ]
      for (const request of requests) {
        requireServerSuccess(await updateSystemOption(request))
      }
    },
    onSuccess: async () => {
      setDirty(false)
      toast.success(t('Setting updated successfully'))
      await queryClient.invalidateQueries({ queryKey: ['pelican-monitor'] })
      await queryClient.invalidateQueries({ queryKey: ['status'] })
      try {
        window.localStorage.removeItem('status')
      } catch {
        /* Storage may be disabled. */
      }
    },
    onError: (error: Error) => {
      handleServerError(error, t('Failed to update setting'))
    },
  })

  const setChoice = (name: string, checked: boolean, model?: string) => {
    setDirty(true)
    setDraft((current) => {
      const existing = current.choices.find((choice) => choice.group === name)
      if (!checked) {
        return {
          ...current,
          choices: current.choices.filter((choice) => choice.group !== name),
        }
      }
      const next = {
        group: name,
        model: model ?? existing?.model ?? '',
      }
      return {
        ...current,
        choices: [
          ...current.choices.filter((choice) => choice.group !== name),
          next,
        ],
      }
    })
  }

  const rows = monitorRows(
    catalogKnown ? props.settings.catalog : undefined,
    groupsQuery.data,
    draft.choices
  )

  return (
    <Card>
      <CardContent className='py-4'>
        <FieldGroup>
          <Field orientation='horizontal'>
            <FieldContent>
              <FieldLabel htmlFor='pelican-monitor-enabled'>
                {t('Enable degradation monitor')}
              </FieldLabel>
              <FieldDescription>
                {t('While this is off, other users cannot open the monitor.')}
              </FieldDescription>
            </FieldContent>
            <Switch
              id='pelican-monitor-enabled'
              checked={draft.enabled}
              disabled={save.isPending}
              onCheckedChange={(checked) => {
                setDirty(true)
                setDraft((current) => ({ ...current, enabled: checked }))
              }}
            />
          </Field>
          {props.forcedOff ? (
            <FieldDescription>
              {t('Monitoring stays off because the server disabled it.')}
            </FieldDescription>
          ) : null}
          <FieldSet>
            <FieldLegend variant='label'>{t('Monitored groups')}</FieldLegend>
            <FieldDescription>
              {t(
                'Choose the groups to monitor and the model checked for each one. Leave every group unchecked to monitor all enabled groups and pick a model automatically.'
              )}
            </FieldDescription>
            {!catalogKnown && groupsQuery.isPending ? (
              <Skeleton className='h-16 w-full' />
            ) : null}
            {!catalogKnown && groupsQuery.isError ? (
              <FieldDescription>{t('Could not load groups.')}</FieldDescription>
            ) : null}
            {rows.length === 0 && (catalogKnown || groupsQuery.isSuccess) ? (
              <FieldDescription>
                {t('No enabled group has a channel yet.')}
              </FieldDescription>
            ) : null}
            {rows.length > 0 ? (
              <div className='grid max-h-72 gap-3 overflow-y-auto'>
                {rows.map((row, index) => {
                  const choice = draft.choices.find(
                    (item) => item.group === row.name
                  )
                  const checked = Boolean(choice)
                  const models =
                    choice &&
                    choice.model !== '' &&
                    !row.models.includes(choice.model)
                      ? [choice.model, ...row.models]
                      : row.models
                  const selected = choice?.model || AUTO_MODEL
                  return (
                    <div
                      key={row.name}
                      className='grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_16rem]'
                    >
                      <Field orientation='horizontal'>
                        <Checkbox
                          id={`pelican-group-${index}`}
                          checked={checked}
                          disabled={save.isPending}
                          onCheckedChange={(value) => {
                            const nextChecked = value === true
                            const fallbackModel = row.models[0] ?? ''
                            setChoice(
                              row.name,
                              nextChecked,
                              nextChecked
                                ? (choice?.model ?? fallbackModel)
                                : undefined
                            )
                          }}
                        />
                        <FieldLabel htmlFor={`pelican-group-${index}`}>
                          {row.name}
                        </FieldLabel>
                      </Field>
                      <Select
                        items={[
                          { value: AUTO_MODEL, label: t('Auto') },
                          ...models.map((model) => ({
                            value: model,
                            label: model,
                          })),
                        ]}
                        value={selected}
                        disabled={save.isPending || !checked}
                        onValueChange={(value) => {
                          if (!value) return
                          setChoice(
                            row.name,
                            true,
                            value === AUTO_MODEL ? '' : value
                          )
                        }}
                      >
                        <SelectTrigger
                          className='w-full'
                          aria-label={t('Model')}
                        >
                          <SelectValue placeholder={t('Auto')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={AUTO_MODEL}>
                              {t('Auto')}
                            </SelectItem>
                            {models.map((model) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </FieldSet>
          <Field>
            <FieldLabel htmlFor='pelican-logic-prompt'>
              {t('Logic question')}
            </FieldLabel>
            <Textarea
              id='pelican-logic-prompt'
              rows={6}
              value={draft.logic}
              disabled={save.isPending}
              onChange={(event) => {
                const value = event.target.value
                setDirty(true)
                setDraft((current) => ({ ...current, logic: value }))
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='pelican-logic-answer'>
              {t('Correct answer')}
            </FieldLabel>
            <Input
              id='pelican-logic-answer'
              inputMode='numeric'
              maxLength={12}
              value={draft.answer}
              disabled={save.isPending}
              onChange={(event) => {
                const value = event.target.value
                setDirty(true)
                setDraft((current) => ({ ...current, answer: value }))
              }}
            />
            <FieldDescription>
              {t('The check passes only when the model concludes this number.')}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor='pelican-drawing-prompt'>
              {t('Drawing prompt')}
            </FieldLabel>
            <Textarea
              id='pelican-drawing-prompt'
              rows={4}
              className='font-mono text-xs'
              value={draft.drawing}
              disabled={save.isPending}
              onChange={(event) => {
                const value = event.target.value
                setDirty(true)
                setDraft((current) => ({ ...current, drawing: value }))
              }}
            />
            <FieldDescription>
              {t(
                'Keep {{subject}}, {{vehicle}}, and {{scene}}. Each check fills them in.'
              )}
            </FieldDescription>
          </Field>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {t('Save monitor settings')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={save.isPending}
              onClick={() => {
                setDirty(true)
                setDraft((current) => ({
                  ...current,
                  logic: props.settings.logic_prompt_default,
                  answer: props.settings.logic_answer_default,
                  drawing: props.settings.drawing_prompt_default,
                }))
              }}
            >
              {t('Restore defaults')}
            </Button>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
