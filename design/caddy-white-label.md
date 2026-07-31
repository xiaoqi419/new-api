# 代理白标域名 · Caddy 按需 TLS 反向代理

代理(白标租户)会把自己的域名(例如 `console.agent-a.com`)解析到本平台。为了给「任意数量、随时新增」的代理域名自动签发证书,推荐用 [Caddy](https://caddyserver.com/) 的 **on-demand TLS**,并用平台提供的校验端点做白名单,避免为未授权域名签发证书。

## 平台侧校验端点

```
GET /api/tls/check?domain=<host>
```

- 当 `<host>` 是「已验证(verified)且所属代理为 active」的白标域名时返回 `200`;
- 否则返回 `404`。

Caddy 在为某域名签发证书前会先请求该端点(`ask`),只有 `2xx` 才会继续签发。代理在「代理控制台 → 域名」添加域名并通过 DNS TXT 校验后,该域名才会通过校验、才可被签发证书。

## DNS 配置(代理侧)

1. 在「代理控制台 → 域名」添加域名,系统生成一条校验令牌。
2. 到域名 DNS 处添加:
   - `TXT` 记录:`_newapi-verify.<域名>` = 控制台展示的令牌(用于归属校验)。
   - `CNAME`(或 `A`)记录:把 `<域名>` 指向本平台入口(Caddy 所在主机)。
3. 回到控制台点击「验证」。验证通过后域名进入解析缓存(约 60s 生效)。

## Caddyfile 示例

假设 new-api 后端监听在 `127.0.0.1:3000`,平台主域名为 `platform.example.com`。

```caddyfile
{
	# 仅允许平台校验通过的域名按需签发证书
	on_demand_tls {
		ask http://127.0.0.1:3000/api/tls/check
		interval 2m
		burst 5
	}
}

# 平台主站(固定域名,正常签发)
platform.example.com {
	reverse_proxy 127.0.0.1:3000
}

# 所有代理白标域名:按需签发 + 反代到同一后端
# 关键:必须携带原始 Host,后端据此解析租户(代理)。
https:// {
	tls {
		on_demand
	}
	reverse_proxy 127.0.0.1:3000 {
		header_up Host {host}
		header_up X-Forwarded-Host {host}
		header_up X-Forwarded-Proto {scheme}
	}
}
```

要点:

- **必须透传 Host**:后端 `ResolveTenant` 中间件按 `Request.Host` 解析代理 ID,反代若改写 Host 会导致白标失效。
- `ask` 端点做白名单,`interval`/`burst` 限制签发频率,防止刷证书。
- 平台主域名单独用固定站点块,避免走按需签发。
- 若平台位于更外层的负载均衡之后,确保最外层同样透传原始 Host。

## 校验流程小结

1. 代理在控制台添加域名 → 得到 TXT 令牌。
2. 代理配置 DNS(TXT 校验 + CNAME/A 指向平台)。
3. 控制台点击「验证」→ 平台查 TXT → 标记 verified。
4. 终端用户访问该域名 → Caddy 请求 `/api/tls/check` → `200` → 按需签发证书 → 反代到后端(透传 Host)。
5. 后端按 Host 解析租户 → 登录/注册/品牌均按该代理独立呈现。
