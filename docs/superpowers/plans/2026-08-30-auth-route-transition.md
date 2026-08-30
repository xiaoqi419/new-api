# Auth Route Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a restrained right-panel entrance transition for auth route changes and increase the sign-in welcome heading scale without changing auth behavior or resetting background media.

**Architecture:** Keep route ownership and the existing `AuthExperienceLayout` shell unchanged. Wrap only `props.children` in a keyed semantic content region so each auth route mount gets one CSS fade-and-rise animation; the left brand/video panel remains outside the animated subtree. Increase the existing sign-in title utility at the page composition layer, and add a scoped reduced-motion override alongside the existing auth styles.

**Tech Stack:** React 19, TanStack Router, Tailwind CSS v4 utilities, plain CSS keyframes, Vitest/Happy DOM, TypeScript, Rsbuild.

---

### Task 1: Add the right-panel route entrance transition

**Files:**
- Modify: `web/src/features/auth/components/auth-experience-layout.tsx` right-panel content slot
- Modify: `web/src/styles/index.css` near the existing auth submit styles
- Test: `web/src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx`

- [ ] **Step 1: Add regression assertions for the animated content boundary**

In the `AuthExperienceLayout` fixture, query `[data-auth-region="form"] [data-auth-transition="content"]` and assert it exists, contains the rendered child, and has the `auth-route-content` class. Keep the existing assertions for form region and background media.

- [ ] **Step 2: Run the focused test and observe the missing marker**

Run from `web/`:

```powershell
& 'E:/code/new-api/web/node_modules/.bin/vitest.cmd' run src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx --pool=forks --maxWorkers=1
```

Expected: the new assertion fails because the content wrapper has not been added.

- [ ] **Step 3: Implement the keyed content wrapper**

Replace the direct child slot in `AuthExperienceLayout`:

```tsx
<div className='w-full max-w-[420px] min-w-0'>{props.children}</div>
```

with:

```tsx
<div
  key={props.page}
  data-auth-transition='content'
  className='auth-route-content w-full max-w-[420px] min-w-0'
>
  {props.children}
</div>
```

The key must be `props.page` so navigation between auth routes remounts only this content boundary. Do not move the video, brand section, or outer panel into this wrapper.

- [ ] **Step 4: Add the scoped CSS transition and reduced-motion fallback**

Add to `web/src/styles/index.css`:

```css
.auth-route-content {
  animation: auth-route-content-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
  will-change: transform, opacity;
}

@keyframes auth-route-content-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-route-content {
    animation: none;
    transform: none;
  }
}
```

Use only transform and opacity. Keep the existing auth button and left-panel animation rules intact.

- [ ] **Step 5: Run the focused test and formatting check**

Run:

```powershell
& 'E:/code/new-api/web/node_modules/.bin/vitest.cmd' run src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx --pool=forks --maxWorkers=1
& 'E:/code/new-api/web/node_modules/.bin/oxfmt.cmd' --check src/features/auth/components/auth-experience-layout.tsx src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx src/styles/index.css
```

Expected: the new marker assertion passes and formatting exits with code 0. If the known Happy DOM `Array buffer allocation failed` resource error recurs, record it as a test-environment residual and continue with the stable password-recovery test in Task 3.

### Task 2: Increase the sign-in welcome heading hierarchy

**Files:**
- Modify: `web/src/features/auth/sign-in/index.tsx`
- Modify: `web/src/features/auth/components/auth-card.tsx`
- Test: `web/src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx`

- [ ] **Step 1: Add a heading-class regression assertion**

In the existing Simplified Chinese welcome-copy test, assert that the rendered welcome `h1` contains the `text-2xl` class marker and remains `min-w-0`/ `break-words`. Keep the exact translated text assertions.

- [ ] **Step 2: Update the sign-in title composition**

Pass a class-bearing title node to `AuthCard`:

```tsx
title={
  <span className='inline-block text-2xl leading-tight font-semibold sm:text-[25px]'>
    {t('Welcome back! 👋')}
  </span>
}
```

`AuthCard` already wraps the title in an `h1`, so this changes visual scale without adding a nested heading. Preserve the existing i18n key.

- [ ] **Step 3: Add title breathing room in the shared title block**

Update the `AuthCard` title/description wrapper from `mb-[22px] space-y-1.5` to `mb-[26px] space-y-2`. Keep `min-w-0`, `break-words`, and the existing description typography so long translations remain safe.

- [ ] **Step 4: Run focused tests and formatting**

```powershell
& 'E:/code/new-api/web/node_modules/.bin/vitest.cmd' run src/features/auth/__tests__/password-recovery-layout.test.tsx --pool=forks --maxWorkers=1
& 'E:/code/new-api/web/node_modules/.bin/oxfmt.cmd' --check src/features/auth/sign-in/index.tsx src/features/auth/components/auth-card.tsx src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx
```

Expected: password-recovery layout tests pass 2/2 and formatting exits with code 0.

### Task 3: Update changelog and validate all auth routes

**Files:**
- Modify: `web/src/features/changelog/data.ts` at the newest entry
- Test: `web/src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx`
- Test: `web/src/features/auth/__tests__/password-recovery-layout.test.tsx`

- [ ] **Step 1: Add a concise user-facing changelog item**

Add this item to the newest `20260830-auth-submit-capsule` improvement entry:

```text
认证页面切换登录、注册、找回密码或重置密码时，右侧表单会以轻微淡入上移动效进入；登录欢迎语同步放大并增加呼吸空间，减少动态效果模式下保持静态显示。
```

- [ ] **Step 2: Run static checks**

```powershell
& 'E:/code/new-api/web/node_modules/.bin/tsgo.cmd' -b
& 'E:/code/new-api/web/node_modules/.bin/oxlint.cmd' -c .oxlintrc.json src/features/auth/components/auth-experience-layout.tsx src/features/auth/components/auth-card.tsx src/features/auth/sign-in/index.tsx src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx src/features/auth/__tests__/password-recovery-layout.test.tsx
& 'E:/code/new-api/web/node_modules/.bin/oxfmt.cmd' --check src/features/auth/components/auth-experience-layout.tsx src/features/auth/components/auth-card.tsx src/features/auth/sign-in/index.tsx src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx src/features/auth/__tests__/password-recovery-layout.test.tsx src/styles/index.css src/features/changelog/data.ts
```

Expected: all three commands exit successfully.

- [ ] **Step 3: Run route tests with a bounded worker**

```powershell
& 'E:/code/new-api/web/node_modules/.bin/vitest.cmd' run src/features/auth/__tests__/password-recovery-layout.test.tsx --pool=forks --maxWorkers=1
& 'E:/code/new-api/web/node_modules/.bin/vitest.cmd' run src/features/auth/sign-in/__tests__/sign-in-layout.test.tsx --pool=forks --maxWorkers=1
```

Expected: password-recovery tests pass. The sign-in suite should have no assertion failures; if the known Happy DOM buffer-allocation error recurs, record the exact residual failure and note that the other assertions passed.

- [ ] **Step 4: Build the production frontend**

```powershell
& 'E:/code/new-api/web/node_modules/.bin/rsbuild.cmd' build
```

Expected: `ready built` and exit code 0.

- [ ] **Step 5: Browser-verify the transition and reduced-motion fallback**

Keep `http://127.0.0.1:3001/sign-in` open. Navigate through the visible registration tab and forgot-password link. Verify the right content enters with a short fade/slide while the left video stays in place. At a 320px viewport, verify no horizontal overflow. With reduced motion enabled, verify content appears without movement.

- [ ] **Step 6: Run whitespace validation**

```powershell
git diff --check
```

Expected: no whitespace errors. Preserve unrelated user changes in the dirty worktree; do not reset or clean generated files outside the changed frontend paths.
