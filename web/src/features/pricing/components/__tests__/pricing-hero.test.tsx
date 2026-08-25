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
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { PricingHero } from '../pricing-hero'

const useSystemConfigMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: useSystemConfigMock,
}))

describe('PricingHero', () => {
  beforeEach(() => {
    useSystemConfigMock.mockReturnValue({ systemName: 'New API' })
  })

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

    const searchAnchor = screen.getByTestId('pricing-hero-search')
    expect(searchAnchor).toHaveClass('xl:mt-[60px]')
    expect(searchAnchor).toContainElement(
      screen.getByRole('textbox', { name: 'Search models' })
    )
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

    const cards = document.querySelectorAll<HTMLElement>(
      '[data-pricing-decoration-card]'
    )
    const frames = document.querySelectorAll<HTMLElement>(
      '[data-pricing-decoration-frame]'
    )

    expect(cards).toHaveLength(3)
    expect(frames[0]).toHaveClass('z-10')
    expect(frames[1]).toHaveClass('z-30')
    expect(frames[2]).toHaveClass('z-20')
    expect(cards[0].className).toContain(
      'linear-gradient(122.38121533446842deg,#fff195_0%,#ffc4ab_29%,#fff6ec_50%)'
    )
    expect(cards[1].className).toContain(
      'linear-gradient(122.20633430499932deg,#fff1d0_0%,#ff4e93_22.5%,#7c4dff_50%)'
    )
    expect(cards[2].className).toContain(
      'linear-gradient(147.16433007803062deg,#2bffd0_10.299%,#dbfff4_40.299%,#f0ff4a_60.299%)'
    )
  })

  test('positions rotated cards inside the Figma reference frames', () => {
    render(
      <PricingHero
        searchValue=''
        onSearchChange={() => undefined}
        onClearSearch={() => undefined}
      />
    )

    const stage = document.querySelector('[data-pricing-decoration-stage]')
    expect(stage).toHaveClass(
      'w-[980px]',
      'h-[596px]',
      'origin-bottom-right',
      'lg:scale-[0.62]',
      'xl:scale-[0.82]',
      'min-[1720px]:!scale-100',
      'lg:top-[92px]',
      'xl:top-[211px]',
      'min-[1720px]:!top-[318px]'
    )

    const frames = document.querySelectorAll('[data-pricing-decoration-frame]')
    expect(frames).toHaveLength(3)
    expect(frames[0]).toHaveClass(
      'top-[16px]',
      'left-[263.02px]',
      'h-[510.215px]',
      'w-[362.919px]',
      'z-10'
    )
    expect(frames[1]).toHaveClass(
      'top-0',
      'left-[389.79px]',
      'h-[569.076px]',
      'w-[407.894px]',
      'z-30'
    )
    expect(frames[2]).toHaveClass(
      'top-[102px]',
      'left-[603.02px]',
      'h-[494.422px]',
      'w-[377.04px]',
      'z-20'
    )

    const cards = document.querySelectorAll('[data-pricing-decoration-card]')
    expect(cards[0]).toHaveClass('h-[473.067px]', 'w-[300px]', '-rotate-[8deg]')
    expect(cards[1]).toHaveClass('h-[523.903px]', 'w-[330px]', 'rotate-[9deg]')
    expect(cards[2]).toHaveClass('h-[441.629px]', 'w-[285px]', 'rotate-[13deg]')
  })

  test('uses the configured site name as every card brand without hiding project attribution', () => {
    const longSystemName = 'ConfiguredModelWorkspace'.repeat(8)
    useSystemConfigMock.mockReturnValue({ systemName: longSystemName })

    render(
      <PricingHero
        searchValue=''
        onSearchChange={() => undefined}
        onClearSearch={() => undefined}
      />
    )

    const cardBrands = screen.getAllByTestId('pricing-decoration-brand')
    expect(cardBrands).toHaveLength(3)
    for (const brand of cardBrands) {
      expect(brand).toHaveTextContent(longSystemName)
      expect(brand).toHaveClass('right-[100px]', 'truncate')
    }

    expect(
      screen.getAllByTestId('pricing-decoration-attribution')
    ).toHaveLength(3)
    expect(screen.getAllByText('New API')).toHaveLength(3)
  })

  test('uses the default project name when the configured site name is blank', () => {
    useSystemConfigMock.mockReturnValue({ systemName: '   ' })

    render(
      <PricingHero
        searchValue=''
        onSearchChange={() => undefined}
        onClearSearch={() => undefined}
      />
    )

    for (const brand of screen.getAllByTestId('pricing-decoration-brand')) {
      expect(brand).toHaveTextContent('New API')
    }
  })
})
