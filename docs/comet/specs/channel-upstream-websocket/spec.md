# 官方 Responses WebSocket 与 HTTP 传输

## 范围

本规格取代旧的 CPA upstream_transport 自动桥接功能。Responses 使用固定官方版本9310231b3的通用WS实现；保留二开的鉴权、租户隔离、限流、路由、思考后缀开关和计费保护。

## 行为

- 客户端GET升级 `/v1/responses`（兼容 `/v1/openai/responses`）时，按官方支持列表及 responses_websocket_enabled 选择上游WS；高级自定义渠道还需无转换的Responses路由。
- 普通POST HTTP/SSE请求始终走HTTP上游，不因旧upstream_transport值改用WS。旧JSON可读取但不隐式开启官方开关；保存时移除废弃配置可接受，不批量重写生产记录。
- CPA专项跨请求池、自动预热、路由探测、HTTP/SSE到WS桥接及旧界面控件移除。官方会话内复用、generate原始WS控制、stream_id/event_id关联遵循官方契约。
- 每轮重新验证用户/令牌权限、并发和限流，正常结算只由请求worker处理。渠道显式思考后缀在实际WS出站前仍应用。
- 不自动删除任何生产渠道、Key或CPA服务。未知上游能力按官方错误路径处理，不承诺降延迟。

## 非WS二开保留

日志顶部TPM旁的当日缓存率与总Token、加权计算、账号隔离及本地自然日行为继续保留；退役传输不影响这些界面能力。

## 验收

真实本机WS fixture验证多轮、错误关联、取消、令牌撤销、租户并发、账务；普通HTTP/SSE和旧设置有回归。默认与Classic编辑器移除旧传输控件，官方开关显式状态保留。relaykit独立构建和协议测试通过，未使用旧CPA live结果冒充新链路验证。
