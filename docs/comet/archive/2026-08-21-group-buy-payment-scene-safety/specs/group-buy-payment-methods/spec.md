# Group-buy payment methods

## Scenario: Scene-safe WeChat capability advertising

- **WHEN** 客户端请求 `/api/user/groupbuy/info?scene=h5`
- **THEN** 只有官方微信配置完整、支付合规已确认且微信 H5 开关启用时，`payment_methods` 才包含微信支付
- **AND** Native-only 配置不得在该场景发布微信支付。

- **WHEN** 客户端请求 `scene=native`、未提供场景或提供未知场景
- **THEN** 只有官方微信配置完整、支付合规已确认且微信 Native 开关启用时，`payment_methods` 才包含微信支付
- **AND** H5-only 配置不得在该场景发布微信支付。

## Scenario: Scene-safe Create and Join validation

- **WHEN** Create/Join 请求官方微信支付
- **THEN** 后端在任何拼团、参与者或充值订单持久化之前校验请求的 `scene` 是否已启用
- **AND** 空白或未知场景按 `native` 处理
- **AND** 未启用的场景返回明确错误，不得创建或占用名额。

## Scenario: Consistent client scene selection

- **WHEN** 前端运行于普通移动浏览器且不在微信内置浏览器
- **THEN** info、Create 和 Join 均使用 `h5` 场景。

- **WHEN** 前端运行于桌面浏览器或微信内置浏览器
- **THEN** info、Create 和 Join 均使用 `native` 场景。

## Scenario: Payment dispatch failure releases the reservation

- **WHEN** 支付方式和场景通过预校验、Create/Join 已创建 pending 记录，但第三方支付下单失败
- **THEN** 后端立即将当前用户、当前 trade number 的 pending 参与者预占标记为到期
- **AND** 原始支付失败仍返回客户端
- **AND** 清理失败被记录但不覆盖原始支付错误
- **AND** 充值订单不被删除，迟到回调、provider mismatch 和幂等结算语义保持不变。

## Scenario: Other supported payment methods remain stable

- **WHEN** 官方支付宝或有效 Epay 方法已完整启用
- **THEN** 其方法发布、选择和 dispatcher 路径不受微信场景过滤影响。

## Scenario: Default and changed selection

- **WHEN** 拼团页面收到一个或多个有效支付方式
- **THEN** 当前选择为空或已失效时自动选择第一项
- **AND** 用户可通过支付方式 Select 切换到其他有效项
- **AND** Create/Join payload 使用用户最后选择的 `payment_method` 和当前浏览器场景。

## Scenario: No supported payment method

- **WHEN** 当前场景没有可执行支付方式
- **THEN** 当前选择保持为空
- **AND** 支付方式 Select 与 Create/Join 操作不可提交
- **AND** 页面显示已国际化的不可用说明。

## Requirements

- 拼团支付方式接口 MUST 是当前请求场景可执行能力的唯一事实源。
- 前端 MUST 对 info、Create 和 Join 使用同一稳定场景。
- Create/Join MUST 在持久化前拒绝未启用的微信场景。
- dispatch 失败后 MUST 尽力立即释放当前 pending 名额，且不能释放他人或已支付记录。
- 普通充值 provider 的存在 MUST NOT 自动代表该 provider 支持拼团。
- 现有支付合规、provider mismatch、回调幂等和结算不变量 MUST 保持不变。
