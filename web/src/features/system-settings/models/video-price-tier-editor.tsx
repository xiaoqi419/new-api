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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import {
  createVideoPriceTierDraft,
  getVideoTierRatioLabel,
  numericDraftRegex,
  type VideoPriceDraft,
  type VideoPriceTierDraft,
} from './model-pricing-core'

type VideoPriceTierEditorProps = {
  draft: VideoPriceDraft
  errorMessage?: string | null
  onChange: (next: VideoPriceDraft) => void
}

export function VideoPriceTierEditor(props: VideoPriceTierEditorProps) {
  const { t } = useTranslation()

  const updateTier = (id: string, patch: Partial<VideoPriceTierDraft>) => {
    props.onChange({
      ...props.draft,
      tiers: props.draft.tiers.map((tier) =>
        tier.id === id ? { ...tier, ...patch } : tier
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
        label={t('Video tier pricing')}
        description={t(
          'Charge video models differently by output resolution, video input, or audio output.'
        )}
        aria-label={t('Video tier pricing')}
      />

      {props.draft.enabled && (
        <div className='space-y-4'>
          <Field>
            <FieldLabel htmlFor='video-tier-base-price'>
              {t('Base tier unit price')}
            </FieldLabel>
            <Input
              id='video-tier-base-price'
              inputMode='decimal'
              value={props.draft.basePrice}
              placeholder='46'
              onChange={(event) => {
                const value = event.target.value
                if (!numericDraftRegex.test(value)) return
                props.onChange({ ...props.draft, basePrice: value })
              }}
            />
            <FieldDescription>
              {t(
                'Vendor list price for the tier the model ratio already covers. Only the ratio between prices matters, so any currency works as long as every tier of this model uses the same one.'
              )}
            </FieldDescription>
          </Field>

          {props.draft.tiers.length === 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('No tiers yet. Add one for each price the vendor lists.')}
            </p>
          ) : (
            <div className='space-y-3'>
              {props.draft.tiers.map((tier) => {
                const ratioLabel = getVideoTierRatioLabel(
                  props.draft.basePrice,
                  tier.price
                )
                return (
                  <div
                    key={tier.id}
                    className='bg-background space-y-3 rounded-lg border p-3'
                  >
                    <div className='flex flex-wrap items-center gap-2'>
                      <Input
                        className='w-28'
                        value={tier.resolution}
                        placeholder='1080p'
                        aria-label={t('Output resolution')}
                        onChange={(event) =>
                          updateTier(tier.id, {
                            resolution: event.target.value,
                          })
                        }
                      />
                      <InputGroup className='min-w-40 flex-1'>
                        <InputGroupInput
                          inputMode='decimal'
                          value={tier.price}
                          placeholder='51'
                          aria-label={t('Tier unit price')}
                          onChange={(event) => {
                            const value = event.target.value
                            if (!numericDraftRegex.test(value)) return
                            updateTier(tier.id, { price: value })
                          }}
                        />
                        {ratioLabel && (
                          <InputGroupAddon align='inline-end'>
                            {ratioLabel}
                          </InputGroupAddon>
                        )}
                      </InputGroup>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={t('Remove tier')}
                        onClick={() =>
                          props.onChange({
                            ...props.draft,
                            tiers: props.draft.tiers.filter(
                              (item) => item.id !== tier.id
                            ),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>

                    <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
                      <div className='flex items-center gap-2'>
                        <Switch
                          id={`${tier.id}-video`}
                          checked={tier.hasVideo}
                          onCheckedChange={(checked) =>
                            updateTier(tier.id, { hasVideo: checked })
                          }
                        />
                        <Label
                          htmlFor={`${tier.id}-video`}
                          className='text-sm font-normal'
                        >
                          {t('Request includes video input')}
                        </Label>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Switch
                          id={`${tier.id}-audio`}
                          checked={tier.hasAudio}
                          onCheckedChange={(checked) =>
                            updateTier(tier.id, { hasAudio: checked })
                          }
                        />
                        <Label
                          htmlFor={`${tier.id}-audio`}
                          className='text-sm font-normal'
                        >
                          {t('Output has audio')}
                        </Label>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className='flex flex-wrap items-center gap-3'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() =>
                props.onChange({
                  ...props.draft,
                  tiers: [...props.draft.tiers, createVideoPriceTierDraft()],
                })
              }
            >
              <Plus data-icon='inline-start' />
              {t('Add tier')}
            </Button>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Leave the resolution blank when a tier applies to every resolution. Do not repeat the base tier here.'
              )}
            </p>
          </div>

          {props.errorMessage && (
            <p className='text-destructive text-xs'>{props.errorMessage}</p>
          )}
        </div>
      )}
    </SettingsControlGroup>
  )
}
