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
import { describe, expect, test } from 'vitest'

import { channelSchema } from '../../types'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  transformChannelToFormDefaults,
  transformFormDataToCreatePayload,
  transformFormDataToUpdatePayload,
} from '../channel-form'
import { hasAdvancedSettingsErrors } from '../channel-form-errors'

const channel = channelSchema.parse({
  id: 12,
  type: 1,
  key: '',
  status: 1,
  name: 'Reasoning upstream',
  created_time: 0,
  test_time: 0,
  response_time: 0,
  balance_updated_time: 0,
  used_quota: 0,
  models: 'gpt-5.6-sol',
})

describe('channel reasoning effort suffix setting', () => {
  test('new and existing channels without the setting keep conversion disabled', () => {
    expect(CHANNEL_FORM_DEFAULT_VALUES.reasoning_effort_to_model_suffix).toBe(
      false
    )
    expect(
      transformChannelToFormDefaults(channel).reasoning_effort_to_model_suffix
    ).toBe(false)
    const payload = transformFormDataToCreatePayload(
      CHANNEL_FORM_DEFAULT_VALUES
    )
    expect(JSON.parse(payload.channel.setting ?? '{}')).toMatchObject({
      reasoning_effort_to_model_suffix: false,
    })
  })

  test('saving and reopening an enabled channel retains conversion alongside passthrough', () => {
    const form = {
      ...transformChannelToFormDefaults(channel),
      reasoning_effort_to_model_suffix: true,
      pass_through_body_enabled: true,
    }
    const created = transformFormDataToCreatePayload(form)
    expect(JSON.parse(created.channel.setting ?? '{}')).toMatchObject({
      reasoning_effort_to_model_suffix: true,
      pass_through_body_enabled: true,
    })
    const reopened = transformChannelToFormDefaults({
      ...channel,
      ...created.channel,
    })
    expect(reopened.reasoning_effort_to_model_suffix).toBe(true)
    expect(reopened.pass_through_body_enabled).toBe(true)
  })

  test('disabling conversion persists when an existing channel is saved again', () => {
    const form = transformChannelToFormDefaults({
      ...channel,
      setting: JSON.stringify({ reasoning_effort_to_model_suffix: true }),
    })
    const updated = transformFormDataToUpdatePayload(
      { ...form, reasoning_effort_to_model_suffix: false },
      channel.id
    )
    expect(JSON.parse(updated.setting ?? '{}')).toMatchObject({
      reasoning_effort_to_model_suffix: false,
    })
    expect(
      transformChannelToFormDefaults({ ...channel, ...updated })
        .reasoning_effort_to_model_suffix
    ).toBe(false)
  })

  test('a conversion setting error reveals the advanced settings section', () => {
    expect(
      hasAdvancedSettingsErrors({
        reasoning_effort_to_model_suffix: { message: 'Invalid setting' },
      })
    ).toBe(true)
  })
})
