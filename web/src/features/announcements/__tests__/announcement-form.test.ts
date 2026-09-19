import type { TFunction } from 'i18next'
/*
Copyright (C) 2026 QuantumNous

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

import { getAnnouncementFormSchema } from '../lib/announcement-form'

describe('announcement form schema', () => {
  test('accepts the centered announcement delivery level', () => {
    const schema = getAnnouncementFormSchema(
      ((key: string) => key) as TFunction
    )

    expect(
      schema.safeParse({
        title: 'Maintenance window',
        content: 'The gateway will restart.',
        type: 'system',
        level: 'modal',
        version: '',
        pinned: false,
        published: true,
        publish_time: 1_800_000_000,
      }).success
    ).toBe(true)
  })
})
