# Outcome

Establish one deterministic development and production release path so local work, GitHub, and deployed applications cannot each become a competing source of truth.

# Scope

- Add repository governance that makes `origin/main` the only production source baseline.
- Require one short-lived change branch/worktree for one user request unless the user explicitly authorizes parallel implementation units.
- Require every production build to use the exact commit merged into GitHub `main`.
- Require post-merge branch cleanup and synchronization of the local production-source reference.
- Define mandatory commit/image comparison when local, GitHub, and production versions appear inconsistent.

# Non-goals

- Deleting existing dirty branches or worktrees without a separate safety review.
- Changing application code, deployment infrastructure, databases, Redis, or runtime configuration.
- Automatically merging upstream New API updates into the production fork.
- Weakening protected project attribution or existing Comet workflow requirements.

# Acceptance examples

- A1: `AGENTS.md` explicitly identifies `origin/main` as the sole production source of truth and forbids deploying from `secondary-dev`, stale local branches, dirty worktrees, or unmerged commits.
- A2: `AGENTS.md` requires a new task to begin from a freshly fetched `origin/main` and limits one user request to one active implementation branch/worktree unless explicitly approved otherwise.
- A3: The documented release path is local validation, scoped commit, GitHub PR, CI, merge to `main`, build from the exact merge SHA, then application-only deployment.
- A4: The documented finish path deletes the merged remote feature branch and synchronizes `codex/production-source` to `origin/main` without deleting dirty user worktrees.
- A5: When local, GitHub, and production disagree, the documented procedure compares exact Git commit SHAs, image tags/digests, and public application versions before any new deployment.
- A6: Existing protected project information and Comet requirements remain intact; no application or deployment file changes are included.
- A7: The resulting Markdown passes `git diff --check`, and exact `rg` checks find all required branch and release invariants.

# Constraints and invariants

- Preserve all user-owned uncommitted changes.
- Never treat a deployed container or an arbitrary local worktree as the canonical source repository.
- Production database and Redis state are outside this governance-only change.
- Protected project identifiers and attribution rules remain unchanged.

# Decisions

- The production fork is `xiaoqi419/new-api`, and its `origin/main` is the only production code baseline.
- `codex/production-source` is a local convenience reference that must track `origin/main`; it is never an independent source branch.
- Feature branches are temporary delivery vehicles and are removed remotely after merge.
- Parallel investigation is allowed, but duplicate implementation branches for the same user-visible requirement require explicit user authorization.

# Open questions

- None. The user confirmed both governance submission and cleanup of the existing active changes.

# Verification expectations

- Review the complete `AGENTS.md` diff and confirm protected governance remains present.
- Run exact `rg` checks for `origin/main`, exact merge SHA deployment, single-request branch ownership, remote branch deletion, and version comparison.
- Run `git diff --check`.
- Use an independent read-only Verifier before Archive.
