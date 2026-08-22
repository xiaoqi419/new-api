# 即梦 / Seedance 2.0 接入方案

> 目标：把火山方舟 **Seedance 2.0**（即梦 S2.0）视频生成与**私域素材库**接入中转站（new-api），
> 对外以**官方 Ark 格式**分发，下游统一用 `Authorization: Bearer sk-xxxxxx` 一个 key 通吃。
>
> 状态：**方案文档（暂不写代码）**。确认后按 Part 1 → 2 → 3 落地。

---

## 一、核心分发模型（先看这个）

### 1.1 下游分发（客户侧）—— 一个 key 通吃

- 客户**只需填两样**：
  - `apikey` = 中转站下发的 token `sk-xxxxxx`
  - `base_url` = 中转站域名
- **视频生成 + 素材库共用同一个 `Authorization: Bearer sk-xxxxxx`**（走 `middleware.TokenAuth()`）。
- 客户**永远接触不到**上游的 Ark API Key / AK/SK，也无需自己做签名。

### 1.2 上游凭证（管理员侧，一次性配置）

| 用途 | 上游鉴权 | Host | 凭证来源 |
| --- | --- | --- | --- |
| 视频生成 / 查询 | Bearer API Key | `ark.cn-beijing.volces.com` | 渠道 `Key`（apikey） |
| 私域素材库 | AK/SK HMAC-SHA256 签名 | `open.volcengineapi.com` | 渠道 `Setting` 里的 AK/SK |

> 火山官方文档明确：素材库 API **不能直接用 API Key**，必须用 AK/SK 签名。
> 因此一个 `DoubaoVideo(54)` 渠道里**同时存两套凭证**（Q4 已确认）：
> 对外暴露一个 key；对内视频走 Ark Key、素材库走 AK/SK，转换全部在中转站内部完成。

```
下游客户                          中转站(new-api)                       火山方舟
  │  Authorization: Bearer sk-xxx     │                                    │
  ├──── POST /ark/api/v3/.../tasks ──>│  TokenAuth + Distribute            │
  │     (官方 Ark body)               │  → 取渠道 Ark Key                  │
  │                                   ├── Bearer ark-xxx ─────────────────>│ ark.cn-beijing.volces.com
  │                                   │                                    │
  │  Authorization: Bearer sk-xxx     │                                    │
  ├──── POST /ark/?Action=CreateAsset>│  TokenAuth + Distribute            │
  │     (官方 Action body)            │  → 取渠道 AK/SK → V4 签名          │
  │                                   ├── HMAC-SHA256 签名 ───────────────>│ open.volcengineapi.com
```

---

## 二、产品能力与可用模型

### 2.1 能力

| 能力 | 输入 | 说明 |
| --- | --- | --- |
| 文生视频 | 文本提示词 | 根据文字描述生成视频 |
| 图生视频-首帧 | 首帧图片 + 文本（可选） | 图片作为视频第一帧 |
| 图生视频-首尾帧 | 首帧 + 尾帧图片 + 文本（可选） | 控制视频起止画面 |
| 多模态参考 | 图片(0-9) + 视频(0-3) + 音频(0-3) + 文本 | 全新 / 编辑 / 延长视频 |
| 有声视频 | 任意输入 + `generate_audio: true` | 自动生成人声、音效、背景音乐 |

### 2.2 可用模型与对外模型名

下游请求里的 `model` 字段**直接填 Endpoint ID**（本站接入即以 Endpoint 作为模型名，无需另起别名）：

| 对外模型名 (`model`) | 档位 | 上游模型 | 说明 |
| --- | --- | --- | --- |
| `ep-20260625174823-b8q4q` | Seedance 2.0 标准版 | doubao-seedance-2-0-260128 | 支持 480p / 720p / 1080p |
| `ep-20260625174824-gdr54` | Seedance 2.0 Fast | doubao-seedance-2-0-fast-260128 | 更快，不支持 1080p |
| `ep-20260625174825-m4sht` | Seedance 2.0 Mini | doubao-seedance-2-0-mini | 最低价，不支持 1080p |

> Endpoint 作为 `model` 直接路由到对应推理接入点（`info.UpstreamModelName` 已支持），无需额外映射。计费见 §六（token×倍率，结果 = 按时长 × 分辨率，纯配置无需写代码）。

---

## 三、现状盘点（代码层面）

### 3.1 已具备的能力

| 位置 | 现状 |
| --- | --- |
| `relay/channel/task/doubao/adaptor.go` | **已对接 Ark Seedance**：`POST {base}/api/v3/contents/generations/tasks` + `GET .../tasks/{id}`，Bearer 鉴权；已支持 `content[]`（text/image_url/video_url/audio_url + role）、duration/resolution/ratio/seed/watermark/generate_audio 等参数 |
| `relay/channel/task/doubao/constants.go` | `ModelList` **已含** `doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`；`videoInputRatioMap` 已含 2.0 视频输入折扣 |
| `relay/relay_adaptor.go:157` | `ChannelTypeDoubaoVideo(54)` / `ChannelTypeVolcEngine(45)` → `taskdoubao.TaskAdaptor` |
| `router/video-router.go` | **官方格式分发范例**：`jimeng/`、`kling/v1/` 用 `XxxRequestConvert()` 中间件做"官方请求体→内部任务格式"映射 |
| `middleware/jimeng_adapter.go` | `JimengRequestConvert()` 范例：读官方 body → 映射统一格式 → 改写 path → `RelayTask/RelayTaskFetch` |
| `relay/channel/jimeng/sign.go` | **已实现火山引擎签名 V4（HMAC-SHA256）**，但写死 `region=cn-north-1`、`service=cv` |
| `model/channel.go` | Channel 有 `Key`/`Other`/`OtherInfo`/`Setting(dto.ChannelSettings)` + `GetSetting/SetSetting`，可同渠道存两套凭证 |

### 3.2 缺口（本次要做的）

1. **视频对外是 OpenAI-Video 格式**，缺少**原生 Ark 格式**入口（创建返回 `{"id":"cgt-..."}`、查询返回原生 task 对象）。
2. **私域素材库完全没有**：需新增 AK/SK 签名代理（service=ark / region=cn-beijing / version=2024-01-01 / host=open.volcengineapi.com）。

---

## 四、详细方案

### Part 1 — 视频生成：官方 Ark 格式分发（增量，复用任务框架）

**对外接口**（下游用 `Bearer sk-xxx`）：

```
POST /ark/api/v3/contents/generations/tasks      → 返回 {"id":"<task_id>"}
GET  /ark/api/v3/contents/generations/tasks/:id  → 返回原生 Ark task 对象
```

**改动点：**

1. **`router/video-router.go`**：仿 `jimengOfficialGroup` 新增 `/ark` 路由组：
   ```go
   arkGroup := router.Group("/ark")
   arkGroup.Use(middleware.RouteTag("relay"))
   arkGroup.Use(middleware.ArkVideoRequestConvert(), middleware.TokenAuth(), middleware.Distribute())
   {
       arkGroup.POST("/api/v3/contents/generations/tasks", controller.RelayTask)
       arkGroup.GET("/api/v3/contents/generations/tasks/:task_id", controller.RelayTaskFetch)
   }
   ```

2. **`middleware/ark_adapter.go`（新建）** `ArkVideoRequestConvert()`，仿 `middleware/jimeng_adapter.go`：
   - 读官方 Ark body（`model`/`content[]`/`duration`/`resolution`/`ratio`/`seed`/`watermark`/`generate_audio`/`safety_identifier`/`callback_url`）。
   - 映射成内部 `TaskSubmitReq`：`model` 直传，从 `content[]` 提取文本作为 `prompt`、图片作为 `images`，其余整包塞进 `metadata`。
   - 改写 `c.Request.URL.Path = "/v1/video/generations"`。
   - `c.Set("relay_response_format", "ark")` 标记官方格式；GET 时设 `task_id` + `relay_mode = VideoFetchByID`。

3. **`relay/channel/task/doubao/adaptor.go`**：增加「官方透传响应」模式（读 `c.GetString("relay_response_format") == "ark"`）：
   - **创建** `DoResponse`：官方模式返回 `{"id": info.PublicTaskID}`（保持 Ark 形态、task_id 用中转站 id），内部仍存上游原始 body 供轮询。
   - **查询**：现有 `ConvertToOpenAIVideo` 旁新增并列方法 `ConvertToArkTask(originTask)`，把已存的上游 Ark body **原样返回**（仅把 `id` 替换为中转站 task_id）；`controller/relay.go` 的 `RelayTaskFetch` 按 `relay_response_format` 选择转换器。

4. **计费**：**沿用现成 token×倍率**（`扣费 = TotalTokens × 模型倍率 × 分组倍率`，见 §六）。`TotalTokens` 已含时长 × 分辨率，**无需写计费代码**，仅需管理员在「模型倍率」里给模型配倍率；含视频输入折扣由 `videoInputRatioMap` 自动处理。

5. **endpoint 即模型名**：下游直接以 Endpoint ID 作为 `model`（见 §2.2），`info.UpstreamModelName` 已透传，无需改代码。

### Part 2 — 私域素材库：镜像官方 Action + 中转站签名（仅虚拟人像 AIGC）

**对外接口**（下游用 `Bearer sk-xxx`，镜像官方 universal-OpenAPI 形态）：

```
POST /ark/?Action=CreateAssetGroup&Version=2024-01-01
POST /ark/?Action=CreateAsset&Version=2024-01-01
POST /ark/?Action=GetAsset&Version=2024-01-01
... （见 §5.2 完整 Action 列表）
```

**改动点：**

1. **泛化签名**：把 `relay/channel/jimeng/sign.go` 的 V4 签名抽成可传 `region/service/host` 的函数（或在 `relay/channel/volcengine/` 下新建 `signer.go` 复用同算法）。素材库用：
   - `ServiceName = ark`，`Region = cn-beijing`，`Host = open.volcengineapi.com`，`Version = 2024-01-01`，`Method = POST`。

2. **`controller/ark_asset_proxy.go`（新建）** `ArkAssetProxy(c)`：
   - 校验 `Action` 在**白名单**内（仅 AIGC 素材管理类；真人相关 Action 拒绝）。
   - 由 `Distribute()` 选出的渠道取 `AK/SK`（见 Part 3）。
   - 读 body → 计算 `X-Content-Sha256` → V4 签名 → 转发 `https://open.volcengineapi.com/?Action=..&Version=2024-01-01`，**返回体原样回传**。
   - 缺省注入渠道配置的 `ProjectName`（默认 `default`），保证 Project 隔离。

3. **路由**：素材类 Action 分流到 `ArkAssetProxy`，挂 `TokenAuth() + Distribute()`。

4. **渠道选取**：素材 Action 无 `model` 字段，无法按模型路由。方案：
   - 按 token 所属分组，选中"带 AK/SK 的 `DoubaoVideo` 渠道"；
   - 或用一个固定 sentinel 模型名（如 `doubao-seedance-asset`）路由到该渠道。
   - **保证素材库与视频是同一个 key、同一个渠道**。

5. **计费**：素材管理类接口默认计费 0（可配固定 quota/次），记请求日志。

### Part 3 — 凭证存储与渠道配置（管理员侧）

- **`dto/channel_settings.go`** 的 `ChannelSettings` 新增字段：
  ```go
  VolcAssetAK     string `json:"volc_asset_ak,omitempty"`
  VolcAssetSK     string `json:"volc_asset_sk,omitempty"`
  VolcProjectName string `json:"volc_project_name,omitempty"` // 默认 default
  ```
  素材代理从 `channel.GetSetting()` 读取。

- **后台渠道编辑表单**新增这 3 个字段输入（`web/default` + `web/classic` 对应渠道编辑组件）。仅管理员可见，客户侧零感知。

- 一个 `ChannelTypeDoubaoVideo(54)` 渠道完整配置：
  - `Key` = Ark API Key（`ark-...`）
  - `BaseURL` = `https://ark.cn-beijing.volces.com`
  - `Setting.VolcAssetAK / VolcAssetSK / VolcProjectName`
  - 模型：`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`（按需加 endpoint 重定向）

---

## 五、API 参考（与官方一致）

### 5.1 视频生成

**创建任务** `POST /api/v3/contents/generations/tasks`（中转站：`POST /ark/api/v3/contents/generations/tasks`）

文生视频：
```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [{ "type": "text", "text": "一只猫在阳光下打哈欠，4K画质" }],
  "duration": 5,
  "resolution": "720p",
  "ratio": "16:9",
  "generate_audio": true,
  "watermark": false
}
```

图生视频-首帧 / 首尾帧（`role`: `first_frame` / `last_frame`）：
```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "从白天过渡到黄昏的城市街景" },
    { "type": "image_url", "image_url": { "url": "https://.../start.jpg" }, "role": "first_frame" },
    { "type": "image_url", "image_url": { "url": "https://.../end.jpg" }, "role": "last_frame" }
  ],
  "duration": 5
}
```

多模态参考（`reference_image` / `reference_video` / `reference_audio`，图片0-9 / 视频0-3 / 音频0-3）：
```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "图片1中的人物穿着图片2中的服装，在视频1场景中行走，配合音频1背景音乐" },
    { "type": "image_url", "image_url": { "url": "https://.../person.jpg" }, "role": "reference_image" },
    { "type": "video_url", "video_url": { "url": "https://.../scene.mp4" }, "role": "reference_video" },
    { "type": "audio_url", "audio_url": { "url": "https://.../bgm.mp3" }, "role": "reference_audio" }
  ],
  "generate_audio": true,
  "ratio": "16:9",
  "duration": 11
}
```

使用素材库资产（`asset://<asset-id>`）：
```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "图片1中的虚拟人像微笑着走向镜头" },
    { "type": "image_url", "image_url": { "url": "asset://asset-20260318071009-xxxxx" }, "role": "reference_image" }
  ],
  "duration": 5
}
```

> Prompt 中用「图片1」「视频1」「音频1」指代素材，序号为同类素材在请求体中的出现顺序，**不要用 Asset ID**。

> ✅ **真人图片用法（2026-06-30 实测确认，重要）**：视频接口会拦截**外部原始 URL 里的真人**，报
> `InputImageSensitiveContentDetected.PrivacyInformation`（防盗用陌生人脸）。
> 但只要先把该图入库（`CreateAsset` 进素材库，AIGC 组即可）拿到 `asset-id`，再在视频里用
> `asset://<asset-id>` 引用，就能**正常生成真人视频，且无需任何活体认证**。
> 机制：素材库内的资产被视为"你已授权"，故 `asset://` 放行；外部原始 URL 的陌生真人脸被拦。
> 这就是真人带货/口播的标准路径：**真人图 → 入库 → `asset://` → 生视频**。

创建返回：
```json
{ "id": "cgt-20260519233207-xxxxx" }
```

**查询任务** `GET /api/v3/contents/generations/tasks/<id>`（中转站：`GET /ark/api/v3/contents/generations/tasks/:id`）

成功：
```json
{
  "id": "cgt-...",
  "model": "doubao-seedance-2-0-260128",
  "status": "succeeded",
  "content": { "video_url": "https://...mp4?..." },
  "usage": { "completion_tokens": 50638, "total_tokens": 50638 },
  "created_at": 1777299143,
  "updated_at": 1777299463,
  "seed": 37072,
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "framespersecond": 24,
  "generate_audio": true,
  "draft": false
}
```

失败：
```json
{ "id": "cgt-xxx", "status": "failed", "error": { "code": "OutputVideoSensitiveContentDetected", "message": "..." } }
```

任务状态：`queued`（排队）/ `running`（生成中）/ `succeeded`（成功）/ `failed`（失败）/ `expired`（超时）/ `cancelled`（已取消）。

**请求参数一览：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | ✅ | - | 模型 ID |
| `content` | object[] | ✅ | - | 输入内容（文本/图片/视频/音频） |
| `safety_identifier` | string | - | - | 终端用户标识，用于内容溯源（建议哈希） |
| `duration` | integer | - | 5 | 时长(秒)，2.0 支持 4-15 或 -1(智能) |
| `resolution` | string | - | 720p | 480p / 720p / 1080p |
| `ratio` | string | - | adaptive | 16:9 / 4:3 / 1:1 / 3:4 / 9:16 / 21:9 / adaptive |
| `generate_audio` | boolean | - | true | 是否生成音频（仅 2.0/1.5 pro） |
| `seed` | integer | - | -1 | 随机种子，-1 随机 |
| `watermark` | boolean | - | false | 是否加水印 |
| `callback_url` | string | - | - | 任务状态变化回调地址 |

### 5.2 私域素材库

**鉴权（上游）**：AK/SK HMAC-SHA256；`Host=open.volcengineapi.com`，`ServiceName=ark`，`Region=cn-beijing`，`Version=2024-01-01`，`Method=POST`。

**虚拟人像入库流程（AIGC，无需认证）：**
```
Step 1: CreateAssetGroup            → group-id
Step 2: CreateAsset (group-id + 图片URL) → asset-id
Step 3: GetAsset 轮询               → Status=Active
Step 4: 视频生成中使用 asset://<asset-id>
```

CreateAssetGroup：
```json
// 请求
{ "Name": "我的虚拟角色", "Description": "短视频用虚拟人像", "GroupType": "AIGC", "ProjectName": "default" }
// 返回
{ "Id": "group-20260519xxxxxx-xxxxx" }
```

CreateAsset（仅支持公网 URL，不支持 base64；`AssetType`: Image/Video/Audio）：
```json
// 请求
{ "GroupId": "group-...", "URL": "https://.../avatar.jpg", "AssetType": "Image", "Name": "角色全身照", "ProjectName": "default" }
// 返回
{ "Id": "asset-20260519xxxxxx-xxxxx" }
```

GetAsset：
```json
// 请求
{ "Id": "asset-...", "ProjectName": "default" }
// 返回
{ "Id": "asset-xxx", "Status": "Active", "AssetType": "Image", "GroupId": "group-xxx", "URL": "https://...", "ProjectName": "default" }
```

> `Status`: `Processing`（处理中）→ `Active`（可用）/ `Failed`（失败）。

**素材管理接口（白名单 Action）：**

| Action | 说明 | 限流 |
| --- | --- | --- |
| `CreateAssetGroup` | 创建素材组 | 10 QPS |
| `CreateAsset` | 上传素材（异步） | 按权益包 |
| `GetAsset` | 查询单个素材 | 100 QPS |
| `ListAssets` | 查询素材列表 | 10 QPS |
| `ListAssetGroups` | 查询素材组列表 | 10 QPS |
| `GetAssetGroup` | 查询单个素材组 | 10 QPS |
| `UpdateAssetGroup` | 更新素材组 | 10 QPS |
| `UpdateAsset` | 更新素材 | 10 QPS |
| `DeleteAsset` | 删除素材 | 10 QPS |
| `DeleteAssetGroup` | 删除素材组 | 5 QPS |

> **关于"真人"的两条不同路径（2026-06-30 实测厘清）：**
>
> 1. **真人图片入库生视频 = 已支持、无需活体**：把真人公网图 `CreateAsset` 进 AIGC 组拿到 `asset-id`，
>    视频里用 `asset://<id>`（`role: reference_image`）即可正常出片（见 §5.1 实测说明）。这是带货/真人口播的常用路径。
> 2. **正式"真人数字人"（`GroupType=LivenessFace`）仍本期不做**：那是需要**本人 H5 活体认证**
>    （`CreateVisualValidateSession` / `GetVisualValidateResult`）的合规数字人形象。代理层对这些**活体类 Action 仍直接拒绝**。
>
> 一句话：要让某张真人照片"动起来"，走路径 1（`asset://`）即可，**不需要活体**；活体只用于路径 2 的正式数字人形象。

---

## 六、计费（token × 模型倍率，纯配置，**无需写代码**）

> 决策：**沿用现成的 token×倍率计费**。Seedance 的
> `TotalTokens = (输入视频时长 + 输出视频时长) × 输出宽 × 输出高 × 帧率 ÷ 1024`，
> **已内含时长与分辨率**，所以 token×倍率的结果天然等于「按时长 × 分辨率」计费。

- **计费公式**（现成逻辑，见 `controller/task_video.go:182`）：
  `扣费 = 上游 TotalTokens × 模型倍率 × 分组倍率`；任务轮询**成功**时结算，失败 / 审核拒绝 / 参数错误**不计费**。
- **配置方式（管理员，零代码）**：在「模型倍率」里给下游用的模型名（3 个 `ep-...`）**各设一个倍率**即可。视频越长 / 分辨率越高 → token 越多 → 自动越贵。
  - ⚠️ 每个模型**必须配倍率**，否则可能不计费或走默认值。
- **含输入视频折扣**：系统已自动乘 `videoInputRatioMap`（标准≈0.61、fast≈0.59），无需额外配置。
- **倍率取值**：默认换算下倍率 `1` ≈ $0.002 / 1K token（= $2 / 百万 token）。建议先跑一条真实任务拿到实际 `TotalTokens`，反推倍率 = 目标售价。
- **官方成本参考（元/百万 token）**：标准 480p/720p≈46、1080p≈51；Fast≈37；Mini≈23。

| 档位 | 每秒参考价（元/秒，输入不含视频 / 16:9 / 5s 折算，仅供定倍率核对） |
| --- | --- |
| 标准版 `ep-...b8q4q` | 480p≈0.46 / 720p≈0.99 / 1080p≈2.48 |
| Fast `ep-...gdr54` | 480p≈0.37 / 720p≈0.80（不支持 1080p） |
| Mini `ep-...m4sht` | 480p≈0.23 / 720p≈0.50（不支持 1080p） |

- **精度**：Fast / Mini 仅 480p/720p、单 token 价相同 → 单倍率**完全精确**；标准版 480p/720p 精确，仅 1080p 官方单 token 价略高（51 vs 46，约 11%）单倍率会略少收，可接受或后续按需校正。
- **素材库**：管理类接口默认计费 0，可配固定 quota/次；记请求日志。

---

## 七、分辨率 / 素材约束

**分辨率与宽高像素**（节选；2.0 Fast 不支持 1080p）：

| 分辨率 | 16:9 | 1:1 | 9:16 |
| --- | --- | --- | --- |
| 480p | 864×496 | 640×640 | 496×864 |
| 720p | 1280×720 | 960×960 | 720×1280 |
| 1080p | 1920×1080 | 1440×1440 | 1080×1920 |

**素材要求：**
- 图片：jpeg/png/webp/bmp/tiff/gif/heic，宽高比 (0.4, 2.5)，尺寸 (300, 6000)px，< 30 MB。
- 视频：mp4/mov，480p/720p/1080p，2-15s（最多 3 个、总时长 ≤ 15s），< 50 MB，24-60 fps。
- 音频：wav/mp3，2-15s（最多 3 段、总时长 ≤ 15s），< 15 MB。

**Project 隔离**：CreateAssetGroup / CreateAsset / 视频生成必须使用相同 `ProjectName`，且素材与视频用同一 Project 下的凭证；默认 `default`。

---

## 八、实施步骤与改动文件清单

| 步骤 | 文件 | 操作 |
| --- | --- | --- |
| 1 | `middleware/ark_adapter.go` | **新建** `ArkVideoRequestConvert()`（仿 jimeng_adapter） |
| 2 | `router/video-router.go` | 新增 `/ark` 视频路由组 + 素材 Action 路由 |
| 3 | `relay/channel/task/doubao/adaptor.go` | 增加官方透传响应模式 + `ConvertToArkTask()` |
| 4 | `controller/relay.go` | `RelayTaskFetch` 按 `relay_response_format` 选转换器 |
| 5 | `relay/channel/jimeng/sign.go`（或新建 volcengine signer） | V4 签名泛化（可传 region/service/host） |
| 6 | `controller/ark_asset_proxy.go` | **新建** AK/SK 签名代理 + Action 白名单 |
| 7 | `dto/channel_settings.go` | `ChannelSettings` 加 `VolcAssetAK/SK/ProjectName` |
| 8 | `web/default` + `web/classic` 渠道编辑组件 | 加 AK/SK + ProjectName 表单字段 |

> 顺序建议：Part 1（步骤 1-4，视频）→ Part 2（步骤 5-6，素材库）→ Part 3（步骤 7-8，配置）。

---

## 九、测试与验证

- 后端：`go build ./...`、`go vet ./...`、相关包单测（`relay/...`、`controller/...`）。
- 端到端：
  - 视频：`POST /v1/video/generations` 验证返回 `{"id":"task_..."}`，轮询 `GET /v1/video/generations/{task_id}` 验证 `data.status=SUCCESS` + `data.result_url`。（官方 Ark 原生格式 `/ark/api/v3/...` 暂未实现，见 §十一。）
  - 素材库：`CreateAssetGroup` → `CreateAsset` → `GetAsset` 轮询 Active → 视频里用 `asset://`。
- 计费：核对消费日志 = `TotalTokens × 模型倍率 × 分组倍率`（倍率在「模型倍率」配置），随时长 / 分辨率自动变化，失败 / 拒绝不计费。
- 遵循项目规范：JSON 用 `common.Marshal/Unmarshal*`；跨库兼容（SQLite/MySQL/PG）；可选标量字段用指针 + `omitempty`；**不修改 QuantumNous / new-api 品牌信息**。

### 9.1 实测记录（2026-06-30，渠道 s2.0 / DoubaoVideo / 模型 `ep-20260625174823-b8q4q`，倍率 23）

- **素材库 CRUD**：`CreateAssetGroup` → `CreateAsset`（真人公网图）→ `GetAsset` 轮询 `Processing→Active` → `Delete*`，全部通过；`ProjectName=xhsx-1` 注入生效。
- **真人原始 URL 直接生视频**：被拦，返回 `InputImageSensitiveContentDetected.PrivacyInformation`（input image may contain real person），**未计费**（余额不变）。
- **真人图入库 → `asset://` 生视频**：✅ 成功出片。`asset://<id>` + `role: reference_image` + `prompt 用「图片1」`；480p/5s/16:9（竖图输入也按 `ratio` 输出 16:9）；返回可播放 MP4（GET 206、ISO Media）。
- **计费核对**：预扣 5,750,000 → 结算退款 4,585,326（日志"token重算 tokens=50638×23"）→ 实扣 **1,164,674 = $2.33**，余额对得上；失败/拒绝均不计费。
- **结论**：真人视频**无需活体**，走"入库 → `asset://`"即可；下游一个 `Bearer sk-xxx` 同时通视频与素材库。

---

## 十、安全与合规

- ⚠️ **你已在对话中明文贴出真实 AK/SK 与 Ark API Key，请立即在火山控制台轮换并视为已泄露。**
- 所有凭证仅填入「渠道配置」（存数据库），**绝不写入代码、日志或仓库**。
- 透传 `safety_identifier` 建议对用户 ID 做哈希，避免泄露隐私。
- 内容安全错误码（输入/输出敏感检测）按官方返回原样透传给下游。
- video_url 有效期 24h、Asset URL 有效期 12h，下游需及时转存。

---

## 十一、本期范围与后续

**已完成（实测通过）：**
- ✅ Seedance 2.0 视频生成：`POST /v1/video/generations` + `GET /v1/video/generations/{task_id}` 轮询；文生/图生（首帧/参考图）均通；计费 = token × 模型倍率(23) × 分组倍率，失败/拒绝不计费，预扣+退款透明。
- ✅ 私域素材库（AIGC）：`/ark/?Action=...` 镜像官方 Action + 中转站 V4 签名；本地归属表隔离；控制台「素材库」页（上传公网图→`asset://`，状态轮询/复制/删除）。
- ✅ **真人图片入库生视频**：真人图 → 入库 → `asset://` → 生视频，**实测无需活体认证**（见 §5.1/§5.2）。
- ✅ 控制台「视频生成」页（classic）：文生/图生切换，图生用 URL 或 `asset://`，参数齐全（分辨率/比例/时长/有声/水印），提交后轮询出片 + 下载 + 本次消耗。
- ✅ 下游一个 key 通吃（视频 + 素材库同一 `Bearer sk-xxx`）；同渠道存两套凭证。

**暂不做 / 可选增强（后续可扩展）：**
- 官方 Ark 原生视频格式 `POST /ark/api/v3/contents/generations/tasks`（让下游直接套火山官方 SDK）。目前下游用内部格式 `/v1/video/generations`，已够用；如需再加。
- 真人**数字人**入库（`GroupType=LivenessFace`，本人 H5 活体认证）——仅正式合规数字人形象才需要，普通真人图走 `asset://` 即可。
- 素材库回调通知 / 视频 callback_url 转发到下游。
