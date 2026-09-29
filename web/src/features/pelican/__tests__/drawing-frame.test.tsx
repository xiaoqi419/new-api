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
import { DrawingFrame, DrawingStage } from '../drawing-frame'

describe('DrawingFrame and DrawingStage', () => {
  it('enforces allow-scripts sandbox and pointer-events-none when non-interactive', () => {
    const { container, rerender } = render(
      <DrawingFrame html='<svg viewBox="0 0 10 10"></svg>' title='Preview' interactive={false} />
    )

    const iframe = container.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(iframe?.className).toContain('pointer-events-none')
    expect(iframe?.style.zoom).toContain('100cqw')
    expect(iframe?.style.transform).toBe('')

    rerender(
      <DrawingFrame html='<svg viewBox="0 0 10 10"></svg>' title='Preview' interactive />
    )
    const interactiveFrame = container.querySelector('iframe')
    expect(interactiveFrame?.className).toContain('pointer-events-auto')
  })

  it('renders clickable preview stage when drawing HTML is available and calls onOpen', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.spyOn(api, 'fetchPelicanProbe').mockResolvedValueOnce({
      id: 88,
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
      reply: '```html\n<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>\n```',
      drawing_html: '',
      subject: 'Pelican',
      vehicle: 'bicycle',
      scene: 'park',
      error: '',
    })

    const onOpen = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <DrawingStage
          probeId={88}
          waitingLabel='Waiting for drawing'
          onOpen={onOpen}
        />
      </QueryClientProvider>
    )

    const button = await screen.findByRole('button', { name: /Pelican/i })
    expect(button).toBeTruthy()

    // Outer button is clickable
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledWith(88)

    // Inner iframe is pointer-events-none
    const iframe = button.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.className).toContain('pointer-events-none')
  })
})
