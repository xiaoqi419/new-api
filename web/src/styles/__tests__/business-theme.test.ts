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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const themeCss = readFileSync(
  resolve(process.cwd(), 'src/styles/theme.css'),
  'utf8'
)

const businessTokens = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'info',
  'info-foreground',
  'neutral',
  'neutral-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'tag-1',
  'tag-2',
  'tag-3',
  'tag-4',
  'tag-5',
  'overview-accent-1',
  'overview-accent-2',
  'overview-accent-3',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  'skeleton-base',
  'skeleton-highlight',
  'table-row',
  'table-header',
  'table-header-hover',
  'table-disabled',
  'table-disabled-hover',
  'table-disabled-border',
]

function getPaletteBlock(selector: ':root' | '.dark'): string {
  const background =
    selector === ':root'
      ? '--business-background: #ffffff;'
      : '--business-background: #1f1f1f;'
  const declaration = themeCss.indexOf(background)
  const start = themeCss.lastIndexOf(`${selector} {`, declaration)
  const end = themeCss.indexOf('\n}', declaration)
  return themeCss.slice(start, end)
}

describe('business theme tokens', () => {
  test('defines the complete business palette in light and dark modes', () => {
    const light = getPaletteBlock(':root')
    const dark = getPaletteBlock('.dark')

    for (const token of businessTokens) {
      expect(light, `missing light --business-${token}`).toContain(
        `--business-${token}:`
      )
      expect(dark, `missing dark --business-${token}`).toContain(
        `--business-${token}:`
      )
    }
  })

  test('aliases every generic business-shell token to its business source', () => {
    for (const token of businessTokens) {
      expect(themeCss, `missing generic alias for ${token}`).toContain(
        `--${token}: var(--business-${token});`
      )
    }
  })

  test('removes the legacy pink theme while preserving scoped and brand colors', () => {
    for (const legacy of [
      '浅粉基底',
      '图表走粉系',
      '白里透粉',
      '深梅',
      'oklch(0.72 0.15 352)',
      'oklch(0.205 0.014 342)',
    ]) {
      expect(themeCss).not.toContain(legacy)
    }

    expect(themeCss).toContain('--brand-wordmark-to: #f072d3;')
    expect(themeCss).toContain('--home-primary: #2f00e5;')
    expect(themeCss).toContain('--home-accent: #d4ff1f;')
  })
})
