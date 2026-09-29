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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../api'
import { MonitorGroupCard } from '../group-card'

describe('MonitorGroupCard', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const mockGroup: api.PelicanGroupCard = {
    name: 'default',
    description: 'Default Group',
    model: 'gpt-4o',
    reasoning: 'medium',
    ratio: 1.5,
    has_key: true,
    health: 'normal',
    logic: {
      passed: 48,
      judged: 48,
      avg_latency_ms: 850,
      latest: {
        id: 1,
        status: 'pass',
        slot_start: 1727500000,
        created_at: 1727500005,
        latency_ms: 850,
      },
      slots: [
        { start: 1727500000, status: 'pass', id: 1 },
        { start: 1727501800, status: 'pass', id: 2 },
      ],
    },
    drawing: {
      passed: 47,
      judged: 48,
      avg_latency_ms: 2100,
      latest: {
        id: 10,
        status: 'pass',
        slot_start: 1727500000,
        created_at: 1727500010,
        latency_ms: 2100,
        subject: 'Pelican',
        vehicle: 'bicycle',
        scene: 'beach',
      },
      slots: [
        { start: 1727500000, status: 'pass', id: 10 },
        { start: 1727501800, status: 'pass', id: 11 },
      ],
    },
    artwork: null,
  }

  const mockLabels = {
    health: (h: string) => (h === 'normal' ? 'At full strength' : 'Possibly degraded'),
    status: (s: string) => s,
    logic: 'Logic test',
    logicHint: 'The answer should be 21',
    drawing: 'Drawing test',
    drawingHint: 'Random SVG of pelican',
    correct: '48/48 correct',
    drawn: '47/48 drawn',
    waiting: 'Waiting for the first check',
    ago: () => '2 minutes ago',
    block: (s: string) => s,
    noToken: 'This group has no enabled token yet.',
    caption:
      'Select any drawing block on the left to replay its animation in the isolated sandbox.',
  }

  it('clicking drawing block does not open dialog; clicking sandbox opens dialog', async () => {
    vi.spyOn(api, 'fetchPelicanProbe').mockResolvedValue({
      id: 10,
      group_name: 'default',
      kind: 'drawing',
      status: 'pass',
      slot_start: 1727500000,
      created_at: 1727500005,
      model: 'gpt-4o',
      reasoning: 'medium',
      latency_ms: 1200,
      ttft_ms: 400,
      input_tokens: 50,
      output_tokens: 200,
      attempts: 1,
      answer: '',
      expected: '',
      prompt: 'draw something',
      reply: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>',
      drawing_html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>',
      subject: 'Pelican',
      vehicle: 'bicycle',
      scene: 'beach',
      error: '',
    })

    const onOpen = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <MonitorGroupCard
          group={mockGroup}
          nowSec={1727500120}
          labels={mockLabels}
          onOpen={onOpen}
        />
      </QueryClientProvider>
    )

    // Check titles and captions
    expect(screen.getByText('Default Group')).toBeTruthy()
    expect(screen.getByText('Logic test')).toBeTruthy()
    expect(screen.getByText('Drawing test')).toBeTruthy()

    // Find drawing block for slot 11
    const buttons = screen.getAllByRole('button')
    const drawingButton11 = buttons.find((b) => b.getAttribute('title')?.includes('11')) || buttons[3]

    // Click drawing block: it should NOT call onOpen
    fireEvent.click(drawingButton11)
    expect(onOpen).not.toHaveBeenCalled()

    // Find the right sandbox button
    const sandboxButton = await screen.findByRole('button', { name: /Pelican/i })
    expect(sandboxButton).toBeTruthy()

    // Click the sandbox button: it SHOULD call onOpen
    fireEvent.click(sandboxButton)
    expect(onOpen).toHaveBeenCalledWith(11)
  })

  it('shows no token warning when has_key is false', () => {
    const onOpen = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <MonitorGroupCard
          group={{ ...mockGroup, has_key: false }}
          nowSec={1727500120}
          labels={mockLabels}
          onOpen={onOpen}
        />
      </QueryClientProvider>
    )

    expect(screen.getByText('This group has no enabled token yet.')).toBeTruthy()
  })
})
