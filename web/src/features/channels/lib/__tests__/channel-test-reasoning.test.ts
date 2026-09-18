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
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { handleTestChannel } from '../channel-actions'

afterEach(() => vi.restoreAllMocks())

describe('channel test reasoning request', () => {
  test.each(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])(
    'explicit %s effort reaches the channel test API without changing the base model',
    async (reasoningEffort) => {
      const get = vi
        .spyOn(api, 'get')
        .mockResolvedValue({ data: { success: true } })
      await handleTestChannel(12, {
        testModel: 'gpt-5.6-sol',
        endpointType: 'openai-response',
        reasoningEffort,
        silent: true,
      })
      expect(get).toHaveBeenCalledWith(
        '/api/channel/test/12',
        expect.objectContaining({
          params: {
            model: 'gpt-5.6-sol',
            endpoint_type: 'openai-response',
            reasoning_effort: reasoningEffort,
          },
        })
      )
    }
  )

  test('default effort omits the query parameter and preserves ordinary tests', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: { success: true } })
    await handleTestChannel(12, { testModel: 'gpt-5.6-sol', silent: true })
    expect(get).toHaveBeenCalledWith(
      '/api/channel/test/12',
      expect.objectContaining({
        params: { model: 'gpt-5.6-sol' },
      })
    )
  })
})
