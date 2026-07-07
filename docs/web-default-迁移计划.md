# web/default 迁移执行计划（功能对齐 + 白底浅紫配色）

> 目标：把目前只存在于 **web/classic**（Semi + Vite）的自定义功能，迁移/重建到 **web/default**（React 19 + Base UI/shadcn + Tailwind + TanStack Router/Query + Zod + RHF + TS），采用 web/default 的 UI 元素与样式，配色改为「白为主、浅紫为辅」。
>
> 本文件为**执行计划**，不含代码改动。后端为两套主题共用，**无需后端改动**。
> 品牌保护：QuantumNous / new-api 的所有标识、版权头、元数据在迁移中必须原样保留。

---

## 0. 假设与默认决策（可调整）

以下为在你未逐条拍板前，本计划采用的默认取向。若有不同，指出即可，我据此重排。

| # | 决策项 | 默认取向 |
|---|---|---|
| 1 | 范围 | **全量对齐**，但按 Phase 组织，可随时裁剪为子集 |
| 2 | 战略 | web/default **转为主力**；classic **冻结新功能**、进入维护期（两套 dist 继续共存，不立即退役） |
| 3 | i18n | **zh + en 必交**；fr/ru/ja/vi 先走 en 回退，后续补齐 |
| 4 | 配色 | **定制 `white-purple` 预设**（白底 + 浅紫 primary，表面桥自动淡紫） |
| 5 | 优先级 | **营收/增长优先**（Phase 1 = 返现/邀请/拼团/支付/微信登录） |

---

## 1. 范围

### 1.1 需要迁移（9 个功能缺口）
视频生成、素材库、渠道监控、接入文档（应用内三级）、邀请返现、拼团 + 拼团管理、邀请中心、官方商户直连支付网关 UI、微信 MP 登录。

### 1.2 增量（功能已在 web/default，仅补增强）
- 任务日志「实时耗时」计时（web/default 已有 `usage-logs/task`）
- 排行：确认 `rankings` 是否覆盖「拉新排行 + 用户排行」，否则扩展
- 总览 VChart 与 classic 图表对齐核对

### 1.3 明确不做（N/A）
- APIMART 外观预设、UI 弧度/pill 导航/滚动箭头等 classic 专属 CSS 补丁（web/default 有自研设计系统）
- 任何后端改动（共用后端已就绪）

---

## 2. 后端就绪性（复用的 API 清单）

以下端点 classic 已在调用，**后端已就绪，直接复用**：

| 功能 | 端点 |
|---|---|
| 视频生成 | `POST /v1/video/generations`（提交）、`GET /v1/video/generations/{taskId}`（轮询）、`GET /api/token/`（取密钥）、`GET /api/ark_asset`（素材选择） |
| 素材库 | `GET /api/ark_asset`、`POST /api/ark_asset`、`DELETE /api/ark_asset/{id}` |
| 渠道监控 | `GET /api/group/monitor?days=N`、`GET /api/group/monitor/detail?group=X&days=N` |
| 邀请返现 | `GET /api/rebate/`、`POST /api/rebate/pay`、`POST /api/rebate/cancel`、`GET /api/rebate/users`、`PUT /api/rebate/user_ratio`、`GET /api/rebate/ranking` |
| 拼团（用户） | `GET /api/user/groupbuy/detail?no=`、`POST /api/user/groupbuy/join`、`GET /api/user/topup/info` |
| 拼团管理 | `/api/group_buy/packages`(GET/POST/PUT/DELETE)、`/api/group_buy/orders`(GET, `/{id}`, `/{id}/cancel`)、`/api/group_buy/refunds`(GET, `/{id}/done`) |
| 邀请中心 | `GET /api/user/aff`、`GET /api/user/self`、`GET /api/user/self/rebate` |
| 接入文档 | 无后端（数据驱动 + baseUrl 渲染） |
| 官方直连支付 | 复用 system-settings 的 option 键（网关配置项） |
| 微信 MP 登录 | 复用现有微信 OAuth/扫码端点 |

> 实施时以 classic 源码中的确切 query/字段为准（见 §5–§7 每项标注的来源文件）。

---

## 3. 通用移植配方（每功能标准套路）

每个功能落地 = 4 步（实测自 `routes/rankings/index.tsx`、`features/*`、`hooks/use-sidebar-config.ts`、`lib/nav-modules.ts`）：

1. **路由**：`src/routes/<path>/index.tsx` → `createFileRoute` + Zod `validateSearch` + `beforeLoad`（`getFreshModuleAccess` 做模块开关/鉴权重定向）+ `component`。
2. **feature 目录**：`src/features/<x>/` → 入口组件 + `components/ hooks/ lib/ api.ts types.ts constants.ts`；数据用 `@tanstack/react-query`（`useQuery`/`useMutation`），表单用 RHF + Zod，UI 用 `@/components/ui/*`（Base UI/shadcn），图标用 Hugeicons。
3. **导航注册**：侧栏 nav groups 加 `NavItem` + `hooks/use-sidebar-config.ts` 的 `URL_TO_CONFIG_MAP` + `lib/nav-modules.ts`（若为顶栏模块）。
4. **i18n**：`src/i18n/locales/{zh,en,...}.json` 加键（en 为基准键）。

**单功能 Definition of Done（DoD）**：
- `bun run typecheck` 无错、`bun run lint`(oxlint) 无 error、`bun run build` 通过
- 关键交互有 vitest/RTL 或 E2E 冒烟
- zh/en 文案齐全，其余语言有回退
- 明暗色 + 白紫预设下视觉正常
- 与 classic 行为/字段对齐（同一后端契约）
- 版权头 + 品牌标识保留

---

## 4. Phase 0 · 配色与基建（0.5–1 天）

| 任务 | 说明 | 验收 |
|---|---|---|
| 新增 `white-purple` 预设 | `styles/theme-presets.css` 加 `[data-theme-preset='white-purple']`：白底 `oklch(1 0 0)` + 浅紫 primary（约 `oklch(0.62 0.16 305)`），依赖既有「语义表面桥」自动生成淡紫卡片/边框/侧栏 | 切到该预设后：白底、浅紫点缀、明暗均正常 |
| 注册到主题选择器 | 在主题设置 UI 的预设列表加入该项（含中英文名） | 用户可在设置里选中 |
| 试点热身 | 用一个最小功能（如「邀请中心」只读页）跑通 §3 全流程，沉淀模板 | 模板可复用，团队熟悉栈 |
| 策略确认 | 确认默认主题/共存策略、i18n 语言范围 | 决策落文档 |

---

## 5. Phase 1 · 增长与营收（约 2–3 周）

### 5.1 邀请中心 Invitation（S–M，2–3d）
- **来源**：`web/classic/src/pages/Invitation/index.jsx`
- **路由**：`src/routes/_authenticated/invitation/index.tsx`（module: `personal`）
- **feature**：`features/invitation/`（邀请码/链接、返利记录表、复制/二维码）
- **API**：`/api/user/aff`、`/api/user/self`、`/api/user/self/rebate`
- **验收**：展示邀请码/链接、可复制、返利记录分页正确；未登录重定向登录

### 5.2 邀请返现 Rebate（S–M，2–3d）
- **来源**：`web/classic/src/pages/Rebate/index.jsx`
- **路由**：`src/routes/_authenticated/rebate/index.tsx`（admin）
- **feature**：`features/rebate/`（待返现列表、打款/取消、用户返现比例设置）
- **API**：`/api/rebate/`、`/api/rebate/pay`、`/api/rebate/cancel`、`/api/rebate/users`、`/api/rebate/user_ratio`
- **验收**：列表按状态筛选；打款/取消乐观更新 + `invalidateQueries`；比例保存生效

### 5.3 拼团管理 GroupBuyAdmin（M–L，3–4d）
- **来源**：`web/classic/src/pages/GroupBuyAdmin/index.jsx`
- **路由**：`src/routes/_authenticated/groupbuy-admin/index.tsx`（admin）
- **feature**：`features/groupbuy-admin/`（套餐 CRUD、订单列表/详情/取消、退款处理）
- **API**：`/api/group_buy/packages`、`/api/group_buy/orders`(+`/{id}`,`/{id}/cancel`)、`/api/group_buy/refunds`(+`/{id}/done`)
- **验收**：套餐增删改查、订单三态筛选、退款标记完成均可用

### 5.4 拼团（用户）GroupBuy（M，2–3d）
- **来源**：`web/classic/src/pages/GroupBuy/index.jsx`
- **路由**：`src/routes/_authenticated/groupbuy/index.tsx` 或公开分享页（含 `no` 参数，Zod 校验）
- **feature**：`features/groupbuy/`（拼团详情、参团、充值信息）
- **API**：`/api/user/groupbuy/detail?no=`、`/api/user/groupbuy/join`、`/api/user/topup/info`
- **验收**：分享链接可进入、参团流程完整、金额展示正确

### 5.5 官方商户直连支付网关 UI（M，2–4d）
- **来源**：`web/classic/src/pages/Setting/Payment/*`（微信直连、Waffo、Waffo Pancake、Creem、Alipay、Stripe、通用）
- **落点**：扩展 `features/system-settings/billing/`（option 分节）
- **API**：system-settings option 键（复用）
- **验收**：各网关配置项可读写保存；与 classic 字段一致；开关联动正确

### 5.6 微信 MP 登录（S–M，2–3d）
- **来源**：classic 登录页微信登录按钮/扫码流程
- **落点**：`features/auth/`（登录页加「微信登录」入口 + 扫码/回调）
- **API**：现有微信 OAuth/扫码端点
- **验收**：扫码登录闭环、错误态提示、与其他登录方式并存

---

## 6. Phase 2 · AI 媒体（约 1.5–2 周）

### 6.1 视频生成 VideoGeneration（L，4–6d）
- **来源**：`web/classic/src/pages/VideoGeneration/index.jsx`
- **路由**：`src/routes/_authenticated/video-generation/index.tsx`（新 console 模块）
- **feature**：`features/video-generation/`
  - 模型/密钥选择、参数表单（分辨率/时长/比例/有声/首尾帧/图生视频等，RHF+Zod）
  - 提交 + 轮询进度 + 视频预览 + 从素材库选图
- **API**：`POST /v1/video/generations`、`GET /v1/video/generations/{taskId}`、`GET /api/token/`、`GET /api/ark_asset`（axios + bearer）
- **验收**：提交成功、进度实时、完成后可播放/下载；参数与 SEEDANCE 契约一致
- **导航**：加 `NavItem` + `URL_TO_CONFIG_MAP` 项 + 模块开关

### 6.2 素材库 AssetLibrary（M，3–4d）
- **来源**：`web/classic/src/pages/AssetLibrary/index.jsx`
- **路由**：`src/routes/_authenticated/asset-library/index.tsx`
- **feature**：`features/asset-library/`（网格/列表、预览、上传登记、删除；与视频生成互通选图）
- **API**：`GET/POST/DELETE /api/ark_asset`
- **验收**：列表分页/筛选、预览、删除；可在视频生成里被引用

---

## 7. Phase 3 · 运维与文档（约 1.5–2 周）

### 7.1 渠道监控 GroupMonitor（M–L，3–5d）
- **来源**：`web/classic/src/pages/GroupMonitor/{index,GroupMonitorDetail}.jsx`
- **路由**：`src/routes/_authenticated/channel-monitor/index.tsx` + `detail`（`group` 参数，Zod）
- **feature**：`features/channel-monitor/`（分组健康卡片：可用率/延迟/吞吐 + 迷你条 + 详情图表，用 VChart）
- **API**：`/api/group/monitor?days=`、`/api/group/monitor/detail?group=&days=`
- **验收**：概览卡片、时间窗切换、详情钻取图表正确

### 7.2 接入文档（应用内三级）Docs（M，3–4d）
- **来源**：`web/classic/src/pages/Docs/{index,docData}.js(x)`
- **路由**：`src/routes/docs/index.tsx`（公开或半公开；注意 web/default 现有 `docs` 仅为外链开关，需扩为应用内页）
- **feature**：`features/docs/`（数据驱动 `buildDocGroups(baseUrl)`、三级折叠 TOC、方法徽章 GET/POST/…、scroll-spy、代码块复制）
- **数据**：迁移 `docData` 为 TS；按真实路由分组（排除即梦独立、排除内部管理接口）
- **验收**：三级导航 + 方法徽章 + 滚动高亮；baseUrl 可切换；无内部管理接口

### 7.3 任务日志实时计时（XS–S，0.5–1d）
- **落点**：web/default 现有 `usage-logs/task` 视图
- **内容**：进行中任务显示实时耗时（`now - submit_time`，1s 跳动，完成后切总耗时）
- **验收**：进行中实时跳动、完成切换、无活动任务不空转

### 7.4 排行/总览对齐（S，1–2d）
- 确认 `rankings` 是否已含「拉新排行 + 用户排行」，缺则扩展（复用 `/api/rebate/ranking` 等）
- 总览 Dashboard 的 VChart 与 classic 对齐核对

---

## 8. Phase 4 · QA / i18n / 回归 / 切换（约 1 周）

- 六语言检查（zh/en 完整，fr/ru/ja/vi 回退无缺失键）
- 全量 `typecheck` + `oxlint` + `build`；关键路径 vitest/RTL + 手动 E2E 回归
- 白紫预设 + 明暗色全页走查
- 灰度：两套 dist 均打包，按配置/用户选择切换默认主题（见 §12）
- 文档与 `AGENTS.md`（如涉及）更新

---

## 9. 里程碑与排期

| 里程碑 | 内容 | 累计工期（单人） |
|---|---|---|
| M0 | Phase 0 配色 + 基建 + 试点 | ~1 天 |
| M1 | Phase 1 营收增长（返现/邀请/拼团×2/支付/微信） | +2–3 周 |
| M2 | Phase 2 视频生成 + 素材库 | +1.5–2 周 |
| M3 | Phase 3 渠道监控 + 文档 + 计时 + 排行对齐 | +1.5–2 周 |
| M4 | Phase 4 QA/i18n/切换 | +1 周 |
| **合计** | 全量对齐 | **≈ 6–9 周（30–45 人日）** |

> 多人并行可显著压缩：Phase 1/2/3 各功能间无强耦合，可分派并行。

---

## 10. 风险登记册

| 风险 | 等级 | 缓解 |
|---|---|---|
| 双前端维护（功能写两遍） | 高 | 明确 web/default 主力、classic 冻结新功能；迁移期设代码冻结窗口 |
| 技术栈切换（TanStack/BaseUI/Zod/RHF/严格 TS） | 中 | Phase 0 试点热身 + 模板沉淀；先易后难 |
| i18n 翻倍（6 语） | 中 | zh/en 必交，其余回退，后补 |
| classic 仍在演进（移动靶） | 中 | 迁移窗口冻结 classic 功能，或接受二次同步 |
| 设计还原（三级文档/视频生成等非标 UI） | 中 | 不做 1:1 复刻，按 Base UI 重设计，先出线框确认 |
| 默认主题切换冲击老用户 | 中 | 灰度、可回退、不强切 |
| 品牌保护（QuantumNous/new-api） | 合规 | 每文件保留版权头与标识 |
| API 契约细节偏差 | 低 | 以 classic 源码字段为准逐一核对（§2） |

---

## 11. 质量门禁（每个 PR 必过）

- `bun run typecheck` 0 error
- `bun run lint`（oxlint）0 error
- `bun run build` 通过
- 相关 vitest/RTL 通过（关键交互）
- zh/en 文案齐全
- 明暗 + 白紫预设视觉走查
- 版权头/品牌保留

---

## 12. 灰度与回滚

- Docker 已同时构建 `web/default/dist` 与 `web/classic/dist` 并嵌入二进制，两套主题天然共存。
- 切换默认主题走后端配置/用户选择，可按比例灰度；出问题即切回 classic，无需回滚构建。
- 建议：先内测账号切 web/default + 白紫预设验收，再对新用户默认、老用户可切换。

---

## 13. 待你拍板（影响细化）

1. 范围：全量 or 子集（先营收类）？
2. 战略：web/default 转主力 + classic 冻结？还是长期双维护？
3. i18n：仅 zh/en，还是全六语？
4. 配色：定制 `white-purple`，还是用现成 `lavender-dream`？
5. 优先级顺序是否按「营收优先」？

> 确认后，我可把每个功能进一步拆成带勾选项的任务卡（组件级清单 + 具体字段/接口参数），仍不写代码。
