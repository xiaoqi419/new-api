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
  canonicalizeImagePriceTiers,
  createImagePriceTierRow,
  getImagePriceTiersError,
  parseImagePriceTiers,
  serializeImagePriceTiers,
  type ImagePriceTiersDraft,
} from '../model-pricing-core'

/** DALL·E 3 as the backend ships it: hd and the tall size cost 2x / 3x. */
const DALL_E_3 = JSON.stringify({
  base_size: '1024x1024',
  base_price: 1,
  tiers: [
    { size: '1024x1024', quality: 'hd', price: 2 },
    { size: '1024x1792', price: 2 },
    { size: '1024x1792', quality: 'hd', price: 3 },
  ],
})

function table(
  baseSize: string,
  rows: { size?: string; quality?: string; price?: string }[]
): ImagePriceTiersDraft {
  return {
    enabled: true,
    baseSize,
    rows: rows.map((row) =>
      createImagePriceTierRow(
        row.size ?? '',
        row.quality ?? '',
        row.price ?? ''
      )
    ),
  }
}

describe('image price tier parsing', () => {
  test('lays the stored payload out as the vendor table', () => {
    const draft = parseImagePriceTiers(DALL_E_3, '1')

    assert.equal(draft.enabled, true)
    assert.equal(draft.baseSize, '1024x1024')
    assert.deepEqual(
      draft.rows.map((row) => [row.size, row.quality, row.price]),
      [
        ['1024x1024', 'hd', '2'],
        ['1024x1792', '', '2'],
        ['1024x1792', 'hd', '3'],
      ]
    )
  })

  test('rescales a payload whose stored anchor is not the fixed price', () => {
    // 迁移过来的旧配置存的是厂商倍率(基准 1),模型自己按次收 $0.02,表格必须显示
    // 正在收的 0.008 / 0.009,而不是倍率 0.4 / 0.45。
    const draft = parseImagePriceTiers(
      JSON.stringify({
        base_size: '1024x1024',
        base_price: 1,
        tiers: [
          { size: '256x256', price: 0.4 },
          { size: '512x512', price: 0.45 },
        ],
      }),
      '0.02'
    )
    assert.deepEqual(
      draft.rows.map((row) => row.price),
      ['0.008', '0.009']
    )
  })

  test('round-trips the stored payload byte for byte', () => {
    assert.equal(
      serializeImagePriceTiers(parseImagePriceTiers(DALL_E_3, '1'), '1'),
      DALL_E_3
    )
  })

  test('starts from an empty table when the model has no stored tiers', () => {
    const draft = parseImagePriceTiers('', '0.04')

    assert.equal(draft.enabled, false)
    assert.equal(draft.baseSize, '')
    assert.equal(draft.rows.length, 1)
  })
})

describe('image price tier serialization', () => {
  test('anchors the payload to the fixed price so rows stay absolute', () => {
    assert.equal(
      serializeImagePriceTiers(
        table('2K', [
          { size: '1K', price: '0.1' },
          { size: '4K', quality: 'hd', price: '0.8' },
        ]),
        '0.2'
      ),
      JSON.stringify({
        base_size: '2K',
        base_price: 0.2,
        tiers: [
          { size: '1K', price: 0.1 },
          { size: '4K', quality: 'hd', price: 0.8 },
        ],
      })
    )
  })

  test('keeps an unpriced row out of the payload', () => {
    assert.equal(
      serializeImagePriceTiers(
        table('2K', [{ size: '1K', price: '0.1' }, { size: '4K' }]),
        '0.2'
      ),
      JSON.stringify({
        base_size: '2K',
        base_price: 0.2,
        tiers: [{ size: '1K', price: 0.1 }],
      })
    )
  })

  test('drops the payload when no row is priced', () => {
    assert.equal(serializeImagePriceTiers(table('2K', [{}]), '0.2'), '')
  })

  test('drops the payload when there is no fixed price to anchor to', () => {
    assert.equal(
      serializeImagePriceTiers(table('2K', [{ size: '1K', price: '0.1' }]), ''),
      ''
    )
  })

  test('drops the payload while tier pricing is turned off', () => {
    assert.equal(
      serializeImagePriceTiers(
        { ...table('2K', [{ size: '1K', price: '0.1' }]), enabled: false },
        '0.2'
      ),
      ''
    )
  })

  test('keeps the row order through a save and a reload', () => {
    const stored = serializeImagePriceTiers(
      table('2K', [
        { size: '4K', price: '0.4' },
        { size: '1K', price: '0.1' },
        { quality: 'hd', price: '0.3' },
      ]),
      '0.2'
    )
    assert.deepEqual(
      parseImagePriceTiers(stored, '0.2').rows.map((row) => [
        row.size,
        row.quality,
      ]),
      [
        ['4K', ''],
        ['1K', ''],
        ['', 'hd'],
      ]
    )
  })
})

describe('image price tier validation', () => {
  test('accepts a table priced by size', () => {
    assert.equal(
      getImagePriceTiersError(
        table('1024x1024', [{ size: '1024x1792', price: '0.08' }]),
        '0.04'
      ),
      null
    )
  })

  test('accepts quality-only tiers without a base tier size', () => {
    assert.equal(
      getImagePriceTiersError(
        table('', [{ quality: 'hd', price: '0.08' }]),
        '0.04'
      ),
      null
    )
  })

  test('ignores a row the admin never filled in', () => {
    assert.equal(
      getImagePriceTiersError(
        table('1024x1024', [{ size: '1024x1792', price: '0.08' }, {}]),
        '0.04'
      ),
      null
    )
  })

  test('rejects a size-priced table with no base tier size', () => {
    assert.equal(
      getImagePriceTiersError(
        table('', [{ size: '1024x1792', price: '0.08' }]),
        '0.04'
      ),
      'Set the base tier size, such as 2K or 1024x1024, before pricing image tiers by size.'
    )
  })

  test('rejects a size the backend cannot recognize', () => {
    assert.equal(
      getImagePriceTiersError(
        table('1024x1024', [{ size: 'huge', price: '0.08' }]),
        '0.04'
      ),
      'Image tier sizes must be written like 2K or 2048x2048.'
    )
  })

  test('rejects a row left without a price so it cannot be dropped silently', () => {
    assert.equal(
      getImagePriceTiersError(table('2K', [{ size: '1K' }]), '0.2'),
      'Every image tier price must be greater than 0.'
    )
  })

  test('rejects a non-positive price', () => {
    assert.equal(
      getImagePriceTiersError(table('2K', [{ size: '1K', price: '0' }]), '0.2'),
      'Every image tier price must be greater than 0.'
    )
  })

  test('rejects two tiers naming the same size in different notations', () => {
    assert.equal(
      getImagePriceTiersError(
        table('2K', [
          { size: '2K', price: '0.2' },
          { size: '2048x2048', price: '0.3' },
        ]),
        '0.2'
      ),
      'Two image tiers use the same size and quality.'
    )
  })

  test('rejects two tiers whose quality differs only in case', () => {
    assert.equal(
      getImagePriceTiersError(
        table('1024x1024', [
          { quality: 'hd', price: '0.08' },
          { quality: 'HD', price: '0.09' },
        ]),
        '0.04'
      ),
      'Two image tiers use the same size and quality.'
    )
  })

  test('rejects a priced table with no fixed price to anchor to', () => {
    assert.equal(
      getImagePriceTiersError(
        table('', [{ quality: 'hd', price: '0.08' }]),
        ''
      ),
      'Set the fixed price before pricing image tiers.'
    )
  })
})

describe('image price tier canonicalization', () => {
  test('treats a differently ordered payload as unchanged', () => {
    const reordered = JSON.stringify({
      tiers: [
        { price: 3, quality: 'hd', size: '1024x1792' },
        { price: 2, size: '1024x1792' },
        { quality: 'hd', price: 2, size: '1024x1024' },
      ],
      base_price: 1,
      base_size: '1024x1024',
    })
    assert.notEqual(reordered, DALL_E_3)
    assert.equal(
      canonicalizeImagePriceTiers(reordered),
      canonicalizeImagePriceTiers(DALL_E_3)
    )
  })

  test('agrees with a freshly serialized draft so an untouched model stays clean', () => {
    assert.equal(
      canonicalizeImagePriceTiers(DALL_E_3),
      canonicalizeImagePriceTiers(
        serializeImagePriceTiers(parseImagePriceTiers(DALL_E_3, '1'), '1')
      )
    )
  })

  test('reports a changed base tier size as an edit', () => {
    assert.notEqual(
      canonicalizeImagePriceTiers(DALL_E_3),
      canonicalizeImagePriceTiers(
        JSON.stringify({
          base_size: '512x512',
          base_price: 1,
          tiers: [
            { size: '1024x1024', quality: 'hd', price: 2 },
            { size: '1024x1792', price: 2 },
            { size: '1024x1792', quality: 'hd', price: 3 },
          ],
        })
      )
    )
  })

  test('collapses unusable payloads to an empty string', () => {
    assert.equal(canonicalizeImagePriceTiers(''), '')
    assert.equal(canonicalizeImagePriceTiers('not json'), '')
    assert.equal(
      canonicalizeImagePriceTiers('{"base_price":0,"tiers":[{"price":1}]}'),
      ''
    )
  })
})
