# Phase 4 质量门禁与关键路径回归规格

## 目标

为 Torch AI 当前二开代码建立一次可复现的发布前质量检查。重点是确认已有能力没有被最近的钱包支付、拼团、返现、视频/素材和渠道监控改动破坏，并把线上商户验收和本地代码验收分开记录。

## 用户可见范围

本 change 不新增用户功能。它只会：

1. 修复检查中确认的质量门禁缺口或真实回归；
2. 为关键行为补充/调整测试；
3. 补齐质量检查和线上验收维护文档。

## 质量门禁

### Backend

- root module：`go vet ./...`、`go build ./...`。
- 独立 `relaykit`：`GOWORK=off go vet ./...`、`GOWORK=off go build ./...`、`GOWORK=off go test ./...`。
- root/relaykit 回归：按 `Makefile` 的 `make test` 运行，保持 SQLite/MySQL/PostgreSQL 兼容约束。
- root embed 资产必须在干净 checkout 中可解析；CI 不应因缺少 ignored 的 `web/classic/dist` 或 `web/canvas/dist` 目录而在编译阶段失败。

### Frontend

- `bun run typecheck`
- 当前 change 修改或直接影响的 default 前端文件定向 lint
- `bun run build`
- `bun test`
- `bun run i18n:sync` 后检查 `_reports/_sync-report.json`，不接受缺键或额外键；新增用户可见文案必须有英文和简体中文。

当前 Windows 工作站可通过 `npx --yes bun` 运行项目 Bun CLI；`typecheck`、`test`、`build` 和 `i18n:sync` 已通过。`bun run lint` 全量检查仍失败，当前历史 lint debt 基线为 classic 1,059 errors / 236 files、default `src` 341 errors / 147 files，共 1,400 errors / 383 files。用户已确认将这批历史 lint debt 拆入独立后续 change；本 change 只验收修改或直接影响的 default 前端文件定向 lint，不能将定向通过写成全量通过。

## 回归矩阵

| 区域 | 必须观察的行为 | 权限/开关边界 |
| --- | --- | --- |
| 钱包/支付 | 付款方式分类、金额下限、跳转 URL 安全、Native/H5/JSAPI 分流、二维码轮询 | 登录用户；支付回调公开入口由处理器验签；商户凭据只来自管理员设置 |
| 邀请返现 | 用户查看记录、管理员比例配置、发放、作废、余额入账 | 用户接口 UserAuth；管理接口 AdminAuth；总开关关闭时不生成可用返现 |
| 拼团 | 信息/大厅/详情、开团/参团/取消、结算/退款、管理员套餐和订单操作 | 用户接口 UserAuth；管理接口 AdminAuth；GroupBuyEnabled 关闭时业务不可用 |
| 认证 | 登录、登出、刷新、OAuth/微信绑定边界、认证页重定向 | 公开登录入口；个人操作 UserAuth；新增微信登录保持搁置 |
| 视频/素材库 | 视频提交/轮询、asset:// 选择、素材归属与删除 | 页面需登录；素材 API 支持 TokenOrUserAuth 并按用户隔离 |
| 渠道监控 | 总览/详情、数据缺失和分级状态 | 页面与 API 需登录；不暴露管理员渠道管理接口 |
| 接入文档 | `/docs` 公开可达、语言切换、base URL/示例准确 | 不依赖登录；外链文档开关与站内文档开关分离 |

## 实施边界

- 首轮优先处理已被检查直接证明的 CI embed 缺口；若检查发现其他真实回归，再按单个验收项建立最小修复和测试。
- 全量 lint debt 已由用户确认拆为独立后续 change；本 change 维持修改或直接影响的 default 文件定向 lint，不通过关闭规则、降低错误级别或忽略目录改变全量基线。
- 不为了提升覆盖率添加 smoke、随机、sleep、日志断言或实现细节测试。
- 不把线上支付凭据、微信客户端、支付宝/微信回调连通性纳入本地 Build 的通过条件；它们进入维护文档的线上验收清单。

## 完成定义

所有 A1-A7 验收项均为 `passed` 或有明确、可复现、由环境造成的 `blocked` 记录；没有未说明的失败。Native Verify 报告必须逐项覆盖，Archive 前同步维护状态文档和 changelog（若产生用户可见代码变更）。
