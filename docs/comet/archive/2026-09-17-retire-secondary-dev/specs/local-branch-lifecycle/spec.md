# Local branch lifecycle

main is the sole long-lived local branch and origin/main is the sole production source of truth. Start each implementation from the current fetched origin/main in one temporary feature branch and worktree. Keep the main checkout clean. Validate locally, create a scoped commit and PR, pass required CI, merge to main, and only then build an immutable image from the merge SHA for application-only deployment when a deployment is required. Documentation-only changes do not require deployment.

Remove temporary worktrees and feature branches after verified merge. secondary-dev is retired; it is not a development baseline. Before retiring a legacy checkout, review and preserve unique commits, uncommitted source, and unresolved drafts in a verified external recovery archive. Do not discard unreviewed work or recursively clean independent repositories, runtime databases, logs or user assets.

Only one Native change and one implementation worktree own a requirement at a time. Existing production safeguards, project identity, attribution and licenses remain unchanged.
