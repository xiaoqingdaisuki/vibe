# Vibe Agent Guide

> Read this file completely before doing any work in this repository. It is the engineering guide for helping Codex understand, extend, and review Vibe.

## 0. Windows UTF-8 And Chinese Text Safety

This project contains Chinese UI text. On Windows, PowerShell terminal output may display UTF-8 Chinese as mojibake. Do not judge file text correctness from PowerShell-rendered output alone.

Hard rules:

- Never use `Get-Content` output as the source of truth for Chinese text.
- Never rewrite Chinese text based only on mojibake seen in terminal output.
- When inspecting Chinese text, verify the actual file content with a UTF-8-aware tool, preferably Node reading with `fs.readFileSync(path, "utf8")`.
- Do not use PowerShell `Set-Content` for source edits containing Chinese unless UTF-8 encoding is explicit and the file is verified afterward.
- Prefer `apply_patch` for edits. For larger generated rewrites, write with a UTF-8-safe script and immediately verify afterward.
- After touching files containing Chinese text, run a mojibake scan for common corrupted sequences such as `鎴`, `鐢`, `鑳`, `瑁`, `鈿`, `馃`, `锛`, `€`, and `�`.
- If any scan matches user-facing text, stop and fix it before continuing.
- Never translate Chinese UI into English as a workaround for encoding issues.

## 1. Project Mental Model

Vibe is a personal Web Lab for small apps, experiments, tools, public API demos, and technical writing. It is not a heavy platform and not a playground for adding large abstractions. Keep the project light, explicit, and easy to extend.

Core stack:

- Next.js 16 App Router
- React 19
- TypeScript strict mode
- Tailwind CSS v4
- CSS Modules
- pnpm
- Vercel

Engineering direction:

- Organize by feature, not by generic technical layer.
- Prefer Server Components by default.
- Use Client Components only for real browser interactivity.
- Prefer browser-native capabilities and minimal dependencies.
- Let each Lab app have its own personality while keeping site-wide accessibility, responsive behavior, and code boundaries consistent.

## 2. Commands And Package Management

pnpm is the project package manager and command entrypoint. Use `pnpm ...` in docs, comments, final answers, and task instructions.

Common commands:

```bash
pnpm run dev
pnpm run test
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run format
```

Rules:

- Do not add `npm run ...` examples to `README.md`, `AGENTS.md`, or user-facing instructions.
- Do not use `pnpm` or `yarn`.
- Before adding a dependency, check whether React, TypeScript, CSS, or a Web API can solve the problem cleanly.
- If dependencies change, keep the pnpm lockfile in sync.
- If the current environment cannot run pnpm, say so and report any substitute verification you performed.

## 3. Project Structure

Current responsibilities:

```text
src/
  app/                    # App Router routes, metadata, layouts, route glue
  components/
    base/                 # Primitive UI components
    layout/               # Site chrome
    shared/               # Shared presentational states and headers
  content/                # Static content such as blog markdown/mdx
  features/
    apps/                 # Individual Lab apps
    blog/                 # Blog loading, rendering, cards
    lab/                  # Lab registry, types, cards
  lib/                    # Pure utilities, site config, public API helpers
  types/                  # Global TypeScript types
server/                   # Removed (was auxiliary server)
public/                   # Static assets
```

Placement rules:

- Route files belong in `src/app/**`.
- Business logic and interaction logic belong in `src/features/**`.
- Reusable UI belongs in `src/components/**`.
- Pure non-UI utilities belong in `src/lib/**`.
- Private components, styles, types, and data for a single Lab app stay inside that app folder.

## 4. Scaffolding Workflows

### 4.1 Add A Lab App

To add `/lab/{slug}`, complete all of these steps:

1. Create `src/features/apps/{slug}/page-client.tsx`.
2. Register metadata in `src/features/lab/registry.ts`.
3. Register the explicit loader in `src/features/apps/loaders.ts`.

Recommended structure:

```text
src/features/apps/{slug}/
  page-client.tsx
  types.ts
  data.ts
  components/
  styles/
    AppName.module.css
```

Client app template:

```tsx
'use client';

export function AppName() {
  return <div>App UI</div>;
}

export default AppName;
```

Never use a template-string dynamic import inside `src/app/lab/[slug]/page.tsx`:

```ts
import(`@/features/apps/${slug}/page-client`);
```

Turbopack needs an explicit import map for stable builds and static analysis.

### 4.2 Add A Blog Post

Blog files live in `src/content/blog/` and may use `.md` or `.mdx`.

Required frontmatter:

```yaml
title: 'Post title'
description: 'Post description'
date: '2026-07-06'
tags: ['tag']
category: 'Category'
published: true
```

Blog rendering rules:

- Parse metadata with `gray-matter`.
- Render body content through `next-mdx-remote/rsc`.
- Do not inject markdown with `dangerouslySetInnerHTML`.
- Do not hand-roll a markdown parser.

### 4.3 Update The Vibe Commit Log

After every successful Git commit, update `src/content/blog/vibe-log.mdx` before delivering work:

- Append the commit under its `YYYY年MM月DD日` heading with its original commit subject.
- Add a new date heading when the commit date is not yet present.
- Update the post's `updated` frontmatter date to the commit date.
- Keep `pinned: true` so the commit log remains permanently pinned in the blog list.

### 4.4 Maintain Homepage Recent Updates

When adding or changing a Lab app or Blog post, update its `recentOrder` whenever it should appear in the homepage Recent updates module. Set the value in the Lab entry in `src/features/lab/registry.ts` for Lab apps, or in the post frontmatter for Blog posts. The homepage displays the three lowest finite `recentOrder` values across both types, so each value must be distinct globally and the ordering must remain intentional and current.

## 5. Next.js Standards

Use Server Components by default. Add `'use client'` only when a component needs browser state, event handlers, DOM APIs, `localStorage`, canvas, or another client-only capability.

Route layer responsibilities:

- `src/app/layout.tsx` owns the global shell, metadata, and viewport.
- `src/app/**/page.tsx` loads server-side data, selects feature components, and handles `notFound()`.
- Do not place complex UI or business logic directly in route files.
- Keep route-specific metadata near the route, but site-level metadata comes from `src/lib/site.ts`.

Dynamic routes:

- Provide `generateStaticParams()` when the source is static.
- Call `notFound()` when a resource does not exist.
- Do not hide real build errors behind fallback UI.
- Show "Coming Soon" only for intentionally registered but not-yet-implemented Lab apps.

Server/client boundaries:

- Code using `fs` or `path` must only run on the server.
- Do not pass server-only helpers into Client Components.
- Do not turn an entire page into a Client Component just to make one interaction work.

### 5.1 React And Next.js Performance

Apply these rules when changing React components, routes, data fetching, or client bundles. Profile first for micro-optimizations; prioritize correctness, response waterfalls, and shipped JavaScript over speculative memoization.

Async and server work:

- Check cheap synchronous guards before starting I/O, and defer an `await` until the branch that needs its result.
- Start independent I/O together with `Promise.all()`. For partially dependent work, start the parent promise early and chain only the dependent request from it.
- Use `Suspense` to stream a non-layout-critical, slow server subtree when its fallback has stable dimensions. Do not introduce a boundary that harms SEO-critical content or causes disruptive layout shift.
- Keep request-specific data local to the render or handler. Module scope may contain immutable config, explicit loader maps, and intentionally keyed caches, never mutable request/user state.
- Rely on Next.js request memoization for identical `fetch` calls. Use `React.cache()` only to deduplicate non-`fetch` server work within one request, and add cross-request caches only with a bounded size, TTL, and clear invalidation need.
- Treat Server Actions and route handlers as public endpoints: validate input and authenticate/authorize every mutation inside the handler.
- For static server assets or configuration, start or read immutable I/O at module scope when it is safe to keep resident; do not hoist user-specific, mutable, or large runtime data.

Bundles and boundaries:

- Keep import and filesystem paths statically analyzable. Use explicit maps whose values are literal `import()` functions; never construct dynamic module paths from user or route strings.
- Use direct source imports instead of project barrel files when practical. Add `next/dynamic` only for genuinely heavy, non-critical client features and preserve a useful loading state.
- Pass the smallest client-usable shape across an RSC boundary. Do not send both source data and a cheaply derived copy; derive it on the side that already owns the needed source.
- Defer non-critical third-party scripts until after interaction. Use `next/script` with an appropriate strategy instead of raw blocking script tags.

Client state, events, and storage:

- Derive display state during render; put user-triggered work in the event handler. Use effects only to synchronize with browser or network systems.
- Use functional state updates whenever the next value depends on the previous value. Use lazy `useState` initialization for storage reads or expensive initial work.
- Do not add `memo`, `useMemo`, or `useCallback` by default. Use them only for measured expensive work, a stable callback required by a subscription, or a documented dependency boundary. Never define a component inside another component.
- Keep effect dependencies as narrow reactive primitives where possible. Use `useEffectEvent` for subscriptions that need the latest callback without resubscribing; do not place an Effect Event in a dependency array.
- Use `{ passive: true }` for scroll, wheel, and touch listeners that never call `preventDefault()`, and always remove global listeners and timers during cleanup.
- Store only minimal, versioned localStorage data; validate parsed values and wrap storage access in `try`/`catch`. Cache storage reads only when profiling shows a hot path, and keep the cache synchronized with writes and cross-tab changes.
- Use transitions or `useDeferredValue` only when a non-urgent update or expensive derived view demonstrably affects input responsiveness. Use refs for high-frequency transient values that do not need to render.

Rendering and JavaScript hot paths:

- For long, scrollable lists, consider `content-visibility: auto` with an appropriate intrinsic size before reaching for a virtualization dependency.
- Prefer explicit conditional rendering when a numeric condition could render `0`. Use `toSorted()` or a copied array before sorting props or state.
- Build `Set`/`Map` indexes for repeated membership/lookups, avoid sorting merely to find a minimum or maximum, and return early once an answer is known. Apply iteration and caching optimizations only to measured hot paths.
- Batch DOM reads separately from DOM writes and prefer CSS classes over imperative inline style mutation.

## 6. React 19 Standards

Component design:

- Keep components small and purpose-driven.
- Split a component when it handles data selection, a state machine, and complex presentation at the same time.
- Use explicit props interfaces.
- Name components after their domain purpose, not generic words such as `Wrapper` or `Container`.
- Do not create new component definitions during render.
- Do not store derived values in state.

State and effects:

- If a value can be derived from props, local variables, or existing state, do not store it separately.
- Use `useEffect` to synchronize with external systems, not to compute UI.
- Effects need complete dependencies and cleanup where relevant.
- Put event-driven side effects in event handlers.

React 19 preferences:

- Consider `useActionState` and `useFormStatus` for form and async state flows.
- Do not add `useMemo` or `useCallback` by default.
- Use memoization only when there is a real performance need or a required stable reference.
- Keep Server Components high in the tree and Client Components near the leaves.

## 7. TypeScript Standards

TypeScript is part of the project boundary, not decoration.

Baseline rules:

- Keep `strict: true`.
- Do not use `any`; use `unknown` and narrow it.
- Public functions should have clear return types.
- Prefer union types over scattered magic strings.
- Prefer an options object when a function has more than three parameters.
- Do not use type assertions to hide uncertainty.

Import rules:

- Production code should use `@/` aliases or clear relative imports.
- Tests may import with `.ts` extensions because `allowImportingTsExtensions` is enabled.
- Use `import type` for type-only imports.

Data boundaries:

- Validate external data at the smallest useful boundary.
- Do not make components depend directly on raw third-party API response shapes.
- Treat `localStorage`, `fetch` responses, and frontmatter as untrusted until adapted.

### 7.1 Code Formatting

The repository's `prettier.config.mjs` is the source of truth for formatting and takes precedence over user-level VS Code settings. VS Code uses the Prettier extension for JavaScript, TypeScript, TSX, JSON, and JSONC files.

- Use 2 spaces for indentation, LF line endings, UTF-8 encoding, no trailing whitespace, and a final newline.
- Use single quotes, semicolons, and trailing commas wherever Prettier supports them.
- Use a 120-character print width.
- For CSS, preserve the existing CSS language formatter behavior while following the shared `.editorconfig` whitespace and line-ending rules.
- Do not reformat unrelated files. When formatting changed files manually, use `pnpm exec prettier --write <changed-files>` so the repository config is applied.

## 8. Elegant Code Standards

Elegant code in this project is not "more abstract." It is code that reads with direction and can be changed without surprise.

Prefer:

- Small functions and components.
- Clear domain names.
- Early returns over nested conditionals.
- Table-driven mappings over long repeated condition chains.
- Data structures that express state instead of clusters of booleans.
- Comments that explain why, not what.

Avoid:

- Future-proof abstractions without a current need.
- Large catch-all shared helpers.
- Copy-paste changes that only alter strings.
- Business logic piled into page files.
- Multiple sources of truth for site config.
- Empty pages or lists without `EmptyState`.

Dependency judgment:

- Icons are inline SVG by default.
- State management starts with local React state and composition.
- Form, validation, and request libraries are not default choices.
- A new dependency must pay for itself by removing real complexity.

## 9. PC And Mobile Responsive Rules

Use Tailwind CSS default breakpoints. Do not customize `md` or create project-specific breakpoint values unless the user explicitly asks for a design-system change.

Primary layout ranges:

- Mobile: default styles below `768px`.
- Tablet and desktop: `md:*` styles from `768px` and up.

Layout rules:

- Always design mobile-first.
- Base classes describe mobile.
- Tablet and desktop enhancements use Tailwind `md:*` and larger default breakpoints.
- CSS Modules enhancements that must match `md` use `@media (min-width: 768px)`.
- Avoid `max-width` responsive rules unless a component truly needs a mobile-only override.
- Do not add Tailwind breakpoint overrides in `@theme`.

Common layout rhythm:

```tsx
<main className="px-4 py-10 md:px-6 md:py-16">
<section className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
<h1 className="text-3xl md:text-4xl">
```

Mobile interaction:

- Interactive targets must be at least `40px` tall or wide.
- Hover effects need active/touch equivalents.
- Inputs and textareas must be at least `1rem`.
- Drawers and menus lock body scroll when open.
- Overlays close via backdrop click and `Escape`.
- Keep viewport zoom enabled.

Visual strategy:

- Site pages and tool-like apps should feel clear, restrained, and scannable.
- Lab apps may be more expressive, but usability wins.
- Do not add decoration-only backgrounds.
- Text must not overflow buttons, cards, tags, or toolbars.
- Fixed-format UI such as boards, grids, toolbars, and counters should have stable dimensions to avoid layout shift during interaction.

## 10. Design Specifications

### Color

- Primary text: `#000000` (pure black)
- Secondary text: `#555555`
- Muted text: `#888888`
- Border: `#e5e5e5` (base), `#cccccc` (strong)
- Light theme accent: `#7c3aed` (vivid purple)
- Light theme accent hover: `#6d28d9`
- Light theme accent wash: `#f5f3ff` (very light purple background)
- Dark theme accent: `#a78bfa` (the current Vibe brand purple adapted for dark-background contrast)
- Dark theme accent hover: `#c4b5fd`
- Dark theme accent soft: `#5b4a78`
- Dark theme accent wash: `#282033`
- Dark theme accent faint: `#1a181f`
- Background: `#ffffff`
- All hex values must be lowercase.

Purple (accent) only appears on interactive elements: buttons, links, active nav states, badges, tags, code blocks, eyebrow labels. Non-interactive text and structural elements use black/gray only.

### Typography

- Font family: use the locally hosted Inter files in `public/fonts/` globally, with a system font fallback stack. Do not add remote font requests such as Google Fonts; keep only the Inter files required by the declared `@font-face` weights and styles.
- Font sizes: even px values only. Mobile minimum: 10px.
  - Mobile: 12px, 14px, 16px, 18px, 20px, 22px, 26px, 32px
  - Desktop (≥768px): 14px, 16px, 18px, 20px, 22px, 24px, 28px, 36px
- Font weight: 700 for headings, 600 for emphasis, 500 for body, 400 for muted
- Letter spacing: `-0.02em` to `-0.03em` for headings

### Spacing

- All padding, margin, and gap values must be multiples of 4px.
- Defined scale (in px): 4, 6, 8, 9, 10, 12, 16, 20, 24, 28, 32, 40, 48, 64
- Use CSS custom properties (`--space-*`) for all spacing values.
- Never use arbitrary `rem` or `px` values for spacing — always reference a token.

### Border Radius

- All border-radius values must be multiples of 4px: 8px, 12px, 16px, 20px.
- Use CSS custom properties (`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`).
- `border-radius: 50%` is only permitted for circular elements (spinners, dots) where a fixed px radius cannot produce a circle.

### Transitions

- Only `background`, `border-color`, `color`, and `opacity` may transition.
- Duration: 150ms (fast), 200ms (normal)
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- No `transition: all`.
- No `transform` transitions (no translateY, no scale, no rotate on interactive elements).

### Active / Hover States

- No underline, no left border bar, no glow shadow, no translateY, no scale on any interactive element.
- Active/selected state: color change only (e.g., accent text color + accent wash background).
- Hover state: same as active — color change only.
- Links in markdown content may show underline on hover/active (text-decoration only).
- Icons: default muted gray (`#888888`), hover/active → accent purple (`#7c3aed`).

### Inline Styles

- `style={{}}` is forbidden in all `.tsx` files.
- Use Tailwind utility classes, CSS Module classes, or global semantic utility classes defined in `globals.css`.

## 12. Styling System

Use Tailwind for:

- Layout
- Spacing
- Typography
- Responsive grids
- Simple states
- Color utilities

Use CSS Modules for:

- App-private complex styles
- Markdown/prose content
- Canvas or game UI
- Multi-state animations
- Visual compositions that are unclear in utility classes

Global styles are only for:

- Tailwind theme tokens
- CSS variables
- Reset/base styles
- Focus-visible behavior
- Safe-area or shared tokens

Do not use:

- CSS-in-JS
- styled-components
- Scattered global business classes
- `transition: all`
- Repeated hard-coded colors when a CSS variable should exist

## 13. Content And Service Boundaries

Blog:

- Content is local static files.
- Loading logic belongs in `features/blog/lib`.
- Rendering logic belongs in `features/blog/components`.
- Route pages only compose these pieces.

Lab:

- The registry is the public index of available apps.
- The loader map is the code-loading entrypoint.
- Individual app internals should not leak into the Lab feature.

## 14. Code Review Standards

Review for risk before style.

Priority order:

1. Correctness: logic, edge cases, 404s, empty states, error paths.
2. Security: XSS, raw HTML injection, untrusted input, external API responses.
3. Architecture: route, feature, component, and lib boundaries.
4. Responsiveness: Tailwind default breakpoints, mobile touch behavior, desktop scanability.
5. TypeScript: types should express constraints rather than bypass checks.
6. Maintainability: naming, duplication, nesting, and abstraction quality.
7. Tests: critical behavior should have regression coverage.

Review output:

- Put findings first.
- Sort by severity.
- Include file and line references.
- If no issues are found, say so and list remaining risks.
- Do not block on pure formatting preferences.

## 15. Testing And Delivery

Run the relevant commands before completing code changes:

```bash
pnpm run test
pnpm run lint
pnpm run typecheck
pnpm run build
```

Hard gate for any code modification:

- Any change to application code, server code, configuration, build pipeline, or shared logic is not complete until local `pnpm run typecheck` passes with `0` errors.
- Any change to application code, server code, configuration, build pipeline, or shared logic is not complete until local `pnpm run build` passes with `0` errors.
- Treat Vercel build failures as local verification failures that must be reproduced and fixed before delivery whenever the environment can run pnpm.
- Do not hand off, summarize as done, or ask the user to verify later if local `pnpm run typecheck` or local `pnpm run build` still reports any error.
- If pnpm cannot run in the current environment, explicitly say that the hard gate could not be executed and report the closest substitute verification you performed.

Minimum expectations:

- Behavior changes need tests.
- Shared helper changes need tests.
- Route or build pipeline changes need `pnpm run build`.
- Every code modification must include local `pnpm run typecheck` and local `pnpm run build`, and both must finish with `0` errors before the task is considered complete.
- Responsive/style rule changes need mobile and desktop checks.
- If pnpm cannot run in the environment, explain why and report substitute verification.

Current test entrypoint:

- `pnpm run test` calls the Node test runner.
- Lightweight regression tests are colocated `*.test.ts` files.
- Tests should focus on behavior, not implementation details.

Test file lifecycle:

- After every task, audit all new and changed tests before delivery.
- Delete temporary, task-specific, duplicated, and superseded tests after the requirement has been verified.
- Keep a test only when it provides distinct, permanent regression coverage for behavior that remains part of the product.
- Consolidate overlapping cases into the nearest existing test file instead of creating one-off test files.
- Remove empty test directories and test-only fixtures when their final consumer is deleted.
- In the final response, explicitly confirm that the test cleanup audit was completed.

Lint:

- Use `pnpm run lint`.
- The underlying command is `eslint .`.
- Do not use `next lint`.

## 16. Codex Execution Principles

### 16.1 Skills And Delegation

- Do not use Superpowers skills or workflows for work in this repository.
- Do not use subagents for work in this repository.

When starting a task:

- Read relevant files before editing.
- Understand existing patterns before adding new ones.
- If the user did not ask for discussion only, implement the requested change.
- If the worktree already has changes, do not revert them. Determine whether they affect the task and work with them.

When editing:

- Use `apply_patch` for manual edits.
- Keep changes close to the task.
- Do not perform unrelated refactors.
- Do not add dependencies unless the benefit is clear and stated.

When delivering:

- Summarize what changed.
- State which verification commands ran.
- For any code modification, explicitly report the results of local `pnpm run typecheck` and local `pnpm run build`.
- Do not describe a code change as complete unless both commands passed with `0` errors, unless pnpm was unavailable and that limitation was stated clearly.
- If a command was not run, explain why.
- Do not leave cleanup work for the user when Codex can complete it.

---

This guide is the engineering entrypoint for Vibe. When implementation choices are unclear, return to these principles: lightweight, clear, mobile-first, boundary-aware, and verified.
