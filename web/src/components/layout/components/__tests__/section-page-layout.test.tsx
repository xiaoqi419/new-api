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

import { PageFooterPortal } from '../page-footer'
import { SectionPageLayout } from '../section-page-layout'

describe('SectionPageLayout mobile safe area', () => {
  test('keeps scroll content vertically scrollable without horizontal overflow', () => {
    render(
      <SectionPageLayout>
        <SectionPageLayout.Title>Settings</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div data-testid='last-setting'>Last setting</div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )

    const content = screen.getByTestId('last-setting').parentElement

    expect(content).toHaveClass('overflow-x-hidden', 'overflow-y-auto')
    expect(content).toHaveClass(
      'pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]',
      'sm:pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]'
    )
  })

  test('keeps footer actions above the mobile gesture area with responsive minimum padding', async () => {
    render(
      <SectionPageLayout>
        <SectionPageLayout.Title>Settings</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div data-testid='last-setting'>Last setting</div>
          <PageFooterPortal>
            <button type='button'>Save settings</button>
          </PageFooterPortal>
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )

    const footerAction = await screen.findByRole('button', {
      name: 'Save settings',
    })
    const footer = footerAction.parentElement

    expect(footer).toHaveClass(
      'pb-[calc(env(safe-area-inset-bottom,0px)+0.625rem)]',
      'sm:pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]'
    )
  })
})
