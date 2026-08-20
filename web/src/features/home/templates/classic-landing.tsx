/*
Copyright (C) 2023-2026 QuantumNous

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
import { Footer } from '@/components/layout/components/footer'

import { CTA, Features, Hero, HowItWorks, Stats } from '../components'
import type { ClassicLandingContent } from '../types'

interface ClassicLandingProps {
  content?: unknown
  isAuthenticated: boolean
}
/**
 * Default landing template. Renders the hero + optional sections, honoring
 * per-section visibility toggles and editable content. Unset fields fall back
 * to the built-in i18n defaults inside each section component.
 */
export function ClassicLanding({
  content,
  isAuthenticated,
}: ClassicLandingProps) {
  const c = content as Partial<ClassicLandingContent> | undefined
  const sections = c?.sections

  return (
    <>
      <Hero isAuthenticated={isAuthenticated} content={c?.hero} />
      {(sections?.features ?? true) && <Features content={c?.features} />}
      {(sections?.cta ?? true) && <CTA isAuthenticated={isAuthenticated} />}
      {(sections?.howItWorks ?? true) && <HowItWorks />}
      {(sections?.stats ?? true) && <Stats />}
      <Footer />
    </>
  )
}
