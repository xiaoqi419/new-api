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
import type { TFunction } from 'i18next'
import type { ComponentType } from 'react'

import type { TemplateContent } from '../types'
import { ClassicLanding } from './classic-landing'
import { CliQuickstart } from './cli-quickstart'
import { getDefaultClassicContent, getDefaultCliContent } from './defaults'

/**
 * Metadata + renderer for one selectable home page template. Add an entry here
 * (plus its default content in getTemplateDefaultContent) to ship a new
 * homepage design that admins can switch to.
 */
export interface HomeTemplateMeta {
  id: string
  /** i18n key for the display name. */
  nameKey: string
  /** i18n key for the description. */
  descriptionKey: string
  Component: ComponentType<{
    content?: unknown
    isAuthenticated: boolean
  }>
}

export const DEFAULT_TEMPLATE_ID = 'classic-landing'

export const HOME_TEMPLATES: HomeTemplateMeta[] = [
  {
    id: 'classic-landing',
    nameKey: 'Classic Landing',
    descriptionKey:
      'Animated landing page: hero, features, stats, steps and CTA',
    Component: ClassicLanding,
  },
  {
    id: 'cli-quickstart',
    nameKey: 'CLI Quickstart',
    descriptionKey:
      'Developer onboarding: terminal install + config for Claude Code, Codex and Gemini CLIs, with a roadmap',
    Component: CliQuickstart,
  },
]

/** Returns the requested template, falling back to the first registered one. */
export function getHomeTemplate(id: string | undefined): HomeTemplateMeta {
  return HOME_TEMPLATES.find((tpl) => tpl.id === id) ?? HOME_TEMPLATES[0]
}

/** Built-in default content for a template, used for admin editor pre-fill. */
export function getTemplateDefaultContent(
  id: string,
  t: TFunction
): TemplateContent {
  switch (id) {
    case 'cli-quickstart':
      return getDefaultCliContent(t)
    case 'classic-landing':
    default:
      return getDefaultClassicContent(t)
  }
}
