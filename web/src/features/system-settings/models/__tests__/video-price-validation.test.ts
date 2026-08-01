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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  canonicalizeVideoPriceTiers,
  createVideoPriceTierDraft,
  getVideoPriceDraftError,
  parseVideoPriceDraft,
  serializeVideoPriceDraft,
} from '../model-pricing-core'

const DOUBAO_SEEDANCE_2_0 = JSON.stringify({
  base_price: 46,
  tiers: [
    { has_video: true, price: 28 },
    { resolution: '1080p', price: 51 },
    { resolution: '1080p', has_video: true, price: 31 },
    { resolution: '4k', price: 26 },
    { resolution: '4k', has_video: true, price: 16 },
  ],
})

function tier(overrides: {
  resolution?: string
  hasVideo?: boolean
  hasAudio?: boolean
  price: string
}) {
  return { ...createVideoPriceTierDraft(), ...overrides }
}

describe('video price tier serialization', () => {
  test('round-trips the stored payload without renaming or adding fields', () => {
    const draft = parseVideoPriceDraft(DOUBAO_SEEDANCE_2_0)
    assert.equal(draft.enabled, true)
    assert.equal(draft.basePrice, '46')
    assert.equal(draft.tiers.length, 5)
    assert.equal(serializeVideoPriceDraft(draft), DOUBAO_SEEDANCE_2_0)
  })

  test('omits empty resolutions and false switches so the payload matches Go omitempty', () => {
    const serialized = serializeVideoPriceDraft({
      enabled: true,
      basePrice: '8',
      tiers: [tier({ resolution: '  ', hasAudio: true, price: '16' })],
    })
    assert.equal(
      serialized,
      JSON.stringify({ base_price: 8, tiers: [{ has_audio: true, price: 16 }] })
    )
  })

  test('drops the whole payload when it carries no usable tier', () => {
    assert.equal(
      serializeVideoPriceDraft({
        enabled: true,
        basePrice: '46',
        tiers: [tier({ price: '' })],
      }),
      ''
    )
    assert.equal(
      serializeVideoPriceDraft({
        enabled: false,
        basePrice: '46',
        tiers: [tier({ price: '28' })],
      }),
      ''
    )
  })
})

describe('video price tier canonicalization', () => {
  test('treats a differently ordered backend payload as unchanged', () => {
    const reordered = JSON.stringify({
      tiers: [
        { price: 28, has_video: true },
        { price: 51, resolution: '1080p' },
        { has_video: true, price: 31, resolution: '1080p' },
        { price: 26, resolution: '4k' },
        { price: 16, resolution: '4k', has_video: true },
      ],
      base_price: 46,
    })
    assert.notEqual(reordered, DOUBAO_SEEDANCE_2_0)
    assert.equal(
      canonicalizeVideoPriceTiers(reordered),
      canonicalizeVideoPriceTiers(DOUBAO_SEEDANCE_2_0)
    )
  })

  test('agrees with a freshly serialized draft so an untouched model stays clean', () => {
    assert.equal(
      canonicalizeVideoPriceTiers(DOUBAO_SEEDANCE_2_0),
      serializeVideoPriceDraft(parseVideoPriceDraft(DOUBAO_SEEDANCE_2_0))
    )
  })

  test('collapses unusable payloads to an empty string', () => {
    assert.equal(canonicalizeVideoPriceTiers(''), '')
    assert.equal(canonicalizeVideoPriceTiers('not json'), '')
    assert.equal(
      canonicalizeVideoPriceTiers('{"base_price":0,"tiers":[{"price":1}]}'),
      ''
    )
  })
})

describe('video price tier validation', () => {
  test('accepts a draft with no tiers regardless of base price', () => {
    assert.equal(
      getVideoPriceDraftError({ enabled: true, basePrice: '', tiers: [] }),
      null
    )
  })

  test('rejects a non-positive base price', () => {
    assert.equal(
      getVideoPriceDraftError({
        enabled: true,
        basePrice: '0',
        tiers: [tier({ price: '28' })],
      }),
      'Video tier pricing needs a base price greater than 0.'
    )
  })

  test('rejects a non-positive tier price', () => {
    assert.equal(
      getVideoPriceDraftError({
        enabled: true,
        basePrice: '46',
        tiers: [tier({ price: '-1' })],
      }),
      'Every video tier price must be greater than 0.'
    )
  })

  test('rejects duplicate tiers ignoring resolution case and padding', () => {
    assert.equal(
      getVideoPriceDraftError({
        enabled: true,
        basePrice: '46',
        tiers: [
          tier({ resolution: '1080P', price: '51' }),
          tier({ resolution: ' 1080p ', price: '52' }),
        ],
      }),
      'Two video tiers share the same resolution and input/output conditions.'
    )
  })

  test('keeps tiers that differ only by a switch', () => {
    assert.equal(
      getVideoPriceDraftError({
        enabled: true,
        basePrice: '46',
        tiers: [
          tier({ resolution: '1080p', price: '51' }),
          tier({ resolution: '1080p', hasVideo: true, price: '31' }),
          tier({ resolution: '1080p', hasAudio: true, price: '61' }),
        ],
      }),
      null
    )
  })
})
