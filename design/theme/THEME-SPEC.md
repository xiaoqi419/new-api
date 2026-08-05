# Torch AI 浅粉主题 · 设计规范 (Theme Spec)

> 状态:**规范稿,未接入 app 构建**。本目录是独立交付物(`design/theme/`),不被前端打包引用,不影响现有业务代码。
>
> 配套文件:
> - `design-tokens.json` —— 机器可读的 token 定义
> - `preview.html` —— 静态实机预览(直接用浏览器打开,可实时切换 明暗 × 皮肤 × 圆角 × 密度 × 玻璃,并演示「后台默认 + 用户覆盖」)

---

## 1. 目标

把整站 UI 改成**浅粉 + 一点点(明显档)玻璃感**,并做成**完整主题系统**:

- 多皮肤 × 明暗:`sakura / peach / berry / rosegold` × `light / dark`
- 全维度变体:颜色皮肤、组件风格(圆角 / 密度 / 卡片质感)、明暗
- **用户可切换主题**;**后台可设站点默认**
- 状态色(健康/警告/异常)全部收进粉系(按需求),但用「明度阶梯 + 图标 + 字重」保证仍能区分

---

## 2. Token 架构(两层)

```
primitives(原始色阶,按皮肤区分)
        │  500=primary 600=hover 700=active 400=浅调
        ▼  映射
semantic(语义 token,按明暗区分)     ← 组件只认这一层
        │
        ▼  写成 CSS 变量,挂在
[data-theme][data-skin][data-radius][data-density][data-surface]
```

组件永远只消费语义 token(`--bg-surface`、`--text-primary`、`--primary` …),不直接写死颜色。换皮肤/明暗 = 换一组变量值,全站自动跟随。

### 关键技巧:用 `color-mix` 把皮肤色调掺进中性背景

背景不是纯灰/纯白,而是从当前皮肤的 `--skin-500` 掺入一点,这样每套皮肤的底色都自带对应粉调,只需维护 4 个皮肤各 4 个色值:

```css
--bg-base:    color-mix(in srgb, var(--skin-500) 7%, #fff);   /* light */
--bg-surface: color-mix(in srgb, var(--skin-500) 4%, #fff);
/* dark 用深色底掺入 */
--bg-base:    color-mix(in srgb, var(--skin-500) 12%, #17101a);
```

---

## 3. 语义 Token 速查(以 sakura 为例)

| token | light | dark | 用途 |
|---|---|---|---|
| `--bg-base` | `#FDEFF4` | `#1E1319` | 页面底 |
| `--bg-surface` | `#FFF8FB` | `#2A1B23` | 卡片(纯色档) |
| `--bg-glass` | `rgba(255,255,255,.70)` | `rgba(42,27,35,.60)` | 卡片(玻璃档) |
| `--border` | `rgba(214,63,128,.22)` | `rgba(244,143,177,.20)` | 描边/分隔 |
| `--text-primary` | `#3A2A31` | `#FCE9F0` | 正文/大数字 |
| `--text-secondary` | `#705863` | `#E4C2D2` | 副标题 |
| `--text-muted` | `#A08792` | `#B892A3` | 辅助说明 |
| `--primary` | `#EC4F91` | `#FF6FA5` | 主色/CTA |
| `--primary-hover` | `#D63F80` | `#FF87B4` | 悬停 |
| `--primary-active` | `#B83268` | `#EC4F91` | 按下 |
| `--on-primary` | `#FFFFFF` | `#2A0E1B` | 主色上的字 |

皮肤原始色阶见 `design-tokens.json → primitives`。

---

## 4. 状态色:单色粉系里怎么还能区分?

需求是「状态色全融进粉系」。纯靠色相会分不出健康/异常,所以**强制三重编码**(缺一不可):

1. **明度/饱和度阶梯**:健康=深饱和玫红,警告=去饱和藕粉,异常=最深/暖移莓红
2. **图标**:✓ / △ / ✕ / ●
3. **字重**:异常加粗

| 状态 | light | dark | 图标 | 字重 |
|---|---|---|---|---|
| 成功/健康 | `#E5327E` | `#FF6FA5` | ✓ | 600 |
| 信息 | `#EC4F91` | `#FF87B4` | ● | 500 |
| 警告 | `#C98BA6` | `#D6A9BC` | △ | 600 |
| 异常/危险 | `#D6335A` | `#FF5C7E` | ✕ | 700 |
| 空闲/禁用 | `#C9B3BC` | `#8E7480` | ● | 500 |

> 说明:`danger` 我特意往「暖莓红」偏一点点(仍属粉家族),否则纯粉喊不出「出错」。若要绝对纯粉,靠「最深 + 实心底片 + ✕ + 粗体」兜底。

---

## 5. 风格变体(颜色 × 风格)

| 维度 | 取值 | 数据属性 |
|---|---|---|
| 皮肤(hue) | sakura / peach / berry / rosegold | `data-skin` |
| 明暗 | light / dark | `data-theme` |
| 圆角 | sharp 6px / medium 12px / rounded 20px | `data-radius` |
| 密度 | comfortable / compact | `data-density` |
| 卡片质感 | solid / glass / outline | `data-surface` |

底层同一套 token,组合出的样式数量很多但不失控。

---

## 6. 玻璃感(明显档)

**亮色卡片:**
```css
background: linear-gradient(180deg, rgba(255,255,255,.65),
            color-mix(in srgb, var(--skin-500) 6%, rgba(255,255,255,.5)));
backdrop-filter: blur(14px) saturate(140%);
border: 1px solid rgba(255,255,255,.55);
box-shadow: 0 8px 32px color-mix(in srgb, var(--skin-600) 14%, transparent);
/* 顶部高光 */ box-shadow(inset): inset 0 1px 0 rgba(255,255,255,.6);
```
**暗色卡片:** 底 `rgba(42,27,35,.55)` · `blur(14px) saturate(130%)` · 边 `rgba(255,143,177,.14)` · 阴影 `0 8px 32px rgba(0,0,0,.4)`。

### 护栏(大面积玻璃必须遵守)
1. **可读性**:玻璃卡内文字坐在更实的内层底片(opacity ≥ .85),正文用 `--text-primary`;玻璃背后别放高频花纹。
2. **性能**:同屏模糊层限制在「顶栏 + 侧栏 + 可视卡片」;长列表/虚拟滚动临时关 blur;禁止玻璃套玻璃。
3. **降级**:`@supports not (backdrop-filter)` 回退不透明 `rgba(255,255,255,.92)` / `rgba(42,27,35,.92)`;尊重 `prefers-reduced-transparency` 与 `prefers-reduced-motion`。

---

## 7. 对比度(硬约束,WCAG)

- 正文 ≥ **4.5:1**;大字/次要文字 ≥ **3:1**
- 玻璃卡按**合成后的有效背景**(最坏情况)测对比
- 低对比是这套风格最容易翻车处 —— 粉色只用于背景/描边/强调/图表,**正文一律深字色**

---

## 8. 切换机制 + 后台默认(优先级)

从高到低:

1. **用户偏好** —— 前端切换后持久化
   - 匿名:`localStorage: torchai.theme.*`
   - 登录:建议写入 `UserSetting`(与 `Language` 同处),登录后覆盖匿名值
2. **后台站点默认** —— 系统设置项(如 `theme_setting.default_theme/default_skin/...`),随站点配置/`/api/status` 下发;用户未自定义时用它
3. **系统偏好** —— `prefers-color-scheme` 决定明/暗
4. **硬默认** —— `pink-light-sakura`

可选:后台可**锁定**某些维度(例如强制 `skin=sakura`,仅允许用户切明暗)。

用户可切换的维度:`theme / skin / radius / density / surface`。
应用方式:在 `<html>` 上写对应 `data-*` 属性,CSS 变量级联生效,**组件零改动**。

`preview.html` 已用最小实现演示了这套优先级:面板里「后台默认」区可设默认,用户区可覆盖,清除用户偏好后回落到后台默认。

---

## 9. 接入现有技术栈(方案,不在本稿实现)

- 语义 token → CSS 变量,写在 `[data-theme][data-skin]...` 选择器;`tailwind.config` 的 `colors` 映射到 `var(--token)`,已用 token 的组件无需改。
- 玻璃 → 2~3 个工具类(`surface-glass` / `surface-solid` / `surface-outline`),卡片按 `data-surface` 取用。
- 用户切换器 → 一个下拉/面板,写 `<html>` 属性 + 持久化(匿名 localStorage / 登录 UserSetting)。
- 后台默认 → 系统设置新增 `theme_setting.*`,前端首屏读取后作为默认(用户偏好优先)。
- 首屏防闪(FOUC)→ 在 `index.html` 头部内联一小段脚本,渲染前就把 `data-*` 写上(读 localStorage / 服务端注入的默认)。

---

## 10. 建议落地顺序(将来动代码时)

1. 抽 token 层 + 明暗两套(先不换视觉)→ 保证可切回
2. 上 sakura 亮色皮肤,替换硬编码色
3. 加玻璃质感(先顶栏/侧栏/卡片)
4. 加皮肤切换 + 圆角/密度变体
5. 用户切换器 + 后台默认 + 首屏防闪
6. 逐页对比度回归 + 玻璃性能回归
