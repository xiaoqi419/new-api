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
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'

type AutoRoute = {
  _id: string
  key: string
  name: string
  description: string
  groups: string[]
  enabled: boolean
  userSelectable: boolean
}

type RawAutoRoute = {
  key?: string
  name?: string
  description?: string
  groups?: string[]
  enabled?: boolean
  user_selectable?: boolean
}

let _idCounter = 0
function uid() {
  return `agr_${++_idCounter}`
}

function safeParse(value: string): RawAutoRoute[] {
  if (!value || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as RawAutoRoute[]) : []
  } catch {
    return []
  }
}

function toRoutes(value: string): AutoRoute[] {
  return safeParse(value).map((raw) => ({
    _id: uid(),
    key: raw.key ?? '',
    name: raw.name ?? '',
    description: raw.description ?? '',
    groups: Array.isArray(raw.groups) ? raw.groups.filter(Boolean) : [],
    enabled: raw.enabled ?? true,
    userSelectable: raw.user_selectable ?? true,
  }))
}

function serialize(routes: AutoRoute[]): string {
  const result: RawAutoRoute[] = routes
    .map((route) => ({
      key: route.key.trim(),
      name: route.name.trim(),
      description: route.description.trim(),
      groups: route.groups,
      enabled: route.enabled,
      user_selectable: route.userSelectable,
    }))
    .filter((route) => route.key !== '')
  return JSON.stringify(result, null, 2)
}

type AutoRoutesEditorProps = {
  value: string
  groupOptions: string[]
  onChange: (value: string) => void
}

type RouteCardProps = {
  route: AutoRoute
  groupOptions: string[]
  duplicateKey: boolean
  onUpdate: (id: string, patch: Partial<AutoRoute>) => void
  onRemove: (id: string) => void
}

function RouteCard(props: RouteCardProps) {
  const { t } = useTranslation()
  const { route } = props
  const availableGroups = useMemo(
    () => props.groupOptions.filter((g) => !route.groups.includes(g)),
    [props.groupOptions, route.groups]
  )

  const moveGroup = (index: number, delta: number) => {
    const next = [...route.groups]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    props.onUpdate(route._id, { groups: next })
  }

  const removeGroup = (index: number) => {
    props.onUpdate(route._id, {
      groups: route.groups.filter((_, i) => i !== index),
    })
  }

  const addGroup = (group: string) => {
    if (!group || route.groups.includes(group)) return
    props.onUpdate(route._id, { groups: [...route.groups, group] })
  }

  return (
    <Card className='shadow-none'>
      <CardHeader className='flex flex-row items-start justify-between gap-2 border-b'>
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <CardTitle className='flex items-center gap-2 text-sm'>
            <span className='truncate'>
              {route.name || route.key || t('Unnamed route')}
            </span>
            <StatusBadge
              label={route.enabled ? t('Enabled') : t('Disabled')}
              variant={route.enabled ? 'success' : 'neutral'}
              copyable={false}
            />
            {props.duplicateKey && (
              <StatusBadge
                label={t('Duplicate key')}
                variant='danger'
                copyable={false}
              />
            )}
          </CardTitle>
          {route.key.trim() !== '' && (
            <span className='text-muted-foreground font-mono text-xs'>
              {t('Token group')}: auto:{route.key.trim()}
            </span>
          )}
        </div>
        <Button
          variant='ghost'
          size='sm'
          className='text-destructive h-8 w-8 shrink-0 p-0'
          onClick={() => props.onRemove(route._id)}
          aria-label={t('Delete')}
        >
          <Trash2 className='h-4 w-4' />
        </Button>
      </CardHeader>
      <CardContent className='flex flex-col gap-4 pt-4'>
        <div className='grid gap-4 sm:grid-cols-3'>
          <div className='flex flex-col gap-1.5'>
            <Label className='text-xs'>{t('Key')}</Label>
            <Input
              value={route.key}
              placeholder='fast'
              onChange={(e) =>
                props.onUpdate(route._id, { key: e.target.value })
              }
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label className='text-xs'>{t('Name')}</Label>
            <Input
              value={route.name}
              placeholder={t('Fast route')}
              onChange={(e) =>
                props.onUpdate(route._id, { name: e.target.value })
              }
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label className='text-xs'>{t('Description')}</Label>
            <Input
              value={route.description}
              onChange={(e) =>
                props.onUpdate(route._id, { description: e.target.value })
              }
            />
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-6'>
          <div className='flex items-center gap-2'>
            <Switch
              checked={route.enabled}
              onCheckedChange={(checked) =>
                props.onUpdate(route._id, { enabled: checked })
              }
            />
            <Label className='text-xs'>{t('Enabled')}</Label>
          </div>
          <div className='flex items-center gap-2'>
            <Switch
              checked={route.userSelectable}
              onCheckedChange={(checked) =>
                props.onUpdate(route._id, { userSelectable: checked })
              }
            />
            <Label className='text-xs'>{t('User selectable')}</Label>
          </div>
        </div>

        <div className='flex flex-col gap-2'>
          <Label className='text-xs'>{t('Group chain (in order)')}</Label>
          {route.groups.length === 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('No groups yet. Add one below.')}
            </p>
          ) : (
            <div className='flex flex-col gap-1.5'>
              {route.groups.map((group, index) => (
                <div
                  key={group}
                  className='bg-muted/20 flex items-center gap-2 rounded-md border px-2 py-1'
                >
                  <span className='text-muted-foreground w-5 text-center text-xs tabular-nums'>
                    {index + 1}
                  </span>
                  <span className='flex-1 truncate text-sm'>{group}</span>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 w-7 p-0'
                    disabled={index === 0}
                    onClick={() => moveGroup(index, -1)}
                    aria-label={t('Move up')}
                  >
                    <ArrowUp className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 w-7 p-0'
                    disabled={index === route.groups.length - 1}
                    onClick={() => moveGroup(index, 1)}
                    aria-label={t('Move down')}
                  >
                    <ArrowDown className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive h-7 w-7 p-0'
                    onClick={() => removeGroup(index)}
                    aria-label={t('Delete')}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {availableGroups.length > 0 && (
            <Select
              value={null}
              onValueChange={(v) => {
                if (typeof v === 'string') addGroup(v)
              }}
            >
              <SelectTrigger className='w-[240px]'>
                <SelectValue placeholder={t('Add a group')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {availableGroups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function AutoRoutesEditor(props: AutoRoutesEditorProps) {
  const { t } = useTranslation()
  const [routes, setRoutes] = useState<AutoRoute[]>(() => toRoutes(props.value))

  const { onChange } = props
  const emitChange = useCallback(
    (next: AutoRoute[]) => {
      setRoutes(next)
      onChange(serialize(next))
    },
    [onChange]
  )

  const updateRoute = useCallback(
    (id: string, patch: Partial<AutoRoute>) => {
      emitChange(
        routes.map((route) =>
          route._id === id ? { ...route, ...patch } : route
        )
      )
    },
    [routes, emitChange]
  )

  const removeRoute = useCallback(
    (id: string) => emitChange(routes.filter((route) => route._id !== id)),
    [routes, emitChange]
  )

  const addRoute = useCallback(() => {
    emitChange([
      ...routes,
      {
        _id: uid(),
        key: '',
        name: '',
        description: '',
        groups: [],
        enabled: true,
        userSelectable: true,
      },
    ])
  }, [routes, emitChange])

  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, number>()
    for (const route of routes) {
      const key = route.key.trim()
      if (!key) continue
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return seen
  }, [routes])

  return (
    <div className='flex flex-col gap-3'>
      {routes.length === 0 ? (
        <p className='text-muted-foreground py-4 text-center text-sm'>
          {t('No auto routes yet. Add one to get started.')}
        </p>
      ) : (
        routes.map((route) => (
          <RouteCard
            key={route._id}
            route={route}
            groupOptions={props.groupOptions}
            duplicateKey={(duplicateKeys.get(route.key.trim()) ?? 0) > 1}
            onUpdate={updateRoute}
            onRemove={removeRoute}
          />
        ))
      )}
      <div>
        <Button variant='outline' size='sm' onClick={addRoute}>
          <Plus data-icon='inline-start' />
          <span>{t('Add auto route')}</span>
        </Button>
      </div>
    </div>
  )
}
