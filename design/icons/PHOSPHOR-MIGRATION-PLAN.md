# Option B:全站图标迁移到 Phosphor 方案(先方案,后动手)

> 目标:把主力 UI 图标统一换成 Phosphor(圆润 + 多字重),获得"整套换新"的观感。
> **注意:图标是代码级 `import`,换库会影响所有主题,无法只针对樱花。**
> 本文档只出方案,不改任何业务代码。经确认后再进入实施。

## 0. 结论先行

- **迁移**:`lucide-react`(239 图标 / 326 文件) + `@hugeicons` UI 图标(24 图标 / 24 文件) → Phosphor。
- **保留(不迁移)品牌/模型 logo**:
  - `react-icons` 实测全是 `Si*`(Simple Icons):`SiAlipay / SiDiscord / SiGithub / SiLinux / SiStripe / SiWechat` —— 全是**品牌图标**。
  - `@lobehub/icons`:`CherryStudio` 等**模型/品牌 logo**。
  - Phosphor 不含这些品牌 logo,强行替换会破坏识别度 → 归入"brand logo 保留"。
- **手段**:适配层(`@/components/icons`)+ codemod 批量改 import 源,**不逐文件手改调用点**。
- **影响范围**:所有主题一起变(不可 scoped)。
- **估算**:约 3-4 人日,分阶段小批推进。

## 1. 现状盘点(实测,脚本 /tmp/icon-inventory.mjs)

| 库 | 文件数 | 去重图标数 | 处置 |
| --- | --- | --- | --- |
| lucide-react | 326 | 239 | 迁移 → Phosphor |
| @hugeicons/core-free-icons | 24 | 24 | 迁移 → Phosphor |
| react-icons (`/si`) | 4 | 6 | **保留**(品牌 logo) |
| @lobehub/icons | 少量 | 模型/品牌 | **保留**(品牌 logo) |

- **没有中央图标映射表**,各组件各自 `import`。
- lucide 的 239 里有大量 **`X` 与 `XIcon` 双导出别名**(如 `Search`/`SearchIcon`、`Check`/`CheckIcon`、`Trash2`/`Trash2Icon`、`ArrowDown`/`ArrowDownIcon`…),去重后**真实不同"形状"约 ~185**。适配层需把两种名字都导出(都映射到同一 Phosphor 图标)。
- 动态引用点(把图标组件当值传参)需重点回归:`hooks/use-sidebar-data.ts`、`components/layout/config/system-settings.config.ts`、`features/channels/lib/channel-type-config.ts`、`features/pricing/...` 等 `icon: XXX` 配置。同名导出后天然兼容,但要抽查。

## 2. 为什么用"适配层"而不是逐文件手改

326 个文件手改极易漏改/改错。适配层把改动集中到一处:

- 新建 `@/components/icons`,**沿用 lucide 完全相同的导出名**(`Trash2`、`LayoutDashboard`、`SearchIcon`…),内部用 Phosphor 实现。
- codemod 只把 326 文件的 `from 'lucide-react'` → `from '@/components/icons'`,**调用处 JSX 几乎不动**。
- 图标名映射、props 适配、缺失兜底,全部集中在适配层维护/回滚。

## 3. 适配层设计

`web/src/components/icons/index.tsx`(约定):

```tsx
import { IconContext, type IconProps as PhForwardProps } from '@phosphor-icons/react'
import {
  MagnifyingGlass, Trash, House, Gear, /* ...Phosphor 组件... */
} from '@phosphor-icons/react'

// lucide 调用方常用 props:size / strokeWidth / absoluteStrokeWidth / color / className
// Phosphor 用 weight 表达线重,没有 strokeWidth。做一层 props 适配。
type LucideCompatProps = {
  size?: number | string
  strokeWidth?: number
  absoluteStrokeWidth?: boolean
  color?: string
  className?: string
} & Omit<PhForwardProps, 'weight'>

function weightFromStroke(sw?: number): PhForwardProps['weight'] {
  if (sw == null) return undefined       // 用全局默认(regular)
  if (sw <= 1.5) return 'light'
  if (sw >= 2.5) return 'bold'
  return 'regular'
}

// 用高阶函数把一个 Phosphor 组件包装成"lucide 兼容组件"
function compat(PhIcon: React.ComponentType<PhForwardProps>) {
  return function Icon({ strokeWidth, absoluteStrokeWidth, ...rest }: LucideCompatProps) {
    return <PhIcon weight={weightFromStroke(strokeWidth)} {...rest} />
  }
}

// —— 名称映射(节选)——
export const Search = compat(MagnifyingGlass)
export const SearchIcon = Search            // lucide 的 *Icon 别名
export const Trash2 = compat(Trash)
export const Trash2Icon = Trash2
export const Home = compat(House)
export const Settings = compat(Gear)
// ...（全量见 §4）
```

全局默认尺寸/字重(可选,统一观感):在应用根部包一层
`<IconContext.Provider value={{ size: 16, weight: 'regular' }}>`。

**缺失图标兜底**:Phosphor 没有对应项的少数 lucide 图标,适配层内**保留 import 少量 lucide 原图标**直接 re-export(可长期共存),或选近似 Phosphor 单图标(见 §4 决策)。

## 4. 名称映射

lucide/Phosphor 命名差异大(不是仅大小写),多数需**语义映射**。三类:

### 4a. 高置信度映射(样例,约占多数)

| lucide | Phosphor | | lucide | Phosphor |
| --- | --- | --- | --- | --- |
| Home | House | | Search | MagnifyingGlass |
| Settings/Settings2 | Gear/GearSix | | Trash2 | Trash |
| Plus | Plus | | X | X |
| Check | Check | | User/Users | User/Users |
| Bell | Bell | | Calendar | Calendar |
| Copy | Copy | | Download | DownloadSimple |
| Upload | UploadSimple | | Eye/EyeOff | Eye/EyeSlash |
| Lock | Lock | | Mail | Envelope |
| Menu | List | | MoreHorizontal | DotsThree |
| Pencil/Edit | PencilSimple | | RefreshCw/RefreshCcw | ArrowsClockwise |
| LogOut/LogIn | SignOut/SignIn | | Filter | Funnel |
| Globe | Globe | | Info | Info |
| Loader/Loader2 | CircleNotch(转) | | ChevronDown/Up/Left/Right | CaretDown/Up/Left/Right |
| ChevronsUpDown | CaretUpDown | | ArrowUp/Down/Left/Right | ArrowUp/Down/Left/Right |
| ExternalLink | ArrowSquareOut | | Link/Link2 | LinkSimple |
| Wallet | Wallet | | CreditCard | CreditCard |
| Wrench | Wrench | | Shield/ShieldCheck | Shield/ShieldCheck |
| Zap | Lightning | | Sparkles | Sparkle |
| Rocket | Rocket | | Key/KeyRound | Key |
| Database | Database | | Server | HardDrives |
| Cloud | Cloud | | Code/Code2 | Code |
| Terminal | Terminal | | FileText | FileText |
| Image/Images | Image/Images | | Video | VideoCamera |
| Play/Pause | Play/Pause | | Clock | Clock |
| Tag/Tags | Tag/Tags | | Gift/Trophy/Crown | Gift/Trophy/Crown |
| Coins | Coins | | DollarSign | CurrencyDollar |
| Receipt/ReceiptText | Receipt | | Ticket | Ticket |
| Package | Package | | Layers/Layers3 | Stack |
| LayoutDashboard | SquaresFour | | Grid2X2 | GridFour |
| Table/Table2 | Table | | List | List |
| ListOrdered | ListNumbers | | ListChecks | ListChecks |
| BarChart3 | ChartBar | | PieChart | ChartPie |
| AreaChart | ChartLine | | TrendingUp/Down | TrendUp/TrendDown |
| Gauge | Gauge | | Palette | Palette |
| SwatchBook | Swatches | | Languages | Translate |
| QrCode | QrCode | | Paperclip | Paperclip |
| Send | PaperPlaneTilt | | MessageCircle | ChatCircle |
| Mic | Microphone | | Headphones | Headphones |
| Monitor/Laptop | Monitor/Laptop | | Sun/Moon | Sun/Moon |
| MoonStar | MoonStars | | Power | Power |

（完整 239 行在实施期用脚本对 `@phosphor-icons/core` 目录逐一校验后产出,避免手写笔误。）

### 4b. 需决策清单(compound / 罕见,约 20-30 个)

Phosphor 多为**单概念图标**,lucide 的"复合图标"多无 1:1:

`ServerCog, UserCog, CalendarClock, CalendarDays, ShieldAlert, MessageCircleWarning,
FileWarning, FileCode2, HeartPulse, HeartHandshake, PlugZap, Construction, WalletCards,
NotepadText, ClipboardPaste, Route, Sigma, Webhook, Dices, FlaskConical, TestTube,
ServerCog, TerminalSquare, ScrollText, Telescope, Landmark, Building2, Presentation,
GraduationCap`

处置策略(二选一,§末问你):
- **优先近似 Phosphor 单图标**(视觉最统一)。如 `ShieldAlert→ShieldWarning`、`Landmark→Bank`、`Building2→Buildings`、`FlaskConical→Flask`、`Sigma→Sigma?`、`ServerCog→(HardDrives+Gear 取一)`。
- **保留 lucide 兜底**(零风险,少数图标风格略不统一)。

### 4c. HugeIcons(24)映射 + 独立 codemod

Huge 的 API 不同:`<HugeiconsIcon icon={SearchIcon} strokeWidth={2} className=.. />`
→ Phosphor `<MagnifyingGlass className=.. />`(改组件 + 去掉 `icon=`/`strokeWidth=` 属性)。

样例:`Add01Icon→Plus`、`Cancel01Icon→X`、`ArrowRight01Icon→CaretRight`、
`Loading03Icon→CircleNotch`、`Wrench01Icon→Wrench`、`SidebarLeftIcon→Sidebar`、
`SmartPhone01Icon→DeviceMobile`、`LaptopIcon→Laptop`、`Tick02Icon→Check`、
`UnfoldMoreIcon→CaretUpDown`、`MoreHorizontalCircle01Icon→DotsThreeCircle`…

## 5. Codemod 计划

1. **生成完整映射**:装 `@phosphor-icons/react` + `@phosphor-icons/core`;脚本读取 §1 的 239/24 清单,对 core 目录校验每个目标名 → 输出「已匹配 / 需人工补缺」两份清单。人工补 4b。
2. **写适配层** `@/components/icons`(§3),含全部具名 + `*Icon` 别名 + 缺失兜底。
3. **lucide codemod**:脚本(ts-morph 优先,正则兜底)把 `from 'lucide-react'` → `@/components/icons`,保留原具名/别名/`as` 重命名。
4. **Huge codemod**:单独脚本,按 4c 替换组件并清理 `icon=`/`strokeWidth=`。
5. **动态 `icon:` 引用**:同名导出天然兼容,列清单人工抽查(侧栏/系统设置/渠道/定价配置)。
6. **分批 PR**:① UI 基础组件(`components/ui/*`)→ ② 布局/侧栏/头部 → ③ 各 feature 模块。每批独立可回归。

## 6. 验证

- 每批:`typecheck`(tsgo)→ `oxlint`(仅改动文件)→ `build`(rsbuild)。
- 逐屏视觉回归:侧栏导航、表格行操作、按钮内图标、状态徽标、空态、图表旁图标、下拉/菜单箭头。
- 保留 `lucide-react` 依赖直到全量确认无回退,再评估是否移除。

## 7. 风险 & 回滚

- **视觉重量/尺寸变化**:Phosphor 观感与 lucide 不同 → 用 `IconContext` 统一 `size/weight`,个别处微调。
- **缺失图标**:适配层 lucide 兜底,可长期共存,不阻塞。
- **回滚**:适配层一处改回 `export * from 'lucide-react'` 即整体还原;或反向 codemod。
- **影响所有主题**:发布前在多个主题(default/樱花/几款深色)抽查。

## 8. 分阶段 & 估算

| 阶段 | 内容 | 估算 |
| --- | --- | --- |
| P0 | 装依赖 + 生成/校验完整映射 + 补缺 | 0.5-1d |
| P1 | 适配层 + 试点一个模块(侧栏 + `components/ui`)给你看效果 | 0.5d |
| P2 | 全量 codemod(lucide)分批 | 1d |
| P3 | Huge codemod + 动态引用抽查 | 0.5d |
| P4 | 全主题视觉回归 + 微调 + 发布 | 1d |
| 合计 | | **~3-4 人日** |

## 9. 待你拍板

1. 是否批准进入实施?建议 **P1 先试点一个模块**给你看观感,满意再全量。
2. 缺失/罕见图标:**优先近似 Phosphor** 还是 **保留 lucide 兜底**?
