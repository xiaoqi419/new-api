# GMPay 隔离估算与兜底验证

## Goal

GMPay 网络手续费估算必须兼容真实 TronGrid 响应，并在动态链上或行情估算失败时安全地使用管理员兜底。验证过程隔离于生产支付和资金。

## Behavior

1. TRON 链参数解析只提取 `getEnergyFee` 和 `getTransactionFee`，忽略无关条目、缺失 `value` 条目及无关负值；目标键缺失、非法或为负时仍 fail-closed。
2. 真实 TRON RPC + 主行情源成功时，估算返回正的 `native_amount`、`fee_amount`、`total_amount`，并记录 RPC/价格来源和时间戳。
3. 主行情源 HTTP 429 或响应无效时，自动尝试允许的 CoinPaprika 备用源；备用响应必须匹配资产身份、币种、价格和新鲜度。
4. 动态估算错误只能进入已校验的管理员百分比或固定金额兜底；兜底输出包含明确的 fallback 来源，不伪装成链上动态报价。
5. 验证环境使用独立配置和 SQLite；任何测试网关使用独立容器、数据、网络、端口和测试商户凭据。不得触发真实支付或链上写操作。

## Acceptance

- A1：真实 TronGrid 参数响应形状的回归测试通过，且 `parseTRONChainFees` 不因无关或缺失字段失败。
- A2：真实公开端点返回一条有效 TRON/USDT/USD 估算，金额字段和证据字段均有效。
- A3：模拟 CoinGecko 429 时，CoinPaprika 回退返回有效报价且来源为备用主机。
- A4：百分比和固定金额管理员兜底在动态错误时返回预期金额、币种和 fallback 来源。
- A5：测试运行不连接生产数据库、Redis、GMPay 商户网关，不创建真实支付或链上交易。

## Non-goals

- 不改变生产支付协议、商户配置、用户余额或订单结算；不部署 EPUSDT 或创建订单。
- 不发送真实链上交易、不调用真实支付成功回调、不把测试订单标记为已支付。
