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

import { getAnnouncementSummary } from '../lib/announcement-summary'

describe('getAnnouncementSummary', () => {
  test('converts Markdown to a compact plain-text summary for list surfaces', () => {
    expect(
      getAnnouncementSummary(
        '## Scheduled maintenance\n\nThe **gateway** will be unavailable. [Details](https://example.test)'
      )
    ).toBe('Scheduled maintenance The gateway will be unavailable. Details')
  })

  test('truncates at the requested length without splitting Unicode characters', () => {
    expect(getAnnouncementSummary('Alpha beta gamma', 10)).toBe('Alpha beta…')
    expect(getAnnouncementSummary('通知公告内容', 4)).toBe('通知公告…')
  })

  test('preserves inline model identifiers while flattening Markdown tables', () => {
    expect(
      getAnnouncementSummary(
        'Deploy `kimi-k3` now.\n\n| Model | Status |\n| --- | --- |\n| kimi-k3 | Ready |'
      )
    ).toBe('Deploy kimi-k3 now. Model Status kimi-k3 Ready')
  })
})
