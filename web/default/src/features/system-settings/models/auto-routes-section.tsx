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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { AutoRoutesEditor } from './auto-routes-editor'

function parseGroupOptions(groupRatio: string): string[] {
  if (!groupRatio || !groupRatio.trim()) return []
  try {
    const parsed = JSON.parse(groupRatio) as Record<string, unknown>
    return Object.keys(parsed).filter((g) => g && g !== 'auto')
  } catch {
    return []
  }
}

type AutoRoutesSectionProps = {
  autoGroupRoutes: string
  groupRatio: string
}

export function AutoRoutesSection(props: AutoRoutesSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [value, setValue] = useState(() => props.autoGroupRoutes || '[]')

  const groupOptions = useMemo(
    () => parseGroupOptions(props.groupRatio),
    [props.groupRatio]
  )

  const handleSave = () => {
    updateOption.mutate({ key: 'AutoGroupRoutes', value })
  }

  return (
    <SettingsSection title={t('Auto Routes')}>
      <SettingsPageFormActions
        onSave={handleSave}
        isSaving={updateOption.isPending}
      />
      <p className='text-muted-foreground text-sm'>
        {t(
          'Define named automatic dispatch routes. Each route resolves to an ordered chain of groups that channel selection walks in order. Users select a route by setting their token group to auto:<key>.'
        )}
      </p>
      <AutoRoutesEditor
        value={value}
        groupOptions={groupOptions}
        onChange={setValue}
      />
    </SettingsSection>
  )
}
