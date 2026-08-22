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
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { useStatus } from '@/hooks/use-status'

import { CHANGELOG } from './data'
import type { ChangeKind } from './types'

const kindMeta: Record<
  ChangeKind,
  { labelKey: string; variant: 'success' | 'warning' | 'info' | 'danger' }
> = {
  feature: { labelKey: 'New', variant: 'success' },
  improvement: { labelKey: 'Improved', variant: 'info' },
  fix: { labelKey: 'Fixed', variant: 'warning' },
  security: { labelKey: 'Security', variant: 'danger' },
}

export function ChangelogPage() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const currentVersion = status?.version ?? ''

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Changelog')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
          {CHANGELOG.length === 0 && (
            <Empty className='min-h-64 border'>
              <EmptyHeader>
                <EmptyTitle>{t('No changelog entries yet')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          {CHANGELOG.map((entry) => {
            const isCurrent =
              currentVersion !== '' &&
              (currentVersion === entry.version ||
                currentVersion.startsWith(`${entry.version}-`))
            return (
              <div key={entry.version} className='rounded-xl border p-5'>
                <div className='flex flex-wrap items-center gap-3'>
                  <span className='text-lg font-semibold'>
                    v{entry.version}
                  </span>
                  {isCurrent && (
                    <StatusBadge
                      label={t('Current')}
                      variant='success'
                      copyable={false}
                    />
                  )}
                  <span className='text-muted-foreground ml-auto text-sm'>
                    {entry.date}
                  </span>
                </div>

                <div className='mt-4 flex flex-col gap-4'>
                  {entry.changes.map((group) => {
                    const meta = kindMeta[group.kind]
                    return (
                      <div key={group.kind} className='flex flex-col gap-2'>
                        <StatusBadge
                          label={t(meta.labelKey)}
                          variant={meta.variant}
                          copyable={false}
                          className='w-fit'
                        />
                        <ul className='text-muted-foreground ml-1 flex list-disc flex-col gap-1 pl-5 text-sm'>
                          {group.items.map((item) => (
                            <li key={item} className='text-foreground/90'>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
