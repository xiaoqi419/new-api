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
  createVideoPriceMatrixRow,
  getVideoPriceMatrixError,
  parseVideoPriceMatrix,
  serializeVideoPriceMatrix,
  setVideoPriceAxis,
  type VideoPriceAxes,
  type VideoPriceCellKey,
  type VideoPriceMatrixDraft,
} from '../model-pricing-core'

/** Doubao Seedance 2.0 as the vendor publishes it: 46/51/26 plus 28/31/16. */
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

function matrix(
  axes: Partial<VideoPriceAxes>,
  rows: {
    resolution?: string
    cells: Partial<Record<VideoPriceCellKey, string>>
  }[]
): VideoPriceMatrixDraft {
  return {
    enabled: true,
    axes: {
      resolution: false,
      videoInput: false,
      audioOutput: false,
      ...axes,
    },
    rows: rows.map((row) => {
      const built = createVideoPriceMatrixRow(row.resolution ?? '')
      built.prices = { ...built.prices, ...row.cells }
      return built
    }),
  }
}

describe('video price matrix parsing', () => {
  test('lays the stored payload out as the vendor table', () => {
    const draft = parseVideoPriceMatrix(DOUBAO_SEEDANCE_2_0, '46')

    assert.equal(draft.enabled, true)
    assert.deepEqual(draft.axes, {
      resolution: true,
      videoInput: true,
      audioOutput: false,
    })
    assert.deepEqual(
      draft.rows.map((row) => [
        row.resolution,
        row.prices['--'],
        row.prices['v-'],
      ]),
      [
        ['', '46', '28'],
        ['1080p', '51', '31'],
        ['4k', '26', '16'],
      ]
    )
  })

  test('rescales a payload whose stored anchor is not the input price', () => {
    // 2.0-fast 存的是厂商原价(基准 37),而它的模型倍率对应 $46/1M。旧配置的售价是
    // 46 x 22/37 = 27.35,表格必须显示这个正在收的价,而不是厂商原价 22。
    const draft = parseVideoPriceMatrix(
      JSON.stringify({
        base_price: 37,
        tiers: [{ has_video: true, price: 22 }],
      }),
      '46'
    )
    assert.equal(draft.rows[0].prices['--'], '46')
    assert.equal(draft.rows[0].prices['v-'], '27.351351')
  })

  test('reports only the axes the vendor actually prices by', () => {
    const audioOnly = parseVideoPriceMatrix(
      JSON.stringify({ base_price: 8, tiers: [{ has_audio: true, price: 16 }] }),
      '8'
    )
    assert.deepEqual(audioOnly.axes, {
      resolution: false,
      videoInput: false,
      audioOutput: true,
    })
    assert.equal(audioOnly.rows.length, 1)
    assert.equal(audioOnly.rows[0].prices['-a'], '16')
  })

  test('round-trips the stored payload byte for byte', () => {
    assert.equal(
      serializeVideoPriceMatrix(
        parseVideoPriceMatrix(DOUBAO_SEEDANCE_2_0, '46'),
        '46'
      ),
      DOUBAO_SEEDANCE_2_0
    )
  })
})

describe('video price matrix serialization', () => {
  test('anchors the payload to the input price so cells stay absolute', () => {
    const serialized = serializeVideoPriceMatrix(
      matrix({ videoInput: true }, [{ cells: { '--': '46', 'v-': '22' } }]),
      '46'
    )
    assert.equal(
      serialized,
      JSON.stringify({
        base_price: 46,
        tiers: [{ has_video: true, price: 22 }],
      })
    )
  })

  test('keeps a cell out of the payload when it is blank', () => {
    const serialized = serializeVideoPriceMatrix(
      matrix({ resolution: true, videoInput: true }, [
        { resolution: '1080p', cells: { '--': '51' } },
      ]),
      '46'
    )
    assert.equal(
      serialized,
      JSON.stringify({
        base_price: 46,
        tiers: [{ resolution: '1080p', price: 51 }],
      })
    )
  })

  test('drops the payload when no cell is priced', () => {
    assert.equal(
      serializeVideoPriceMatrix(matrix({}, [{ cells: {} }]), '46'),
      ''
    )
  })

  test('leaves out a catch-all cell that just repeats the input price', () => {
    // base_price 已经表达了「没有任何条件收窄的那个组合」,再写成档位只会让没动过的
    // 模型看起来有未保存改动。
    assert.equal(
      serializeVideoPriceMatrix(matrix({}, [{ cells: { '--': '46' } }]), '46'),
      ''
    )
  })

  test('keeps a catch-all cell that differs from the input price', () => {
    assert.equal(
      serializeVideoPriceMatrix(matrix({}, [{ cells: { '--': '40' } }]), '46'),
      JSON.stringify({ base_price: 46, tiers: [{ price: 40 }] })
    )
  })

  test('drops the payload when there is no input price to anchor to', () => {
    assert.equal(
      serializeVideoPriceMatrix(matrix({}, [{ cells: { '--': '46' } }]), ''),
      ''
    )
  })

  test('ignores a resolution row left entirely blank', () => {
    const serialized = serializeVideoPriceMatrix(
      matrix({ resolution: true, videoInput: true }, [
        { resolution: '1080p', cells: { '--': '51', 'v-': '31' } },
        { resolution: '', cells: {} },
      ]),
      '46'
    )
    assert.equal(
      serialized,
      JSON.stringify({
        base_price: 46,
        tiers: [
          { resolution: '1080p', price: 51 },
          { resolution: '1080p', has_video: true, price: 31 },
        ],
      })
    )
  })

  test('emits the same payload regardless of row order', () => {
    const rows = [
      { resolution: '1080p', cells: { '--': '51' } },
      { resolution: '4k', cells: { '--': '26' } },
    ]
    assert.equal(
      serializeVideoPriceMatrix(matrix({ resolution: true }, rows), '46'),
      serializeVideoPriceMatrix(
        matrix({ resolution: true }, [...rows].reverse()),
        '46'
      )
    )
  })
})

describe('video price axis toggles', () => {
  test('drops the cells an axis exposed so no hidden tier gets saved', () => {
    const draft = matrix({ videoInput: true, audioOutput: true }, [
      { cells: { '--': '46', 'v-': '28', '-a': '60', va: '40' } },
    ])
    const next = setVideoPriceAxis(draft, 'audioOutput', false)

    assert.equal(next.rows[0].prices['-a'], '')
    assert.equal(next.rows[0].prices.va, '')
    assert.equal(next.rows[0].prices['v-'], '28')
    assert.equal(
      serializeVideoPriceMatrix(next, '46'),
      JSON.stringify({
        base_price: 46,
        tiers: [{ has_video: true, price: 28 }],
      })
    )
  })

  test('drops extra resolution rows when resolution pricing is turned off', () => {
    const draft = matrix({ resolution: true }, [
      { resolution: '1080p', cells: { '--': '51' } },
      { resolution: '4k', cells: { '--': '26' } },
    ])
    const next = setVideoPriceAxis(draft, 'resolution', false)

    assert.equal(next.rows.length, 1)
    assert.equal(next.rows[0].resolution, '')
    assert.equal(
      serializeVideoPriceMatrix(next, '46'),
      JSON.stringify({ base_price: 46, tiers: [{ price: 51 }] })
    )
    assert.equal(next.rows[0].prices['--'], '51')
  })
})

describe('video price matrix validation', () => {
  test('accepts a table with a single priced cell', () => {
    assert.equal(
      getVideoPriceMatrixError(matrix({}, [{ cells: { '--': '46' } }]), '46'),
      null
    )
  })

  test('accepts blank cells next to filled ones', () => {
    assert.equal(
      getVideoPriceMatrixError(
        matrix({ resolution: true, videoInput: true }, [
          { resolution: '1080p', cells: { '--': '51' } },
          { resolution: '4k', cells: { 'v-': '16' } },
        ]),
        '46'
      ),
      null
    )
  })

  test('accepts a blank resolution as the catch-all row', () => {
    assert.equal(
      getVideoPriceMatrixError(
        matrix({ resolution: true }, [
          { resolution: '', cells: { '--': '46' } },
          { resolution: '1080p', cells: { '--': '51' } },
        ]),
        '46'
      ),
      null
    )
  })

  test('rejects a priced table with no input price to anchor to', () => {
    assert.equal(
      getVideoPriceMatrixError(
        matrix({ videoInput: true }, [{ cells: { 'v-': '22' } }]),
        ''
      ),
      'Set the input price before pricing video tiers.'
    )
  })

  test('rejects a non-positive price', () => {
    assert.equal(
      getVideoPriceMatrixError(
        matrix({ videoInput: true }, [{ cells: { '--': '37', 'v-': '0' } }]),
        '46'
      ),
      'Every video tier price must be greater than 0.'
    )
  })

  test('rejects two rows naming the same resolution', () => {
    assert.equal(
      getVideoPriceMatrixError(
        matrix({ resolution: true }, [
          { resolution: '1080p', cells: { '--': '51' } },
          { resolution: ' 1080P ', cells: { '--': '52' } },
        ]),
        '46'
      ),
      'Two rows use the same output resolution.'
    )
  })

  test('rejects two catch-all rows because they serialize into one condition', () => {
    assert.equal(
      getVideoPriceMatrixError(
        matrix({ resolution: true }, [
          { resolution: '', cells: { '--': '46' } },
          { resolution: '', cells: { '--': '51' } },
        ]),
        '46'
      ),
      'Two rows use the same output resolution.'
    )
  })
})

describe('video price tier canonicalization', () => {
  test('treats a differently ordered payload as unchanged', () => {
    const reordered = JSON.stringify({
      tiers: [
        { price: 16, resolution: '4k', has_video: true },
        { price: 51, resolution: '1080p' },
        { price: 28, has_video: true },
        { has_video: true, price: 31, resolution: '1080p' },
        { price: 26, resolution: '4k' },
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
      serializeVideoPriceMatrix(
        parseVideoPriceMatrix(DOUBAO_SEEDANCE_2_0, '46'),
        '46'
      )
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
