# Payment Gateway Mode Isolation

## 目标

应用必须以同一代码基线支持两个互斥的 EPay-family 支付运行模式。国内实例使用原版 Legacy EPay；国际实例使用 GMPay Native。Root 管理员可在支付配置页修改目标模式，但应用只在启动时从当前实例的隔离数据库读取并冻结生效模式。保存新值不得在运行期热切换协议。

## 管理配置与启动冻结

1. 可持久化 Option `PaymentGatewayMode` 只接受 `epay_legacy` 和 `gmpay_native`。
2. Option 不存在或为空时使用 `epay_legacy`，保持现有安装兼容并作为管理页默认选项。
3. 通用 Option PUT 只允许 Root 保存两个合法值；非法值必须在持久化前拒绝。
4. 应用在主数据库初始化和 Options 加载完成后验证并冻结生效模式；若数据库中存在非法值，必须在 HTTP 服务启动前失败，且错误不包含地址、PID、密钥或签名。
5. 后台保存新目标值不改变已冻结的生效值。所有下单、公开支付能力和回调必须继续使用启动时值，直到应用重启。
6. 模式不从 HTTP Host、转发头、请求参数、系统名称或支付方式名称推断。所有同一实例副本必须在重启后使用同一数据库配置。

## Legacy EPay 模式

1. 钱包已配置的普通 EPay 方式继续使用现有 MAPI、明确 404 时的 `/submit.php` 兼容路径和 MD5 回调。
2. 支付方式名称即使为 `usdt.tron`，也不能单独触发 GMPay Native 客户端、HMAC 回调或 Crypto checkout。
3. 平台和代理 GMPay 回调必须在解析请求、验签、查单或入账前失败关闭。
4. 原有金额、支付方式、订单归属、代理归属、重复回调和幂等结算检查保持不变。

## GMPay Native 模式

1. 普通钱包、订阅、拼团和代理向平台预付只有同时满足实例模式为 `gmpay_native`、方式已在当前实例配置、方式精确为 `usdt.tron` 时才能创建 Native GMPay 订单。
2. 其他 EPay-family 钱包方式必须在持久化订单和发起网关请求前拒绝；Stripe、Creem、Waffo、官方支付宝和微信等独立 Provider 不受影响。
3. 旧 `/api/user/pay` 不能绕过可信模式进入 Legacy `/submit.php`。
4. Native checkout 继续返回现有结构化 Crypto 数据；不得返回、打开、嵌入或编码 GMPay 托管支付页。
5. 平台和代理 GMPay 回调继续要求 JSON、请求体上限、PID、HMAC-SHA256、成功状态、金额、`usdt.tron`、租户归属和幂等结算。
6. 平台 GMPay 回调在验签和通用字段校验后，必须按本地订单唯一分流：普通钱包调用用户额度结算，订阅调用订阅订单结算，拼团调用拼团结算，代理预付调用代理钱包结算。不得因订单类型识别失败而回退到普通钱包入账。
7. 错误模式的 Legacy EPay 回调不得改变订单、额度、代理钱包、拼团、订阅或其他数据。

## 管理端与配置边界

1. Root 支付设置页提供两个目标模式：“国内站 / Legacy EPay”（`epay_legacy`）和“国际站 / GMPay Native”（`gmpay_native`），默认为前者。
2. 页面必须同时展示已冻结的当前生效模式和数据库中的目标模式；两者不同时显示“保存成功，重启后生效”状态和明确重启说明。
3. 保存模式不得改变运行中处理器的协议分支；支付方式模板和公开能力在重启前仍按当前生效模式显示。
4. `PayAddress`、`EpayId`、`EpayKey` 和 `PayMethods` 继续保存在各实例自己的 Options 中；现有密钥过滤和空值不覆盖行为保持。
5. Native 模式提供 `GMPay USDT (TRON)` 模板；Legacy 模式保留原版 EPay 模板。模板只减少误配，后端守卫始终是安全边界。

## 订阅 GMPay Native

1. Native 模式下订阅只将已配置的 `usdt.tron` 暴露为 EPay-family 方式；余额、Stripe、Creem 和 Waffo Pancake 等独立 Provider 保持原有可用性。
2. 下单前仍验证套餐启用状态、价格、用户归属和每用户购买上限；无效请求在创建 `SubscriptionOrder` 和网络调用前拒绝。
3. 成功创建 Native 订单后返回与钱包一致的结构化 `crypto` 数据，状态查询仅允许订单所有者访问。
4. 成功回调必须调用现有 `CompleteSubscriptionOrder` 事务，保持套餐快照、权益生成、用户组更新、购买上限复核和幂等性；不得为同一订单创建多份权益。

## 拼团 GMPay Native

1. Native 模式下拼团能力仅将已配置的 `usdt.tron` 暴露为 EPay-family 方式；微信和支付宝直连等独立 Provider 保持原有可用性。
2. 伪造的其他 EPay-family 方式必须在创建拼团草稿、占用名额、创建参与者或 `TopUp` 记录前拒绝。
3. Native 创建/参团成功后返回结构化 `crypto` 数据；本地订单仍记录 `GroupBuyId`、用户、实付金额和支付方式。
4. 成功回调必须调用现有 `TrySettleGroupBuyOrder` 事务，保持名额、成团门槛、阶梯额度、团状态和重复回调幂等规则。
5. GMPay 不提供本系统可信的自动退款接口时，拼团失败的退款依旧按现有“网关手工退款后后台标记”规则处理，不伪造自动退款成功。

## 代理预付与白标用户 GMPay Native

1. 代理向平台预付使用平台全局 GMPay 地址、PID 和密钥，通知地址为平台 GMPay 回调；不使用该代理面向白标用户的商户凭据。
2. 预付订单继续记录 `AgentPrepayId`、所有者、支付金额和支付方式；创建成功后返回结构化 `crypto` 数据。
3. 成功回调必须通过现有 `TryCompleteAgentPrepay` 事务且只增加目标代理钱包，不增加下单用户额度；重复回调最多入账一次。
4. 代理白标终端用户的普通钱包支付继续使用该代理的地址、PID、密钥和 `/api/agent/:id/gmpay/notify`；路由代理 ID、凭据或订单归属不匹配时必须在结算前拒绝。

## 结构化 Native 收银台

1. 四类 Native 产品共用同一结构化 `crypto` 数据契约：本地订单号、网关订单号、原始金额、精确 USDT 应付金额、TRON 收款地址、`USDT`、`TRON`、过期时间和可选服务器时间。
2. 站内 Modal 显示地址二维码、完整地址、精确金额、复制操作和倒计时；不保留、打开、嵌入或编码托管支付页 URL。
3. 每类产品通过自己的已登录状态接口轮询；成功、失败、过期、超时和关闭必须清理定时器并防止重叠请求。
4. 成功后分别刷新用户额度、订阅权益、拼团订单/团状态或代理钱包；不得仅关闭 Modal 而留下陈旧数据。

## 数据与升级兼容

1. 本 change 不增加数据库列或迁移，不修改现有生产数据。
2. 现有钱包订单继续使用历史 `PaymentProvider=epay`，避免部署时仍 pending 的国际 Native 订单失去回调兼容。
3. 本 change 新增的订阅、拼团和代理预付 Native 订单也暂时使用现有 `epay` Provider 字符串；协议安全边界由启动模式、`usdt.tron`、HMAC/PID、金额、本地订单类型和归属共同构成。
4. Legacy 和 Native 回调只在正确实例模式下处理，并继续验证订单方法、金额、类型和归属。
5. 若未来需要同一实例同时使用两种 EPay-family 协议，应建立新的 Provider 数据模型和旧 pending 订单迁移窗口，不在本规格范围内实现。

## 部署契约

1. 国内实例在 Root 支付配置页保持默认“国内站 / Legacy EPay”，对应 `epay_legacy`。
2. 国际实例在 Root 支付配置页选择“国际站 / GMPay Native”，对应 `gmpay_native`，保存后重启应用。
3. 两个实例可以从同一个 Git 提交构建和独立发布，但数据库、Redis、支付凭据、渠道、用户和站点配置保持隔离。
4. 不得根据域名自动选择模式，也不得为支付差异创建长期国内/国际源代码分支。选择模式不自动修改语言、币种、品牌、价格、分组或倍率。
