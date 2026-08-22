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
import { createSectionRegistry } from '@/features/system-settings/utils/section-registry'

/**
 * Playground page section definitions: chat playground + image / video
 * generation, presented as horizontal tabs under a single route.
 */
const PLAYGROUND_SECTIONS = [
  {
    id: 'chat',
    titleKey: 'Chat',
    build: () => null,
  },
  {
    id: 'image',
    titleKey: 'Image Generation',
    build: () => null,
  },
  {
    id: 'video',
    titleKey: 'Video Generation',
    build: () => null,
  },
] as const

export type PlaygroundSectionId = (typeof PLAYGROUND_SECTIONS)[number]['id']

const playgroundRegistry = createSectionRegistry<
  PlaygroundSectionId,
  Record<string, never>,
  []
>({
  sections: PLAYGROUND_SECTIONS,
  defaultSection: 'chat',
  basePath: '/playground',
  urlStyle: 'path',
})

export const PLAYGROUND_SECTION_IDS = playgroundRegistry.sectionIds
export const PLAYGROUND_DEFAULT_SECTION = playgroundRegistry.defaultSection

export function isPlaygroundSectionId(s: string): s is PlaygroundSectionId {
  return (PLAYGROUND_SECTION_IDS as readonly string[]).includes(s)
}
