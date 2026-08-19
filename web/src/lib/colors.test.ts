import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { dotColorMap, textColorMap } from '../components/status-badge'
import { avatarColorMap, getVendorColor } from './colors'

describe('vendor color', () => {
  test('keeps a recognizable hue for the common upstream brands', () => {
    assert.equal(getVendorColor({ name: 'OpenAI', icon: 'OpenAI' }), 'green')
    assert.equal(getVendorColor({ name: 'Claude', icon: 'Claude' }), 'orange')
    assert.equal(
      getVendorColor({ name: '字节跳动', icon: 'Doubao.Color' }),
      'pink'
    )
    assert.equal(
      getVendorColor({ name: '讯飞', icon: 'Spark.Color' }),
      'indigo'
    )
  })

  test('resolves a brand pasted in as a whole import statement', () => {
    // 生产库里真有这样一行:管理员把 lobe 的示例代码整段粘进了 icon 字段。
    // 按子串匹配才能从里面认出 Volcengine,否则这家厂商会退化成哈希色。
    assert.equal(
      getVendorColor({
        name: '即梦视频',
        icon: "import { Volcengine } from '@lobehub/icons';",
      }),
      'pink'
    )
  })

  test('falls back to the name hash for vendors outside the brand list', () => {
    const first = getVendorColor({ name: '我的中转站' })
    const second = getVendorColor({ name: '我的中转站' })
    assert.equal(first, second, '同一个厂商名必须始终得到同一个颜色')
    assert.notEqual(getVendorColor({ name: '另一家' }), undefined)
  })

  test('every result is a usable badge variant and class pair', () => {
    const vendors = [
      { name: 'OpenAI', icon: 'OpenAI' },
      { name: '我的中转站' },
      { name: '', icon: '' },
      { name: 'Kimi', icon: 'Moonshot' },
      { name: 'MiniMax' },
      { name: 'DeepSeek' },
      { name: '智谱 GLM', icon: 'Zhipu.Color' },
      { name: '通义千问', icon: 'Qwen.Color' },
      { name: 'Gemini', icon: 'Gemini.Color' },
    ]

    for (const vendor of vendors) {
      const color = getVendorColor(vendor)
      // 这三张表分别喂给 chip 底色、徽标圆点和徽标文字。任一张缺这个键,
      // 界面上就会渲染出没有颜色类的裸元素。
      assert.ok(avatarColorMap[color], `avatarColorMap 缺 ${color}`)
      assert.ok(dotColorMap[color], `dotColorMap 缺 ${color}`)
      assert.ok(textColorMap[color], `textColorMap 缺 ${color}`)
    }
  })
})
