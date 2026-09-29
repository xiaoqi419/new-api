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
import { describe, expect, it, vi } from 'vitest'

import type { PelicanSlot } from '../api'
import { ProbeBlocks } from '../blocks'

describe('ProbeBlocks', () => {
  const labelFor = (status: string) => {
    const map: Record<string, string> = {
      pass: 'Passed',
      fail: 'Failed',
      error: 'Request failed',
      running: 'Checking',
      empty: 'No data',
      now: 'Now',
    }
    return map[status] ?? status
  }

  const sampleSlots: PelicanSlot[] = [
    { start: 1727500000, status: 'pass', id: 101 },
    { start: 1727501800, status: 'fail', id: 102 },
    { start: 1727503600, status: 'error', id: 103 },
    { start: 1727505400, status: 'running', id: 104 },
    { start: 1727507200, status: 'empty' },
  ]

  it('renders all 5 states distinctly and triggers onOpen on click', () => {
    const onOpen = vi.fn()
    render(
      <ProbeBlocks
        slots={sampleSlots}
        labelFor={labelFor}
        selectedId={101}
        onOpen={onOpen}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)

    // Click on slot 102 (fail)
    fireEvent.click(buttons[1])
    expect(onOpen).toHaveBeenCalledWith(102)

    // Selected block (101) must NOT have black ring or inner shadow
    const selectedButton = buttons[0]
    expect(selectedButton).toHaveAttribute('aria-pressed', 'true')
    expect(selectedButton.className).not.toContain('ring-black')
    expect(selectedButton.className).not.toContain('border-black')
    expect(selectedButton.className).not.toContain('shadow-inner')
    expect(selectedButton.className).toContain('ring-sky-500')
  })

  it('renders empty slots without button role', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <ProbeBlocks
        slots={sampleSlots}
        labelFor={labelFor}
        onOpen={onOpen}
      />
    )

    const spans = container.querySelectorAll('span[title]')
    expect(spans.length).toBeGreaterThan(0)
    const emptySpan = [...spans].find((s) => s.getAttribute('title')?.includes('No data'))
    expect(emptySpan).toBeTruthy()
    expect(emptySpan?.className).toContain('bg-neutral-200')
  })
})
