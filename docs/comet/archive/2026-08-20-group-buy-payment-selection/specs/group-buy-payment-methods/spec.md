# Group-buy payment methods

## Scenario: Supported payment methods are advertised

- **WHEN** 支付合规已确认，且官方微信、官方支付宝或一个 Epay 方法已完整启用
- **THEN** `/api/user/groupbuy/info` 的 `payment_methods` 只包含当前拼团 dispatcher 能下单的方法
- **AND** 每个方法包含非空且唯一的 `type` 和可展示的 `name`。

## Scenario: Unsupported top-up providers are not advertised

- **WHEN** 普通充值只启用了 Stripe、Creem、Waffo、Waffo Pancake、余额或其他拼团 dispatcher 不支持的保留 provider
- **THEN** 这些 provider 不出现在拼团 `payment_methods` 中
- **AND** Create/Join 收到伪造的保留 provider 时在创建订单前拒绝请求。

## Scenario: Default and changed selection

- **WHEN** 拼团页面收到一个或多个有效支付方式
- **THEN** 当前选择为空或已失效时自动选择第一项
- **AND** 用户可通过支付方式 Select 切换到其他有效项
- **AND** Select 触发器展示当前项名称
- **AND** Create/Join payload 使用用户最后选择的 `payment_method`。

## Scenario: No supported payment method

- **WHEN** 支付合规未确认、没有配置拼团支持的网关，或接口返回空方法列表
- **THEN** 当前选择保持为空
- **AND** 支付方式 Select 与 Create/Join 操作不可提交
- **AND** 页面显示明确的已国际化不可用说明
- **AND** 不显示或提交虚假的 `wechatpay` 默认值。

## Scenario: Defensive list normalization

- **WHEN** 客户端收到包含空类型、空名称或重复类型的拼团方法列表
- **THEN** 空项被丢弃
- **AND** 相同类型仅保留首个有效项
- **AND** 选择值始终属于规范化后的列表或为空。

## Requirements

- 拼团支付方式的后端接口 MUST 是当前可执行能力的唯一事实源。
- 普通充值 provider 的存在 MUST NOT 自动代表该 provider 支持拼团。
- Create/Join MUST 在持久化订单之前拒绝空白、未知或保留的非拼团支付方式。
- 前端 MUST 将有效用户选择原样写入 Create/Join `payment_method`。
- 零可用方式 MUST 有明确空态并且不得发送 Create/Join 请求。
- 现有支付合规、provider mismatch、回调幂等和结算不变量 MUST 保持不变。
