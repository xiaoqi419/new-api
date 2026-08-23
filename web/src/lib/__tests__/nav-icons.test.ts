import { Home, Users as LucideUsers } from 'lucide-react'
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
import { describe, expect, test } from 'vitest'

import {
  DEFAULT_NAV_ICONS,
  NAV_ICON_NAMES,
  navIconFor,
  navIconNameFor,
  resolveNavIcon,
} from '../nav-icons'

describe('navigation icon resolver', () => {
  test('resolves current Lucide names and safely ignores empty or unknown values', () => {
    expect(resolveNavIcon('Home')).toBe(Home)
    expect(resolveNavIcon('')).toBeNull()
    expect(resolveNavIcon(null)).toBeNull()
    expect(resolveNavIcon('NotAnInstalledLucideIcon')).toBeNull()
  })

  test('keeps default and explicit empty header icon configuration semantics', () => {
    for (const iconName of Object.values(DEFAULT_NAV_ICONS)) {
      expect(NAV_ICON_NAMES).toContain(iconName)
      expect(resolveNavIcon(iconName)).not.toBeNull()
    }

    expect(navIconNameFor(undefined, 'home')).toBe('Home')
    expect(navIconNameFor({ home: 'Gauge' }, 'home')).toBe('Gauge')
    expect(navIconNameFor({ home: '' }, 'home')).toBeUndefined()
  })

  test('keeps the standalone community entry on Lucide and honors no-icon settings', () => {
    expect(navIconFor(undefined, 'community')).toBe(LucideUsers)
    expect(navIconFor({ community: '' }, 'community')).toBeNull()
    expect(
      navIconFor({ community: 'NotAnInstalledLucideIcon' }, 'community')
    ).toBeNull()
  })
})
