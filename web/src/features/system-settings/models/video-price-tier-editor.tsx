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
import { useTranslation } from 'react-i18next'

import { Plus, Trash2 } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import {
  createVideoPriceMatrixRow,
  getVideoTierRatioLabel,
  numericDraftRegex,
  setVideoPriceAxis,
  videoPriceColumns,
  type VideoPriceAxes,
  type VideoPriceCellKey,
  type VideoPriceMatrixDraft,
} from './model-pricing-core'

type VideoPriceTierEditorProps = {
  draft: VideoPriceMatrixDraft
  errorMessage?: string | null
  onChange: (next: VideoPriceMatrixDraft) => void
}

const AXIS_LABEL_KEYS: { axis: keyof VideoPriceAxes; labelKey: string }[] = [
  { axis: 'resolution', labelKey: 'Output resolution' },
  { axis: 'videoInput', labelKey: 'Video input' },
  { axis: 'audioOutput', labelKey: 'Audio output' },
]

export function VideoPriceTierEditor(props: VideoPriceTierEditorProps) {
  const { t } = useTranslation()
  const columns = videoPriceColumns(props.draft.axes)
  const basePrice = props.draft.rows[0]?.prices['--'] ?? ''

  const setCell = (rowId: string, key: VideoPriceCellKey, value: string) => {
    if (!numericDraftRegex.test(value)) return
    props.onChange({
      ...props.draft,
      rows: props.draft.rows.map((row) =>
        row.id === rowId
          ? { ...row, prices: { ...row.prices, [key]: value } }
          : row
      ),
    })
  }

  const columnLabel = (column: (typeof columns)[number]) => {
    const parts: string[] = []
    if (props.draft.axes.videoInput) {
      parts.push(column.hasVideo ? t('With video input') : t('No video input'))
    }
    if (props.draft.axes.audioOutput) {
      parts.push(column.hasAudio ? t('With audio') : t('Silent'))
    }
    return parts.length > 0 ? parts.join(' · ') : t('Unit price')
  }

  return (
    <SettingsControlGroup className='space-y-4'>
      <SettingsSwitchField
        checked={props.draft.enabled}
        onCheckedChange={(checked) =>
          props.onChange({ ...props.draft, enabled: checked })
        }
        label={t('Video tier pricing')}
        description={t(
          'Charge video models differently by output resolution, video input, or audio output.'
        )}
        aria-label={t('Video tier pricing')}
      />

      {props.draft.enabled && (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
            <span className='text-sm font-medium'>
              {t('Pricing dimensions')}
            </span>
            {AXIS_LABEL_KEYS.map((entry) => (
              <div key={entry.axis} className='flex items-center gap-2'>
                <Checkbox
                  id={`video-axis-${entry.axis}`}
                  checked={props.draft.axes[entry.axis]}
                  onCheckedChange={(checked) =>
                    props.onChange(
                      setVideoPriceAxis(
                        props.draft,
                        entry.axis,
                        checked === true
                      )
                    )
                  }
                />
                <Label
                  htmlFor={`video-axis-${entry.axis}`}
                  className='text-sm font-normal'
                >
                  {t(entry.labelKey)}
                </Label>
              </div>
            ))}
          </div>

          <div className='overflow-x-auto'>
            <table className='w-full table-fixed border-separate border-spacing-x-1.5 border-spacing-y-1 text-sm'>
              <thead>
                <tr>
                  <th className='text-muted-foreground w-[5.25rem] text-left text-xs font-medium'>
                    {props.draft.axes.resolution ? t('Output resolution') : ''}
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className='text-muted-foreground text-left text-xs font-medium break-words'
                    >
                      {columnLabel(column)}
                    </th>
                  ))}
                  <th className='w-8' />
                </tr>
              </thead>
              <tbody>
                {props.draft.rows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    <td>
                      {rowIndex === 0 ? (
                        <div className='flex h-9 flex-col justify-center'>
                          <Badge variant='secondary' className='w-fit'>
                            {t('Base tier')}
                          </Badge>
                          {props.draft.axes.resolution && (
                            <span className='text-muted-foreground text-[11px] leading-tight'>
                              {t('Other resolutions')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Input
                          className='w-full px-2'
                          value={row.resolution}
                          placeholder='1080p'
                          aria-label={t('Output resolution')}
                          onChange={(event) =>
                            props.onChange({
                              ...props.draft,
                              rows: props.draft.rows.map((item) =>
                                item.id === row.id
                                  ? { ...item, resolution: event.target.value }
                                  : item
                              ),
                            })
                          }
                        />
                      )}
                    </td>

                    {columns.map((column) => {
                      const isBaseCell = rowIndex === 0 && column.key === '--'
                      const ratioLabel = isBaseCell
                        ? ''
                        : getVideoTierRatioLabel(
                            basePrice,
                            row.prices[column.key]
                          )
                      return (
                        <td key={column.key}>
                          <Input
                            className='w-full px-2'
                            inputMode='decimal'
                            value={row.prices[column.key]}
                            placeholder={isBaseCell ? '46' : ''}
                            aria-label={`${columnLabel(column)} ${
                              rowIndex === 0
                                ? t('Base tier')
                                : row.resolution || t('Output resolution')
                            }`}
                            onChange={(event) =>
                              setCell(row.id, column.key, event.target.value)
                            }
                          />
                          <span className='text-muted-foreground block h-4 font-mono text-xs'>
                            {ratioLabel}
                          </span>
                        </td>
                      )
                    })}

                    <td>
                      {rowIndex > 0 && (
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          aria-label={t('Remove resolution')}
                          onClick={() =>
                            props.onChange({
                              ...props.draft,
                              rows: props.draft.rows.filter(
                                (item) => item.id !== row.id
                              ),
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {props.draft.axes.resolution && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() =>
                props.onChange({
                  ...props.draft,
                  rows: [...props.draft.rows, createVideoPriceMatrixRow()],
                })
              }
            >
              <Plus data-icon='inline-start' />
              {t('Add resolution')}
            </Button>
          )}

          <FieldDescription>
            {t(
              'Copy the vendor price table as published. Leave a cell blank when the vendor does not price that combination separately.'
            )}
          </FieldDescription>
          <FieldDescription>
            {t(
              'Vendor list price for the tier the model ratio already covers. Only the ratio between prices matters, so any currency works as long as every tier of this model uses the same one.'
            )}
          </FieldDescription>

          {props.errorMessage && (
            <p className='text-destructive text-xs'>{props.errorMessage}</p>
          )}
        </div>
      )}
    </SettingsControlGroup>
  )
}
