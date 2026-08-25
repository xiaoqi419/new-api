# Single Main Release Flow

## Capability

The repository has one deterministic development and production release flow. GitHub `origin/main` is the sole production source of truth; local worktrees and deployed containers are verifiable consumers of that source, never competing canonical versions.

## Requirements

1. Every new implementation task starts only after fetching `origin/main`, and its branch or worktree is created from that fetched commit.
2. One user-visible requirement uses one active implementation branch/worktree. Multiple agents may investigate independently, but duplicate implementation branches for the same requirement require explicit user authorization.
3. A production release follows this order: local implementation and validation, scoped commit, push, GitHub PR, required CI, merge to `main`, immutable build from the exact merge commit SHA, and application-only deployment.
4. Production must not be built or deployed from `secondary-dev`, another local convenience branch, a stale worktree, an uncommitted working tree, or a feature commit that has not been merged into GitHub `main`.
5. After a PR is merged, its remote feature branch is deleted. The local `codex/production-source` reference is then fast-forwarded or reset only when it has no unique commits so it exactly tracks `origin/main`.
6. Dirty user worktrees and branches are preserved until their ownership and changes are reviewed. Cleanup must never discard uncommitted work merely to reduce branch count.
7. When local, GitHub, and production appear inconsistent, release work pauses until exact Git SHAs, container image tags/digests, and public application versions are compared. The selected baseline and discrepancy are reported explicitly.
8. Upstream New API updates enter the production fork only through a deliberate merge into `origin/main`; upstream repositories and remotes are never direct production build sources.
9. These rules do not weaken Comet workflow, protected project attribution, testing, verification, database safety, or deployment approval requirements.

## Verification

- `AGENTS.md` contains all requirements in a dedicated governance section.
- The protected project information section remains complete and unchanged.
- The change contains no application, dependency, deployment, database, or Redis modifications.
- Markdown whitespace validation and exact text searches pass.
