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

For commercial licensing, please contact support@quantumnous.com
*/
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { Features } from '../features'

let resolvedLanguage = 'en'

vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage },
  }),
}))

afterEach(() => {
  cleanup()
  resolvedLanguage = 'en'
})

describe('Features heading layout', () => {
  test('gives the English desktop heading enough width while preserving the card grid position', () => {
    render(<Features />)

    const heading = screen.getByTestId('home-features-heading')
    expect(heading).toHaveClass(
      'min-[1272px]:w-[560px]',
      'min-[1272px]:h-[110px]',
      'min-[1272px]:leading-[51px]'
    )
    expect(heading).toHaveTextContent('Built for developers,designed for scale')
    expect(screen.getByTestId('home-features-bento-grid')).toHaveClass(
      'min-[1272px]:top-[300px]'
    )
  })

  test('keeps the established Chinese desktop heading width', () => {
    resolvedLanguage = 'zh'

    render(<Features />)

    const heading = screen.getByTestId('home-features-heading')
    expect(heading).toHaveClass('min-[1272px]:w-[430px]')
    expect(heading).not.toHaveClass('min-[1272px]:w-[560px]')
  })
})
