# Outcome
仅保留 main 作为长期本地分支，明确已有的 worktree 开发、PR 合入 main 工作方式，停止依赖历史 secondary-dev。

# Scope
更新 AGENTS.md 的分支规范并补充完整工作流规格。交付后整理本机旧工作区；清理前保留独有提交、源码和未确定草稿的可恢复备份。

# Non-goals
不修改应用功能、不修复本次发现的 GitHub 按钮、不部署容器、不操作数据库或其他独立仓库。

# Acceptance examples
- A1: 规范明确 main 是唯一长期本地分支，功能以最新 origin/main 为基准在临时分支/worktree 中开发。
- A2: 规范保留验证、PR、CI、合并后精确 SHA 构建及应用部署顺序，不允许脏目录部署；保留未提交内容须先审查与备份。
- A3: 变更仅包含治理文档和 Comet 正式产物，项目身份与许可证信息不变。

# Constraints and invariants
origin/main 是生产唯一基准。清理不能删除 data、logs、new-api2 或教程等本地资料。保留独有 GitHub 按钮草稿、11 个未确定前端差异、翻译及历史文档；不把旧文件整体覆盖主线。

# Decisions
用户已确认当前流程为 worktree 开发后合并 main，并在解释移除废弃 secondary-dev、整理根目录与同步规范后授权“对 那你继续吧”。因此不重复请求相同范围确认。功能草稿只归档，另行实施。

# Open questions
无。

# Verification expectations
独立只读 Verifier 对 A1-A3 验收，git diff --check。治理变更走 PR/CI 后合并。随后本机整理复核：根目录 main 与 origin/main 一致、无 tracked/untracked 残留、无临时分支/worktree/active change；独立数据原地保留，恢复包完整。无需应用测试或部署。
