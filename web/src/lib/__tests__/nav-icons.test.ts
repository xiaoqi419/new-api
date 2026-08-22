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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { Home, Users as LucideUsers } from 'lucide-react'

import {
  DEFAULT_NAV_ICONS,
  NAV_ICON_NAMES,
  navIconFor,
  navIconNameFor,
  resolveNavIcon,
} from '../nav-icons'

describe('navigation icon resolver', () => {
  test('resolves current Lucide names and safely ignores empty or unknown values', () => {
    assert.equal(resolveNavIcon('Home'), Home)
    assert.equal(resolveNavIcon(''), null)
    assert.equal(resolveNavIcon(null), null)
    assert.equal(resolveNavIcon('NotAnInstalledLucideIcon'), null)
  })

  test('keeps default and explicit empty header icon configuration semantics', () => {
    for (const iconName of Object.values(DEFAULT_NAV_ICONS)) {
      assert.ok(NAV_ICON_NAMES.includes(iconName))
      assert.notEqual(resolveNavIcon(iconName), null)
    }

    assert.equal(navIconNameFor(undefined, 'home'), 'Home')
    assert.equal(navIconNameFor({ home: 'Gauge' }, 'home'), 'Gauge')
    assert.equal(navIconNameFor({ home: '' }, 'home'), undefined)
  })

  test('keeps the standalone community entry on Lucide and honors no-icon settings', () => {
    assert.equal(navIconFor(undefined, 'community'), LucideUsers)
    assert.equal(navIconFor({ community: '' }, 'community'), null)
    assert.equal(
      navIconFor({ community: 'NotAnInstalledLucideIcon' }, 'community'),
      null
    )
  })
})
