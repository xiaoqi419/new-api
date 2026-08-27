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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Plus, Pencil, Trash2, X } from '@/components/icons'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CHANNEL_TYPES } from '@/features/channels/constants'

import { useUpdateOption } from '../hooks/use-update-option'
import {
  CHANNEL_FAILOVER_POOLS_OPTION_KEY,
  getPoolChannelIssues,
  getSchedulingPoolChannelOptions,
  parseChannelFailoverPools,
  validateChannelFailoverPool,
  type ChannelFailoverPool,
  type ChannelFailoverPoolValidation,
  type PoolChannelIssue,
  type SchedulingPoolChannel,
} from './channel-failover-pools'
import { getSchedulingPoolChannels } from './channel-failover-pools-api'

type ChannelFailoverPoolsSectionProps = {
  defaultValue: string
}

const EMPTY_SCHEDULING_POOL_CHANNELS: SchedulingPoolChannel[] = []

function getChannelTypeLabel(channelType: number): string {
  return (
    CHANNEL_TYPES[channelType as keyof typeof CHANNEL_TYPES] ??
    String(channelType)
  )
}

function createPoolId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `pool-${Date.now().toString(36)}`
}

function newPool(): ChannelFailoverPool {
  return {
    id: createPoolId(),
    name: '',
    enabled: true,
    group: '',
    channel_type: 0,
    channel_ids: [],
  }
}

function getConfiguredGroupOptions(
  channels: Awaited<ReturnType<typeof getSchedulingPoolChannels>>
): string[] {
  const groups = new Set<string>()
  for (const channel of channels) {
    for (const group of channel.group.split(',')) {
      const normalized = group.trim()
      if (normalized) groups.add(normalized)
    }
  }
  return [...groups].sort((left, right) => left.localeCompare(right))
}

function getChannelTypeOptions(
  channels: Awaited<ReturnType<typeof getSchedulingPoolChannels>>,
  group: string
): number[] {
  const channelTypes = new Set<number>()
  for (const channel of channels) {
    if (
      channel.group
        .split(',')
        .map((value) => value.trim())
        .includes(group)
    ) {
      channelTypes.add(channel.type)
    }
  }
  return [...channelTypes].sort((left, right) => left - right)
}

function getPoolIssueLabel(
  t: (key: string, options?: Record<string, number>) => string,
  issue: PoolChannelIssue
): string {
  if (issue.reason === 'missing') {
    return t('Deleted channel #{{id}}', { id: issue.channelId })
  }
  if (issue.reason === 'disabled') {
    return t('Disabled channel #{{id}}', { id: issue.channelId })
  }
  return t('Channel #{{id}} no longer matches this pool', {
    id: issue.channelId,
  })
}

function PoolActionButton(props: {
  label: string
  children: React.ReactNode
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            size='icon-sm'
            variant={props.destructive ? 'destructive' : 'ghost'}
            aria-label={props.label}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

export function ChannelFailoverPoolsSection(
  props: ChannelFailoverPoolsSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [pools, setPools] = useState<ChannelFailoverPool[]>(() =>
    parseChannelFailoverPools(props.defaultValue)
  )
  const [draft, setDraft] = useState<ChannelFailoverPool | null>(null)
  const [editingPoolId, setEditingPoolId] = useState<string | null>(null)
  const [validation, setValidation] = useState<ChannelFailoverPoolValidation>(
    {}
  )

  const channelsQuery = useQuery({
    queryKey: ['channel-failover-pool-channels'],
    queryFn: getSchedulingPoolChannels,
    staleTime: 30_000,
  })
  const channels = channelsQuery.data ?? EMPTY_SCHEDULING_POOL_CHANNELS
  const groups = useMemo(() => getConfiguredGroupOptions(channels), [channels])
  const channelTypes = useMemo(
    () => getChannelTypeOptions(channels, draft?.group ?? ''),
    [channels, draft?.group]
  )
  const channelOptions = useMemo(() => {
    if (!draft) return []
    return getSchedulingPoolChannelOptions(
      channels,
      draft.group,
      draft.channel_type
    )
  }, [channels, draft])

  useEffect(() => {
    setPools(parseChannelFailoverPools(props.defaultValue))
  }, [props.defaultValue])

  const closeEditor = () => {
    setDraft(null)
    setEditingPoolId(null)
    setValidation({})
  }

  const openEditor = (pool?: ChannelFailoverPool) => {
    setDraft(pool ? { ...pool, channel_ids: [...pool.channel_ids] } : newPool())
    setEditingPoolId(pool?.id ?? null)
    setValidation({})
  }

  const savePools = async (nextPools: ChannelFailoverPool[]) => {
    await updateOption.mutateAsync({
      key: CHANNEL_FAILOVER_POOLS_OPTION_KEY,
      value: JSON.stringify(nextPools),
    })
    setPools(nextPools)
  }

  const saveDraft = async () => {
    if (!draft) return

    const normalizedDraft: ChannelFailoverPool = {
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      group: draft.group.trim(),
    }
    const errors = validateChannelFailoverPool(normalizedDraft, pools, channels)
    setValidation(errors)
    if (Object.keys(errors).length > 0) return

    const nextPools = editingPoolId
      ? pools.map((pool) =>
          pool.id === editingPoolId ? normalizedDraft : pool
        )
      : [...pools, normalizedDraft]
    await savePools(nextPools)
    closeEditor()
  }

  const deletePool = async (poolId: string) => {
    await savePools(pools.filter((pool) => pool.id !== poolId))
  }

  const removeInvalidChannel = (channelId: number) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        channel_ids: current.channel_ids.filter((id) => id !== channelId),
      }
    })
    setValidation((current) => ({ ...current, channel_ids: undefined }))
  }

  return (
    <div
      className='flex min-w-0 flex-col gap-4'
      data-testid='channel-failover-pools'
    >
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <h4 className='text-sm font-medium'>{t('Channel failover pools')}</h4>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Lock fixed-group retry routing to explicitly selected channels of one channel type.'
            )}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='self-start'
          onClick={() => openEditor()}
        >
          <Plus data-icon='inline-start' aria-hidden='true' />
          {t('Add scheduling pool')}
        </Button>
      </div>

      {channelsQuery.isError ? (
        <p className='text-destructive text-sm'>
          {t('Unable to load channel options. Refresh and try again.')}
        </p>
      ) : null}

      {pools.length === 0 ? (
        <p className='text-muted-foreground border-border border border-dashed p-4 text-sm'>
          {t('No channel failover pools configured')}
        </p>
      ) : (
        <div className='grid min-w-0 gap-3'>
          {pools.map((pool) => {
            const issues = channelsQuery.isSuccess
              ? getPoolChannelIssues(pool.channel_ids, pool, channels)
              : []
            return (
              <article
                key={pool.id}
                className='border-border bg-muted/20 grid min-w-0 gap-3 border p-3'
              >
                <div className='flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='min-w-0'>
                    <h5 className='min-w-0 text-sm font-medium break-words'>
                      {pool.name}
                    </h5>
                    <p className='text-muted-foreground text-xs break-all'>
                      {pool.id}
                    </p>
                  </div>
                  <div className='flex shrink-0 items-center gap-1 self-end sm:self-auto'>
                    <span
                      className={
                        pool.enabled
                          ? 'bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground px-2 py-1 text-xs'
                      }
                    >
                      {pool.enabled ? t('Enabled') : t('Disabled')}
                    </span>
                    <PoolActionButton
                      label={t('Edit scheduling pool {{name}}', {
                        name: pool.name,
                      })}
                      onClick={() => openEditor(pool)}
                    >
                      <Pencil aria-hidden='true' />
                    </PoolActionButton>
                    <PoolActionButton
                      destructive
                      label={t('Delete scheduling pool {{name}}', {
                        name: pool.name,
                      })}
                      onClick={() => deletePool(pool.id)}
                    >
                      <Trash2 aria-hidden='true' />
                    </PoolActionButton>
                  </div>
                </div>
                <dl className='text-muted-foreground grid min-w-0 gap-x-4 gap-y-1 text-xs sm:grid-cols-3'>
                  <div className='min-w-0'>
                    <dt>{t('Group')}</dt>
                    <dd className='text-foreground break-words'>
                      {pool.group}
                    </dd>
                  </div>
                  <div className='min-w-0'>
                    <dt>{t('Channel type')}</dt>
                    <dd className='text-foreground break-words'>
                      {t(getChannelTypeLabel(pool.channel_type))} (
                      {pool.channel_type})
                    </dd>
                  </div>
                  <div className='min-w-0'>
                    <dt>{t('Channels')}</dt>
                    <dd className='text-foreground break-words'>
                      {pool.channel_ids.join(', ')}
                    </dd>
                  </div>
                </dl>
                {issues.length > 0 ? (
                  <div className='text-destructive flex min-w-0 flex-wrap gap-2 text-xs'>
                    {issues.map((issue) => (
                      <span
                        key={`${pool.id}-${issue.channelId}-${issue.reason}`}
                      >
                        {getPoolIssueLabel(t, issue)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && closeEditor()}
        title={t(
          editingPoolId ? 'Edit scheduling pool' : 'Add scheduling pool'
        )}
        description={t(
          'A pool may contain only one exact group and channel type. Select at least two channels.'
        )}
        contentClassName='max-w-[calc(100vw-1rem)] sm:max-w-xl'
        footer={
          <>
            <Button type='button' variant='outline' onClick={closeEditor}>
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              onClick={saveDraft}
              disabled={updateOption.isPending || channelsQuery.isLoading}
            >
              {t('Save pool')}
            </Button>
          </>
        }
      >
        {draft ? (
          <div className='grid min-w-0 gap-4'>
            <div className='grid min-w-0 gap-1.5'>
              <Label htmlFor='channel-failover-pool-id'>{t('Stable ID')}</Label>
              <Input
                id='channel-failover-pool-id'
                value={draft.id}
                onChange={(event) =>
                  setDraft({ ...draft, id: event.target.value })
                }
                aria-invalid={Boolean(validation.id)}
              />
              {validation.id ? (
                <p className='text-destructive text-xs'>{t(validation.id)}</p>
              ) : null}
            </div>
            <div className='grid min-w-0 gap-1.5'>
              <Label htmlFor='channel-failover-pool-name'>{t('Name')}</Label>
              <Input
                id='channel-failover-pool-name'
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                aria-invalid={Boolean(validation.name)}
              />
              {validation.name ? (
                <p className='text-destructive text-xs'>{t(validation.name)}</p>
              ) : null}
            </div>
            <div className='flex min-w-0 items-center justify-between gap-4 border p-3'>
              <Label htmlFor='channel-failover-pool-enabled'>
                {t('Enabled')}
              </Label>
              <Switch
                id='channel-failover-pool-enabled'
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
              />
            </div>
            <div className='grid min-w-0 gap-4 sm:grid-cols-2'>
              <div className='grid min-w-0 gap-1.5'>
                <Label>{t('Group')}</Label>
                <Select
                  items={groups.map((group) => ({
                    label: group,
                    value: group,
                  }))}
                  value={draft.group}
                  onValueChange={(group) =>
                    setDraft({ ...draft, group: group ?? '', channel_type: 0 })
                  }
                >
                  <SelectTrigger aria-invalid={Boolean(validation.group)}>
                    <SelectValue placeholder={t('Select a group')} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group} value={group}>
                        {group}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validation.group ? (
                  <p className='text-destructive text-xs'>
                    {t(validation.group)}
                  </p>
                ) : null}
              </div>
              <div className='grid min-w-0 gap-1.5'>
                <Label>{t('Channel type')}</Label>
                <Select
                  items={channelTypes.map((channelType) => ({
                    label: t(getChannelTypeLabel(channelType)),
                    value: String(channelType),
                  }))}
                  value={draft.channel_type ? String(draft.channel_type) : null}
                  onValueChange={(channelType) =>
                    setDraft({
                      ...draft,
                      channel_type: Number(channelType),
                    })
                  }
                >
                  <SelectTrigger
                    aria-invalid={Boolean(validation.channel_type)}
                  >
                    <SelectValue placeholder={t('Select a channel type')} />
                  </SelectTrigger>
                  <SelectContent>
                    {channelTypes.map((channelType) => (
                      <SelectItem key={channelType} value={String(channelType)}>
                        {t(getChannelTypeLabel(channelType))} ({channelType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validation.channel_type ? (
                  <p className='text-destructive text-xs'>
                    {t(validation.channel_type)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className='grid min-w-0 gap-1.5'>
              <Label htmlFor='channel-failover-pool-members'>
                {t('Channel IDs')}
              </Label>
              <MultiSelect
                id='channel-failover-pool-members'
                options={channelOptions.map((channel) => ({
                  value: String(channel.id),
                  label: `${channel.name} (#${channel.id})`,
                }))}
                selected={draft.channel_ids.map(String)}
                onChange={(values) =>
                  setDraft({
                    ...draft,
                    channel_ids: values
                      .map(Number)
                      .filter((channelId) => Number.isSafeInteger(channelId)),
                  })
                }
                placeholder={t('Select channels')}
                maxVisibleChips={4}
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Only channels in the selected group and exact channel type are available.'
                )}
              </p>
              {validation.channel_ids ? (
                <p className='text-destructive text-xs'>
                  {t(validation.channel_ids)}
                </p>
              ) : null}
            </div>
            {channelsQuery.isSuccess &&
            getPoolChannelIssues(draft.channel_ids, draft, channels).length >
              0 ? (
              <div className='border-destructive/30 grid min-w-0 gap-2 border p-3'>
                <p className='text-destructive text-xs font-medium'>
                  {t('Invalid pool members')}
                </p>
                {getPoolChannelIssues(draft.channel_ids, draft, channels).map(
                  (issue) => (
                    <div
                      key={`${issue.channelId}-${issue.reason}`}
                      className='flex min-w-0 items-center justify-between gap-2'
                    >
                      <span className='text-muted-foreground min-w-0 text-xs break-words'>
                        {getPoolIssueLabel(t, issue)}
                      </span>
                      <PoolActionButton
                        label={t('Remove invalid channel {{id}}', {
                          id: issue.channelId,
                        })}
                        onClick={() => removeInvalidChannel(issue.channelId)}
                      >
                        <X aria-hidden='true' />
                      </PoolActionButton>
                    </div>
                  )
                )}
              </div>
            ) : null}
            {validation.conflict ? (
              <p className='text-destructive text-xs'>
                {t(validation.conflict)}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
