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
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, test } from 'vitest'

import { SearchBar } from '../search-bar'

function SearchBarHarness() {
  const [value, setValue] = useState('')

  return (
    <SearchBar value={value} onChange={setValue} onClear={() => setValue('')} />
  )
}

describe('SearchBar', () => {
  test('focuses the model search field with Ctrl+K and clears its query', () => {
    render(<SearchBarHarness />)

    const input = screen.getByRole('textbox', { name: 'Search models' })
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(input).toHaveFocus()

    fireEvent.change(input, { target: { value: 'gpt' } })
    expect(input).toHaveValue('gpt')

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(input).toHaveValue('')
  })
})
