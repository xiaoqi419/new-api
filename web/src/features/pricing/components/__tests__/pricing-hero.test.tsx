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
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { PricingHero } from '../pricing-hero'

describe('PricingHero', () => {
  test('keeps the desktop description and search structure stable while loading', () => {
    render(
      <PricingHero
        searchValue=''
        onSearchChange={() => undefined}
        onClearSearch={() => undefined}
      />
    )

    const description = document.querySelector('[data-pricing-description]')
    expect(description).toHaveClass(
      'min-h-[56px]',
      'xl:min-h-[58px]',
      'xl:leading-[29px]'
    )
    expect(description).toHaveTextContent('Loading...')

    const input = screen.getByRole('textbox', { name: 'Search models' })
    expect(input.parentElement).toHaveClass('xl:mt-[60px]')
  })

  test('renders the full model description when data is available', () => {
    render(
      <PricingHero
        modelCount={42}
        searchValue=''
        onSearchChange={() => undefined}
        onClearSearch={() => undefined}
      />
    )

    expect(
      document.querySelector('[data-pricing-description]')
    ).toHaveTextContent(
      'This site currently has 42 models enabled. Explore featured AI models, compare prices and capabilities, and choose the right model for each scenario.'
    )
  })

  test('keeps decorative card entrance motion opt-in and reduced-motion safe', () => {
    render(
      <PricingHero
        searchValue=''
        onSearchChange={() => undefined}
        onClearSearch={() => undefined}
      />
    )

    const decorationCards = document.querySelectorAll(
      '[data-pricing-decoration-card]'
    )
    expect(decorationCards).toHaveLength(3)
    for (const card of decorationCards) {
      expect(card).toHaveClass(
        'motion-safe:animate-in',
        'motion-safe:fade-in-0',
        'motion-safe:duration-700',
        'motion-reduce:animate-none'
      )
    }
  })

  test('keeps the reference card palette and center card in front', () => {
    render(
      <PricingHero
        searchValue=''
        onSearchChange={() => undefined}
        onClearSearch={() => undefined}
      />
    )

    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-pricing-decoration-card]'
      ),
    ].map((card) => card.parentElement)

    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveClass('z-10')
    expect(cards[1]).toHaveClass('z-30')
    expect(cards[2]).toHaveClass('z-20')
    expect(cards[0]?.className).toContain(
      'linear-gradient(122.38121533446842deg,#fff195_0%,#ffc4ab_29%,#fff6ec_50%)'
    )
    expect(cards[1]?.className).toContain(
      'linear-gradient(122.20633430499932deg,#fff1d0_0%,#ff4e93_22.5%,#7c4dff_50%)'
    )
    expect(cards[2]?.className).toContain(
      'linear-gradient(147.16433007803062deg,#2bffd0_10.299%,#dbfff4_40.299%,#f0ff4a_60.299%)'
    )
  })
})
