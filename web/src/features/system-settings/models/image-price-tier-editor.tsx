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
import { Button } from '@/components/ui/button'
import { FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import {
  createImagePriceTierRow,
  getTierRatioLabel,
  numericDraftRegex,
  type ImagePriceTierRow,
  type ImagePriceTiersDraft,
} from './model-pricing-core'

type ImagePriceTierEditorProps = {
  draft: ImagePriceTiersDraft
  errorMessage?: string | null
  /** The model's fixed price, which every tier price is stored relative to. */
  basePrice: string
  onChange: (next: ImagePriceTiersDraft) => void
}

export function ImagePriceTierEditor(props: ImagePriceTierEditorProps) {
  const { t } = useTranslation()

  const updateRow = (rowId: string, patch: Partial<ImagePriceTierRow>) => {
    props.onChange({
      ...props.draft,
      rows: props.draft.rows.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row
      ),
    })
  }

  return (
    <SettingsControlGroup className='space-y-4'>
      <SettingsSwitchField
        checked={props.draft.enabled}
        onCheckedChange={(checked) =>
          props.onChange({ ...props.draft, enabled: checked })
        }
        label={t('Image tier pricing')}
        description={t(
          'Charge image models differently by output size or quality.'
        )}
        aria-label={t('Image tier pricing')}
      />

      {props.draft.enabled && (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
            <Label htmlFor='image-base-size' className='text-sm font-medium'>
              {t('Base tier size')}
            </Label>
            <Input
              id='image-base-size'
              className='w-32 px-2'
              value={props.draft.baseSize}
              placeholder='1024x1024'
              onChange={(event) =>
                props.onChange({
                  ...props.draft,
                  baseSize: event.target.value,
                })
              }
            />
            <span className='text-muted-foreground text-xs'>
              {t('The output size the fixed price above already covers.')}
            </span>
          </div>

          <div className='overflow-x-auto'>
            <table className='w-full table-fixed border-separate border-spacing-x-1.5 border-spacing-y-1 text-sm'>
              <thead>
                <tr>
                  <th className='text-muted-foreground text-left text-xs font-medium'>
                    {t('Output size')}
                  </th>
                  <th className='text-muted-foreground text-left text-xs font-medium'>
                    {t('Quality')}
                  </th>
                  <th className='text-muted-foreground text-left text-xs font-medium'>
                    {t('Unit price')}
                  </th>
                  <th className='w-8' />
                </tr>
              </thead>
              <tbody>
                {props.draft.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Input
                        className='w-full px-2'
                        value={row.size}
                        placeholder={t('Any size')}
                        aria-label={t('Output size')}
                        onChange={(event) =>
                          updateRow(row.id, { size: event.target.value })
                        }
                      />
                    </td>

                    <td>
                      <Input
                        className='w-full px-2'
                        value={row.quality}
                        placeholder={t('Any quality')}
                        aria-label={t('Quality')}
                        onChange={(event) =>
                          updateRow(row.id, { quality: event.target.value })
                        }
                      />
                    </td>

                    <td>
                      <Input
                        className='w-full px-2'
                        inputMode='decimal'
                        value={row.price}
                        placeholder={props.basePrice}
                        aria-label={`${t('Unit price')} ${
                          row.size || t('Any size')
                        }`}
                        onChange={(event) => {
                          const value = event.target.value
                          if (!numericDraftRegex.test(value)) return
                          updateRow(row.id, { price: value })
                        }}
                      />
                      <span className='text-muted-foreground block h-4 font-mono text-xs'>
                        {getTierRatioLabel(props.basePrice, row.price)}
                      </span>
                    </td>

                    <td>
                      {props.draft.rows.length > 1 && (
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          aria-label={t('Remove tier')}
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

          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              props.onChange({
                ...props.draft,
                rows: [...props.draft.rows, createImagePriceTierRow()],
              })
            }
          >
            <Plus data-icon='inline-start' />
            {t('Add tier')}
          </Button>

          <FieldDescription>
            {t(
              'Every price is the final unit price for that size and quality, in the same unit as the fixed price above.'
            )}
          </FieldDescription>
          <FieldDescription>
            {t(
              'Sizes accept a tier name such as 2K or an exact size such as 2048x2048. Leave size or quality blank to price everything the table does not list.'
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
