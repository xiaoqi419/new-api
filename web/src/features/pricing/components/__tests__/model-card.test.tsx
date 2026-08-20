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
import { describe, expect, test, vi } from 'vitest'

import type { PricingModel } from '../../types'
import { ModelCard } from '../model-card'

const copyToClipboard = vi.fn()

vi.mock('@/hooks/use-copy-to-clipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard }),
}))

vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: () => null,
}))

const model: PricingModel = {
  id: 1,
  model_name: 'gpt-5.4-mini-with-a-very-long-name',
  description: 'A concise model description for layout coverage.',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
}

describe('ModelCard', () => {
  test('opens the selected model while preserving the fixed desktop card geometry', () => {
    const onClick = vi.fn()
    render(<ModelCard model={model} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button', { name: model.model_name }))
    expect(onClick).toHaveBeenCalledOnce()

    const card = document.querySelector('[data-pricing-model-card]')
    expect(card).toHaveClass('rounded-[16px]', 'xl:h-[142px]')

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(copyToClipboard).toHaveBeenCalledWith(model.model_name)
    expect(onClick).toHaveBeenCalledOnce()
  })

  test('removes hover motion and transitions when reduced motion is requested', () => {
    render(<ModelCard model={model} onClick={() => undefined} />)

    const card = document.querySelector('[data-pricing-model-card]')
    expect(card).toHaveClass(
      'motion-reduce:transition-none',
      'motion-reduce:hover:translate-y-0'
    )
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveClass(
      'motion-reduce:transition-none'
    )
  })
})
