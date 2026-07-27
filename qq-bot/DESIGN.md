# QQ 群机器人对接中转站 · 整体方案

> 状态:方案设计(待评审)。本文只做设计,不含实现。
> 目标:独立部署的 QQ 群机器人,对接中转站(new-api),实现「群签到得积分 → 满额自动兑换额度」「每日定时群发消耗排行」「群管理(踢人/拉黑/禁言等)」,消息与规则全部可配置。

---

## 1. 总览

分两部分:

| 部分 | 位置 | 说明 | 是否改动中转站 |
|---|---|---|---|
| **Part A** | new-api(中转站) | 新增「一次性 QQ 绑定验证码」+「QQ 机器人配置」后台管理(均为纯新增) | 是(纯新增) |
| **Part B** | `qq-bot/`(独立项目) | NapCatQQ + Node/TS 机器人,**单独服务器**部署,自带 docker-compose | 否 |

设计原则:
- 机器人与中转站**解耦**,只通过 HTTPS 调中转站的管理 API。
- 中转站的改动最小化,新增部分不影响现有(加额度、消耗排行、查用户)逻辑,后者全部复用现成接口。
- **机器人业务配置统一在中转站后台配置**:群、管理员、积分规则、排行、黑名单开关、指令关键词、消息文案等,全部在中转站「QQ 机器人设置」页面维护;机器人启动时拉取、定时刷新。
- 机器人服务器上**只保留极简「引导配置」**(如何连 QQ、如何连中转站),不再在 yml 里写业务规则。

---

## 2. 部署拓扑(机器人单独服务器)

```
┌───────────────────────┐          ┌─────────────────────────────┐
│   服务器 A(已存在)    │          │   服务器 B(机器人,新增)     │
│                       │  HTTPS   │                             │
│   new-api (中转站)     │◄─────────┤   qq-bot (Node/TS)          │
│   + Part A 绑定码接口  │  管理API  │        │                    │
│   https://你的域名     │          │        │ OneBot v11 (WS)    │
└───────────────────────┘          │        ▼                    │
                                    │   NapCatQQ(登录机器人QQ)   │
                                    └──────────────┬──────────────┘
                                                   │ QQ 协议
                                                   ▼
                                              QQ 群(多个)
```

- 服务器 B 上用一个 `docker-compose.yml` 同时起 `napcat` 与 `bot` 两个容器。
- 机器人通过公网 HTTPS 访问中转站管理 API(需保证中转站域名可从服务器 B 访问)。
- 鉴权靠「管理员系统访问令牌」,令牌只保存在服务器 B 的机器人配置中。

---

## 3. 功能清单

### 3.1 普通成员(群内 / 私聊)
| 指令 | 场景 | 行为 |
|---|---|---|
| `签到` | 群 | 每日一次,加积分 |
| `我的积分` | 群/私聊 | 查询当前积分 |
| `绑定 <验证码>` | 私聊 | 用中转站生成的一次性验证码绑定 QQ↔账号 |
| `解绑` | 私聊 | 解除本 QQ 的绑定 |
| `兑换` | 群/私聊 | 手动触发一次兑换(积分≥阈值时) |
| `我的额度` | 私聊 | 查询绑定账号当前额度(调中转站 `GET /api/user/:id`) |
| `帮助` | 群/私聊 | 显示指令说明 |

### 3.2 自动任务
- **满额自动兑换**:签到后若积分 ≥ 阈值且已绑定,自动扣分并给账号加额度(可开关)。
- **每日消耗排行**:cron 到点,拉中转站 `user_ranking`,格式化后群发(可多群)。
- **黑名单自动踢**:监听入群事件,命中黑名单则自动踢出。

### 3.3 管理员(仅「配置的管理员 QQ」或群主/群管,可配置)
| 指令 | 行为 | 底层 OneBot API |
|---|---|---|
| `踢 @某人` | 踢出群 | `set_group_kick` |
| `拉黑 @某人` | 踢出 + 加入黑名单(再进群自动踢) | `set_group_kick(reject_add_request=true)` + 本地黑名单 |
| `解黑 @某人` | 移出黑名单 | 本地黑名单 |
| `禁言 @某人 <分钟>` | 禁言 | `set_group_ban` |
| `解禁 @某人` | 解除禁言 | `set_group_ban(0)` |
| `全员禁言 [开/关]` | 全体禁言 | `set_group_whole_ban` |
| `加分 @某人 <n>` | 手动加积分 | 本地 DB |
| `扣分 @某人 <n>` | 手动扣积分 | 本地 DB |
| `发额度 @某人 <美元>` | 直接给其账号加额度 | 中转站 `add_quota` |
| `排行` | 手动触发一次排行群发 | 中转站 `user_ranking` |
| `广播 <内容>` | 向配置的群群发 | `send_group_msg` |
| `重载配置` | 热重载 config.yaml | - |

> 权限模型:`admins`(配置的 QQ 号列表)恒为管理员;可选 `allowGroupAdmins: true` 让群主/群管也能用管理指令。所有管理指令需二次校验发送者身份,拒绝越权。

---

## 4. Part A · 中转站(new-api)改动

### 4.1 改动范围(全部为新增)
- **绑定码**:新增 `controller/qq_bind.go`;`router/api-router.go` +2 路由;前端 `features/profile/` 新增「QQ 群绑定」卡片;i18n +约 5 键 × 7 语言。
- **机器人配置(后台)**:新增 `setting/qq_bot_setting/config.go`(配置结构 + 持久化)、`controller/qq_bot.go`(读/写/机器人拉取);`router/api-router.go` +路由;前端新增「QQ 机器人设置」后台页 `features/qq-bot/`;i18n 若干键 × 7 语言。
- **不改动**现有用户 / 额度 / 签到 / 排行逻辑;配置持久化复用现成的 Option 系统(与抽奖/签到/身份认证设置相同机制)。

### 4.2 绑定验证码存储
- 有 Redis:键 `qq_bind_code:<code>` = user_id,TTL 300s,校验成功即删除(一次性)。
- 无 Redis:进程内 `map[code]{userId, expireAt}` + 定时清理(单机兜底)。

### 4.3 新增接口契约

**① 生成验证码(登录用户)**
```
POST /api/user/qq_bind_code      鉴权: UserAuth(登录会话)
→ 200 { "success": true, "data": { "code": "394215", "expires_in": 300 } }
```

**② 校验并绑定(机器人调用)**
```
POST /api/user/qq_bind/verify    鉴权: AdminAuth(机器人管理员令牌)
   Headers: Authorization: <管理员令牌>, New-Api-User: <管理员user_id>
   Body: { "code": "394215" }
→ 200 { "success": true, "data": { "user_id": 123, "username": "alice" } }
→ 失败: { "success": false, "message": "验证码无效或已过期" }
```
> 校验接口用 AdminAuth,防止外部爆破验证码反查 user_id。

### 4.4 复用的现成接口(无需改动,已确认存在)
| 用途 | 接口 | 鉴权 |
|---|---|---|
| 给用户加额度 | `POST /api/user/manage` `{id, action:"add_quota", mode:"add", value:<原始quota>}` | AdminAuth |
| 消耗排行 | `GET /api/user_ranking?dimension=quota&start=&end=&limit=` → `items:[{user_id,username,value}]` | AdminAuth |
| 查用户额度 | `GET /api/user/:id` | AdminAuth |

**统一鉴权头**(机器人侧):
```
Authorization: <管理员系统访问令牌>   # 个人中心生成
New-Api-User: <该管理员 user_id>
```

### 4.5 QQ 机器人配置(后台管理,替代 yml 业务配置)

机器人的**业务配置全部在中转站后台维护**,机器人不再从 yml 读这些。

- **存储**:复用 new-api 现成的 Option 持久化(与抽奖/签到/身份认证设置一致),以一段 JSON 存于配置项 `QQBotSetting`。
- **结构** `setting/qq_bot_setting/config.go`(示意):
```go
type QQBotSetting struct {
    Groups           []int64            // 生效群
    Admins           []int64            // 机器人管理员 QQ
    AllowGroupAdmins bool               // 群主/群管是否有管理权
    Points           PointsRule         // perCheckin / redeemThreshold / redeemQuota / autoRedeem
    Ranking          RankingRule        // cron / dimension / windowDays / limit / onlyGroupMembers / toGroups
    Blacklist        BlacklistRule      // autoKickOnJoin
    Commands         map[string]string  // 指令关键词自定义
    Templates        map[string]string  // 消息模板
}
```
- **接口**:
```
GET  /api/qq_bot/config     鉴权: AdminAuth   # 后台加载 + 机器人拉取(同一接口)
PUT  /api/qq_bot/config     鉴权: AdminAuth   # 后台保存(校验群号/管理员/数值范围)
```
- **前端**:后台新增「QQ 机器人设置」页(`features/qq-bot/`),表单化编辑:群列表、管理员列表、积分规则、排行规则、黑名单开关、指令关键词、消息模板(与抽奖设置弹窗风格一致)。
- **机器人侧**:启动时 `GET /api/qq_bot/config` 拉取;之后每 N 秒轮询刷新(可配);群里 `重载配置` 指令可强制立即刷新。拉取失败时用上一次的缓存,保证可用。

> 结果:改群号、改管理员、改积分规则、改文案,都在中转站后台点一点即可,**无需登录机器人服务器改 yml、无需重启机器人**。

---

## 5. Part B · 机器人项目(qq-bot/)

### 5.1 技术栈
Node.js + TypeScript / `node-napcat-ts`(OneBot v11)/ `axios` / `better-sqlite3` / `node-cron` / `zod`(配置校验)/ `pino`(日志)。

### 5.2 目录结构
```
qq-bot/
  src/
    index.ts              # 启动:连 NapCat、注册处理器、起 cron
    config.ts             # 读取 + zod 校验配置,支持热重载
    napcat.ts             # OneBot 封装(收群/私聊消息、发消息、群管理API)
    newapi.ts             # 中转站客户端(verifyBindCode/addQuota/getRanking/getUser)
    db.ts                 # sqlite 建表 + 查询
    permission.ts         # 管理员/群白名单校验
    router.ts             # 指令分发
    handlers/
      bind.ts             # 绑定/解绑
      checkin.ts          # 签到 → 积分
      redeem.ts           # 兑换(手动/自动)
      admin.ts            # 踢人/拉黑/禁言/加扣分/发额度/广播
      query.ts            # 我的积分/我的额度/帮助
    jobs/
      dailyRanking.ts     # cron → 排行 → 群发
    events/
      groupIncrease.ts    # 入群事件 → 黑名单自动踢
    templates.ts          # 消息模板渲染(占位符)
  data/                   # sqlite 数据卷
  config.example.yaml
  Dockerfile
  docker-compose.yml      # napcat + bot 一键起
  package.json / tsconfig.json / README.md
```

### 5.3 数据库(SQLite)
```sql
binding(qq TEXT PRIMARY KEY, user_id INTEGER UNIQUE, username TEXT, created_at INTEGER)
points(qq TEXT PRIMARY KEY, balance INTEGER DEFAULT 0, updated_at INTEGER)
checkin(qq TEXT, day TEXT, PRIMARY KEY(qq, day))          -- day=YYYY-MM-DD(机器人时区)
blacklist(qq TEXT PRIMARY KEY, reason TEXT, by_qq TEXT, created_at INTEGER)
redeem_log(id INTEGER PK AUTOINCREMENT, qq TEXT, user_id INTEGER,
           points_cost INTEGER, quota_added INTEGER, status TEXT,
           request_id TEXT UNIQUE, created_at INTEGER, error TEXT)   -- 幂等 + 审计
```

### 5.4 配置分层

配置分两层:**本地引导配置(极简)** + **中转站后台业务配置(拉取)**。

#### 5.4.1 本地引导配置(机器人服务器,`.env` 或极简 config.yaml)
只放「如何连 QQ」「如何连中转站」这类启动必需项,其余一律不放本地。
```yaml
napcat:
  wsUrl: ws://napcat:3001        # OneBot v11 WebSocket
  accessToken: ""                # NapCat token(可选)
newapi:
  baseUrl: https://你的域名       # 中转站地址(服务器B需可访问)
  adminUserId: 1
  accessToken: "管理员系统访问令牌"  # 机器人专用管理员令牌
refreshInterval: 60              # 每隔多少秒从中转站拉取一次业务配置
```

#### 5.4.2 业务配置(中转站后台维护,机器人 `GET /api/qq_bot/config` 拉取)
下列内容全部在中转站「QQ 机器人设置」页配置,机器人拉取后生效(等价于原先 yml 里的业务字段):
- `groups[]` 生效群、`admins[]` 管理员 QQ、`allowGroupAdmins` 是否放权群管
- `points`:perCheckin / redeemThreshold / redeemQuota(原始 quota,500000=$1)/ autoRedeem
- `ranking`:cron / dimension(quota|tokens|requests)/ windowDays / limit / onlyGroupMembers / toGroups[]
- `blacklist`:autoKickOnJoin
- `commands`:指令关键词(签到/绑定/兑换…)
- `templates`:全部消息文案(占位符:`{nick}{gain}{balance}{username}{uid}{cost}{dollar}{target}{rank}{name}{n}{list}{reason}`)

后台返回的 JSON 示意:
```json
{
  "groups": [123456789, 987654321],
  "admins": [10001],
  "allowGroupAdmins": true,
  "points": { "perCheckin": 5, "redeemThreshold": 20, "redeemQuota": 500000, "autoRedeem": true },
  "ranking": { "cron": "0 21 * * *", "dimension": "quota", "windowDays": 1, "limit": 10, "onlyGroupMembers": false, "toGroups": [123456789] },
  "blacklist": { "autoKickOnJoin": true },
  "commands": { "checkin": "签到", "bind": "绑定", "redeem": "兑换" },
  "templates": {
    "checkinOk": "✅ {nick} 签到成功，+{gain}分，当前 {balance} 分",
    "redeemOk":  "🎉 {nick} 满{cost}分，已兑换 ${dollar} 到账号 {username}！",
    "dailyRanking": "📊 今日消耗排行 Top{n}\n{list}",
    "rankItem": "{rank}. {name} - ${dollar}"
  }
}
```

### 5.5 中转站客户端(核心调用)
```ts
const http = axios.create({
  baseURL: cfg.newapi.baseUrl,
  headers: { Authorization: cfg.newapi.accessToken,
             'New-Api-User': String(cfg.newapi.adminUserId) },
})
getBotConfig   = () => http.get('/api/qq_bot/config')          // 拉取后台业务配置
verifyBindCode = (code: string) => http.post('/api/user/qq_bind/verify', { code })
addQuota  = (id: number, quota: number) =>
              http.post('/api/user/manage', { id, action:'add_quota', mode:'add', value: quota })
getUser   = (id: number) => http.get(`/api/user/${id}`)
getRanking= (p) => http.get('/api/user_ranking', { params: p })
```

> 机器人内部维护一个 `ConfigStore`:启动拉取 → 缓存 → 每 `refreshInterval` 秒刷新 → `重载配置` 指令强制刷新;拉取失败回退上次缓存。cron 排行任务在配置刷新后按新 `ranking.cron` 重新调度。

### 5.6 关键流程
0. **拉取配置(启动 + 定时)**:`getBotConfig()` 读取后台业务配置进 `ConfigStore`;失败回退缓存;`重载配置` 可强制刷新。以下流程均以 `ConfigStore` 的当前值为准。
1. **绑定(私聊)**:`绑定 394215` → `verifyBindCode` → 校验通过写入 binding(QQ/ID 各唯一,重复则提示)→ 回执。验证码一次性 + 5 分钟过期,天然解决「所有权证明」。
2. **签到(群)**:发「签到」→ 当日未签则加分并记录 → 回执;若 `autoRedeem` 且积分≥阈值且已绑定 → 触发兑换。
3. **兑换**:sqlite 事务内 建 `redeem_log(pending, request_id=uuid)` → 扣分 → `addQuota` → 成功标 success 回群 / 失败退分标 failed。`request_id` 唯一保证幂等,机器人重启不重复发额度。
4. **每日排行(cron)**:`getRanking({dimension, start:now-windowDays, end:now, limit})` → 可选只留已绑定群成员并用群昵称替换 → 模板渲染 → 推送到 `toGroups`。
5. **群管理**:管理员发管理指令 → `permission.ts` 校验 → 调对应 OneBot API 或本地 DB。
6. **黑名单自动踢**:`group_increase` 事件 → 命中 blacklist → `set_group_kick`。

### 5.7 docker-compose(服务器 B,napcat + bot)
```yaml
services:
  napcat:
    image: mlikiowa/napcat-docker:latest
    container_name: napcat
    ports:
      - "6099:6099"                       # WebUI,首次扫码登录机器人QQ
    volumes:
      - ./napcat/config:/app/napcat/config
      - ./napcat/QQ:/root/.config/QQ
    environment:
      - NAPCAT_UID=0
      - NAPCAT_GID=0
    restart: always

  bot:
    build: .
    container_name: qq-bot
    depends_on: [napcat]
    environment:
      - TZ=Asia/Shanghai                  # 保证 cron 与每日签到按预期时区
    volumes:
      - ./data:/app/data                  # sqlite 数据(绑定/积分/黑名单/兑换记录)
      - ./config.yaml:/app/config.yaml:ro # 仅极简引导配置(连接+令牌);业务配置在中转站后台
    restart: always
```

### 5.8 机器人 QQ 登录(NapCat 扫码)与 OneBot 通道

机器人 QQ 登录的是 **NapCat 容器**(无界面 QQ 客户端),我们的 bot 程序只通过 OneBot 协议连它。**扫码登录**。

**前提**
- 用一个**单独的 QQ 号**给机器人(别用个人常用号;数据中心 IP 首次登录易触发风控)。
- 把机器人 QQ 拉进目标群,并在群里设为**管理员**(否则无法踢人/禁言)。

**登录步骤(扫码,三选一)**
1. **NapCat WebUI(推荐)**:浏览器打开 `http://机器人服务器IP:6099` → 输入 WebUI token(首次启动在 `docker logs napcat` 打印)→ 在「登录/网络」页显示二维码 → 用**机器人 QQ 的手机客户端**扫码 → 手机确认 → 登录成功。
2. **容器日志**:`docker logs -f napcat`,日志里会打印 ASCII 二维码(或 `qrcode.png` 路径),手机扫它。
3. **二维码文件**:因挂载了 `./napcat/QQ`,`qrcode.png` 会落到宿主机对应目录,取出来扫。

**首次登录之后**
- 会话缓存在挂载卷 `./napcat/QQ`(容器内 `/root/.config/QQ`)。
- 之后**重启自动「快速登录」,无需再扫码**,只要卷还在且会话未失效。
- 会话失效(过期/改密/风控)时,回 WebUI 重新扫一次。

**开 OneBot 通道(登录后必做)**
- 在 **NapCat WebUI → 网络配置** 里开一个 **WebSocket 服务(OneBot v11)**,端口对上引导配置的 `napcat.wsUrl`(方案默认 `ws://napcat:3001`),bot 才能收发消息。

**注意**
- **6099 不要暴露公网**:WebUI 权限大,仅内网/本机访问,或用 SSH 隧道 / 安全组限制来源 IP。
- **风控/设备锁**:首次在服务器登录可能需手机端「允许新设备登录」或安全验证;用养过的活跃号更稳,全新空号在机房 IP 登录易被冻结。
- **NapCat 跟随 QQ 版本**:QQ 更新后偶尔需升级 NapCat 镜像。
- 手机 QQ 与机器人可同时在线,互不影响。

**部署顺序小结**
1. compose 起 napcat → 2. 6099 WebUI 扫码登录机器人 QQ → 3. WebUI 开 OneBot WS 通道 → 4. 起 bot 容器连上 napcat → 5. 群里设机器人为管理员 → 6. 中转站后台配好业务参数 → 机器人拉取生效。

---

## 6. 联动机制(配置如何下发到机器人服务器)

采用 **拉取(pull)模型**:机器人**主动**来中转站拿配置,中转站不需要知道机器人服务器地址、也不主动推送。把两者绑定在一起的,只是「中转站地址 + 管理员令牌」这一对凭据。

### 6.1 一次性联动设置(机器人服务器只做这一次)
在中转站个人中心用「机器人专用管理员账号」生成一个**系统访问令牌**,填入机器人的极简引导配置:
```yaml
newapi:
  baseUrl: https://你的中转站域名     # 机器人去哪儿拿配置/调接口
  adminUserId: 5                     # 令牌所属管理员 user_id
  accessToken: "xxxxxxxx"            # 令牌 = 联动凭据(拉配置/加额度/查排行/校验绑定码 都用它)
refreshInterval: 60
```
这对 `baseUrl + accessToken` 就是「联动」。之后再不用登录机器人服务器。

### 6.2 配置下发时序
```
管理员                中转站(new-api)                 机器人服务器(qq-bot)
  │ 后台改配置→保存      │                                  │
  │────────────────────►│ 存进 DB(Option: QQBotSetting)    │
  │                      │                                  │
  │                      │◄──GET /api/qq_bot/config(带令牌)── 每 refreshInterval 秒
  │                      │──────返回最新配置 JSON──────────►│ 更新内存 ConfigStore
  │                      │                                  │ 立即按新配置生效
  │                      │                                  │ (群/积分/排行cron/文案…)
```
- 数据方向永远是 **机器人 → 中转站**(出站 HTTPS 443)。
- 中转站**不需要**主动连机器人,因此机器人服务器**无需开任何公网入站端口**(NapCat 的 6099 WebUI 仅本机使用)。

### 6.3 生效时间与强制刷新
- 自动:保存后最长等 `refreshInterval`(如 60s)即生效,**无需重启机器人、无需登录机器人服务器**。
- 立即:群里发管理指令 `重载配置`,机器人马上重新拉取。
- 容错:拉取失败(网络抖动)自动**回退上一次缓存**,不影响运行;恢复后下次拉取补齐。
- 排行任务:配置刷新后按新的 `ranking.cron` 重新调度。

### 6.4 为什么用 pull 而不用 push
- 对防火墙/NAT 友好:机器人在内网也能用,无需公网入站端口。
- 中转站无需保存机器人回调地址,零耦合。
- 天然支持多机器人:多个机器人各用自己的令牌拉同一份配置。
- 若确需「保存即时下发」:可另做 中转站 → 机器人 的 webhook 推送,但需机器人暴露入站端口、中转站保存回调地址,复杂度更高;当前 `pull + 重载配置指令` 已近实时,推荐维持 pull。

---

## 7. 安全与注意事项
- **令牌安全**:建议单开一个「机器人专用管理员账号」,令牌只放服务器 B;泄露可单独吊销,不影响主账号。
- **网络**:中转站管理 API 走 HTTPS;如可能,用防火墙/安全组限制仅服务器 B 出口 IP 可访问管理接口。
- **幂等**:兑换必须靠 `redeem_log` 去重。
- **额度单位**:`redeemQuota`、`发额度` 均为原始 quota,`500000 = $1`,别填成美元字面量。
- **镜像隔离**:把 `qq-bot/` 加入 new-api 的 `.dockerignore`,避免混进中转站镜像。
- **越权防护**:所有管理指令二次校验发送者;`@某人` 从消息段解析目标 QQ,忽略非法输入。
- **时区**:cron 与「每日签到」按机器人服务器时区(建议容器内设 `TZ=Asia/Shanghai`)。
- **隐私**:排行默认展示中转站用户名;如敏感,开启 `onlyGroupMembers` 并用群昵称替换。

---

## 8. 里程碑与工作量(预估)
| 阶段 | 内容 | 预估 |
|---|---|---|
| A1 | 中转站绑定码(后端接口 + 个人中心卡片 + i18n) | ~0.5 天 |
| A2 | 中转站「QQ 机器人设置」后台(配置结构 + 读写接口 + 后台页 + i18n) | ~1 天 |
| B1 | 机器人骨架(NapCat 连接、引导配置、ConfigStore 拉取、DB、指令分发) | ~0.5 天 |
| B2 | 绑定 / 签到 / 兑换 / 每日排行 | ~0.5 天 |
| B3 | 群管理(踢/拉黑/禁言/加扣分/发额度/广播)+ 黑名单自动踢 | ~0.5 天 |
| B4 | docker-compose + 文档 + 联调 | ~0.5 天 |

---

## 9. 待确认清单(实现前)
1. 每次签到得分、兑换阈值、每次兑换额度的具体数值(可后台改,给个初始值即可)。
2. 生效群号、管理员 QQ 号(可后台改)。
3. 每日排行推送时间、维度(quota/tokens/requests)、条数。
4. 是否允许群主/群管使用管理指令(`allowGroupAdmins`)。
5. 实现顺序:是否先做 Part A(A1 绑定码 + A2 机器人配置后台),再做 Part B 机器人。
6. 「QQ 机器人设置」后台页放在:系统设置内的一个分区,还是独立菜单项(与「抽奖管理」并列)。
```
