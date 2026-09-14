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
import assert from 'node:assert/strict'
import { describe, test, vi } from 'vitest'

import { ComingSoon } from '@/components/coming-soon'
import { CanvasStudio } from '@/features/canvas'

// The route only needs the component identity for this contract test. Mocking
// the feature boundary keeps Vitest in its Node environment from evaluating
// CanvasStudio's browser-only dependency graph (including emoji assets).
vi.mock('@/features/canvas', () => ({
  CanvasStudio: () => null,
}))

const routeModules = await Promise.all([
  import('@/routes/_authenticated/canvas'),
  import('@/routes/_authenticated/asset-library'),
  import('@/routes/_authenticated/agent-apply'),
])

describe('authenticated feature routes', () => {
  test('uses CanvasStudio for canvas while retired routes remain ComingSoon', () => {
    assert.equal(routeModules[0].Route.options.component, CanvasStudio)
    assert.equal(routeModules[1].Route.options.component, ComingSoon)
    assert.equal(routeModules[2].Route.options.component, ComingSoon)
  })
})
