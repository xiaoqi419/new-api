# 发布与双站热更新流程

本文档是本仓库二开版本的唯一发布操作说明。目标是让后续开发遵循同一套路径：以 GitHub `origin/main` 为唯一发布源，完成验收后推送 `main`，构建带提交号的镜像，再只更新应用容器。除非任务明确要求迁移或变更数据，否则不得操作生产数据库、Redis 数据卷或网关配置。

最后核对时间：2026-09-01

## 1. 代码与分支规则

- `origin`：`https://github.com/xiaoqi419/new-api.git`，这是二开仓库，不是上游 `upstream`。
- `main`：唯一可发布分支，必须始终指向最新、已验收的完整版本。
- `secondary-dev` 和临时 `codex/*`、`comet/*` 分支只能用于开发或 Comet worktree，不能直接部署。
- 同一时间只能有一个 active Native Comet change。开始新需求前，先让当前 change 进入 Archive，或在保留可恢复外部备份后明确废弃；不得让失效的 `comet-state.yaml`、运行时 overlay 或绑定不一致的 worktree 留在 `docs/comet/changes/` / `.comet/runtime/` 中。
- 本地长期只保留 `main` 发布 worktree 与 `secondary-dev` 开发 worktree。一次需求最多一个实现分支/worktree；完成合并后删除临时 worktree 和本地分支，远端只保留 `origin/main`（已合并的远端功能分支应在确认无独有提交后删除）。
- 所有开发开始前，先从远端同步并确认工作区状态：

  ```bash
  git fetch origin --prune
  git status --short --branch
  git log --oneline --decorate -5 origin/main
  ```

- 工作区有与当前任务无关的未提交改动时，不要覆盖、清理或混入这些改动。使用独立 Comet worktree 开发。
- 开发分支完成后，必须经过项目规定的 Build/Verify 和用户验收，再把已验收提交快进或合并到 `main`：

  ```bash
  git -C <main-worktree> merge --ff-only <approved-branch>
  git -C <main-worktree> push origin main
  git -C <main-worktree> rev-parse --short HEAD
  git ls-remote origin refs/heads/main
  ```

- 本地 `main`、远端 `origin/main` 和部署镜像的短提交号必须一致。发现不一致时停止部署，先查清来源。
- 上游 `upstream/main` 只用于后续兼容性同步，不能直接覆盖二开 `origin/main`，也不能把上游仓库当成发布仓库。

若检测到多于一个 active change、工作区与 change 绑定不一致，或本地/远端/线上提交号不一致，发布流程立即停止；先做只读核对和可恢复备份，再清理或重新绑定，不能通过创建更多分支绕过检查。

## 2. 当前服务器拓扑

服务器：`152.53.195.35`。服务器凭据不写入仓库、脚本、日志或聊天记录，使用受控的 SSH 凭据登录。

### 国内站

| 项目 | 当前值 |
|---|---|
| 域名 | `aierxin.cc` |
| Caddy 路由 | `new-api-caddy -> torch-ai-test-gateway:8080` |
| Compose 目录 | `/opt/torch-ai-test` |
| Compose 项目 | `torch-ai-test` |
| 应用服务/容器 | `app` / `torch-ai-test-app` |
| 网关容器 | `torch-ai-test-gateway` |
| 应用镜像命名 | `torch-ai-release:<tag>` |
| 应用数据 | `/opt/new-api-2/data` 挂载到 `/data` |
| 应用日志 | `/opt/new-api-2/logs` 挂载到 `/app/logs` |

容器名中含有 `test` 是历史命名；当前域名映射以 Caddy 配置为准，不要根据容器名猜测环境。

### 国际站

| 项目 | 当前值 |
|---|---|
| 域名 | `codezip.io` |
| Caddy 路由 | `new-api-caddy -> new-api-international-gateway:8080` |
| Compose 目录 | `/opt/new-api-international` |
| Compose 项目 | `new-api-international` |
| 应用服务/容器 | `app` / `new-api-international` |
| 网关容器 | `new-api-international-gateway` |
| 应用镜像命名 | `torch-ai-release:<tag>` |
| PostgreSQL | `new-api-international-postgres`，独立数据卷 |
| Redis | `new-api-international-redis`，独立数据卷 |

国际站网关还负责 `/assets/branding/` 静态资源和默认英文语言注入。应用热更新不能删除或重建网关容器；若任务涉及网关，必须单独备份并验证 nginx/Caddy 配置。

## 3. 标准发布流程

### 3.1 发布前检查

1. 确认 Comet 当前 change 已完成 Verify，用户已确认验收。
2. 确认准备发布的提交属于二开仓库 `origin`，不是 `upstream`。
3. 在干净的 `main` worktree 中确认：

   ```bash
   git status --short --branch
   git fetch origin --prune
   git rev-parse main origin/main
   ```

4. 运行与本次改动匹配的后端、前端和构建检查。没有运行的检查必须在交付记录中明确说明。

### 3.2 合并并推送

只合并已验收的开发分支。若开发分支包含 `main` 的全部历史，优先使用快进合并；出现非快进或冲突时停止，不使用强制推送：

```bash
git -C <main-worktree> merge --ff-only <approved-branch>
git -C <main-worktree> push origin main
git -C <main-worktree> log -1 --oneline --decorate main
git ls-remote origin refs/heads/main
```

远端返回的 SHA 必须与本地 `main` 一致后，才能开始构建镜像。

### 3.3 构建镜像

镜像标签统一使用 `YYYYMMDD-<main短SHA>`，例如 `20260831-ede841401`。镜像必须从刚刚确认的 `main` 源码构建；不能从旧 worktree、未提交目录或服务器历史 `source` 目录直接构建。

本地有 Docker 时可使用仓库脚本：

```bash
IMAGE=registry.cn-shanghai.aliyuncs.com/gongyong1/torchai \
  ./build-push.sh 20260831-ede841401
```

当前服务器的两套 Compose 使用未带仓库前缀的本地标签 `torch-ai-release:<tag>`。若服务器不能直接拉取已推送的 registry 镜像，应从 GitHub `main` 在服务器的临时 release 目录构建并标记为同一标签，或先将镜像安全传输到服务器后 `docker load`。两种方式都必须记录构建提交号和镜像 ID。

服务器端从 GitHub 构建时，推荐使用独立目录，不修改正在运行的源码目录：

```bash
TAG=20260831-ede841401
mkdir -p "/opt/torch-ai-test/releases/$TAG"
git clone --depth 1 --branch main https://github.com/xiaoqi419/new-api.git \
  "/opt/torch-ai-test/releases/$TAG/source"
printf '%s' "$TAG" > "/opt/torch-ai-test/releases/$TAG/source/VERSION"
docker build -t "torch-ai-release:$TAG" "/opt/torch-ai-test/releases/$TAG/source"
docker image inspect "torch-ai-release:$TAG" --format '{{.Id}}'
```

不要把数据库连接串、支付密钥、OAuth 密钥或 `.env` 内容写入镜像、提交或日志。

## 4. 只更新应用容器

### 4.0 统一 H5 的跨站会话配置

统一 Admin H5 由同一份静态页面分别挂在 `aierxin.cc` 和 `codezip.io`。当用户在一个页面选择另一个站点时，浏览器会跨 origin 调用对应 API。两套应用容器启用安全会话时，都必须把两个 H5 origin 写入 `SESSION_COOKIE_TRUSTED_URL`：

```text
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_TRUSTED_URL=https://aierxin.cc,https://codezip.io
```

应用会为安全模式的 refresh Cookie 设置 `SameSite=None; Secure`，并由 `SessionCookieOriginGuard` 继续限制 refresh/logout 的来源。只更新镜像不会自动改写服务器 Compose 或 `.env` 中的环境变量；若现有配置只列出单一域名，先在两套 Compose 中补齐上述列表，再按本节的 `config -q` 和仅应用服务重建步骤发布。

热更新前必须先保存两个 Compose 文件，确认数据卷路径不变，并确认目标镜像存在：

```bash
TAG=20260831-ede841401
cp /opt/torch-ai-test/compose.yml "/opt/torch-ai-test/backups/compose.before-$TAG.yml"
cp /opt/new-api-international/docker-compose.yml \
  "/opt/new-api-international/docker-compose.yml.pre-hotupdate-$TAG"
docker image inspect "torch-ai-release:$TAG" >/dev/null
```

只修改两个 Compose 文件中的 `services.app.image` 标签，然后分别执行配置校验和应用服务重建。不要执行没有服务名的 `docker compose up -d`，因为那可能触碰网关或数据库服务：

```bash
sed -i -E "s#^([[:space:]]*image: )torch-ai-release:.*#\1torch-ai-release:$TAG#" \
  /opt/torch-ai-test/compose.yml
sed -i -E "s#^([[:space:]]*image: )torch-ai-release:.*#\1torch-ai-release:$TAG#" \
  /opt/new-api-international/docker-compose.yml

docker compose --project-directory /opt/torch-ai-test \
  -f /opt/torch-ai-test/compose.yml config -q
docker compose --project-directory /opt/new-api-international \
  -f /opt/new-api-international/docker-compose.yml config -q

docker compose --project-directory /opt/torch-ai-test \
  -f /opt/torch-ai-test/compose.yml up -d --no-deps --force-recreate app
docker compose --project-directory /opt/new-api-international \
  -f /opt/new-api-international/docker-compose.yml up -d --no-deps --force-recreate app
```

`--no-deps` 和服务名 `app` 是关键约束：它们只重建应用，不重启 PostgreSQL、Redis 或网关。禁止使用 `down`、`down -v`、`volume rm`、`prune`、`rm` 或任何会删除数据的命令。

## 5. 发布后验证

先验证容器和应用内部健康状态，再验证域名和静态资源。国内站和国际站都必须检查：

```bash
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' \
  | grep -E 'torch-ai-test-app|new-api-international'
docker inspect -f '{{.State.Health.Status}}' torch-ai-test-app
docker inspect -f '{{.State.Health.Status}}' new-api-international
docker exec torch-ai-test-app wget -q -O - http://localhost:3000/api/status
docker exec new-api-international wget -q -O - http://localhost:3000/api/status
curl -fsS https://aierxin.cc/api/status
curl -fsS https://codezip.io/api/status
```

同时确认：

- 两个应用容器的镜像标签都是目标 `TAG`；
- 两个 PostgreSQL 和 Redis 容器仍在运行，容器 ID/数据卷没有变化；
- 网关容器没有被重建，`server_name`、`proxy_pass` 和国际站 `/assets/branding/` 路由仍在；
- 登录页、支付入口和本次变更涉及的核心路径可以正常加载；
- 浏览器缓存或 CDN 造成的旧前端资源应通过版本化资源和强制刷新排除，不要通过删除数据库解决。

## 6. 失败回滚

如果应用健康检查失败，先保留失败容器日志和镜像信息，不要删除数据。把两个 Compose 文件的 `image` 恢复到对应的备份标签，然后只重建 `app`：

```bash
docker compose --project-directory /opt/torch-ai-test \
  -f /opt/torch-ai-test/compose.yml up -d --no-deps --force-recreate app
docker compose --project-directory /opt/new-api-international \
  -f /opt/new-api-international/docker-compose.yml up -d --no-deps --force-recreate app
```

回滚后重新执行第 5 节全部检查。只有确认应用和网关恢复后，才考虑下一轮修复。

## 7. 交付记录模板

每次发布在任务回复或变更记录中至少写明：

- GitHub `main` 提交 SHA；
- 镜像标签和镜像 ID；
- 实际更新的服务（国内、国际或两者）；
- 数据库/Redis 是否保持不变；
- 执行过的构建、健康检查和域名检查；
- 未执行的检查及原因；
- 若发生回滚，记录回滚标签和原因。

该文档只描述发布流程，不保存任何生产凭据。服务器域名到容器的映射若发生变化，必须先更新本节并现场用 Caddy/nginx 配置和 Docker Compose 标签核对，不能依赖历史记忆。

