/*
Copyright (C) 2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { describe, expect, it } from 'vitest'

import { getResolvedColumnClassNameFromMap } from '../column-pinning'

describe('data table column pinning', () => {
  it('keeps a left-pinned column visible with an opaque header and cell layer', () => {
    const getColumnClassName = getResolvedColumnClassNameFromMap(
      (columnId, kind) =>
        columnId === 'model' && kind === 'cell' ? 'min-w-56' : undefined,
      new Map([
        [
          'model',
          {
            columnId: 'model',
            side: 'left' as const,
            headerClassName: 'border-r',
            cellClassName: 'bg-card',
          },
        ],
      ])
    )

    const headerClassName = getColumnClassName('model', 'header')
    const cellClassName = getColumnClassName('model', 'cell')

    expect(headerClassName).toEqual(expect.stringContaining('sticky'))
    expect(headerClassName).toEqual(expect.stringContaining('left-0'))
    expect(headerClassName).toEqual(expect.stringContaining('z-30'))
    expect(headerClassName).toEqual(expect.stringContaining('border-r'))
    expect(cellClassName).toEqual(expect.stringContaining('sticky'))
    expect(cellClassName).toEqual(expect.stringContaining('left-0'))
    expect(cellClassName).toEqual(expect.stringContaining('z-10'))
    expect(cellClassName).toEqual(expect.stringContaining('bg-card'))
    expect(cellClassName).toEqual(expect.stringContaining('min-w-56'))
  })

  it('does not change unpinned columns', () => {
    const getColumnClassName = getResolvedColumnClassNameFromMap(
      (columnId) => (columnId === 'price' ? 'text-right' : undefined),
      new Map([['model', { columnId: 'model', side: 'left' as const }]])
    )

    expect(getColumnClassName('price', 'header')).toBe('text-right')
    expect(getColumnClassName('price', 'cell')).toBe('text-right')
    expect(getColumnClassName('unknown', 'header')).toBeUndefined()
  })
})
