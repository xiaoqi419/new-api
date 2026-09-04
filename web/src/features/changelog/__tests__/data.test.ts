import { describe, expect, test } from 'vitest'

import { CHANGELOG } from '../data'
import type { ChangeKind } from '../types'

const kinds: ChangeKind[] = ['feature', 'fix', 'improvement', 'security']

describe('CHANGELOG', () => {
  test('every group uses a renderable kind', () => {
    for (const entry of CHANGELOG) {
      for (const group of entry.changes) {
        expect(kinds).toContain(group.kind)
      }
    }
  })
})
