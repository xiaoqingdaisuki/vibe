# Vibe Agent Guide

> Read this file completely before doing any work in this repository. It is the engineering guide for helping Codex understand, extend, and review Vibe.

## 0. Session Capability Boundary

If the current model does not support image input and the user provides or references an image file such as `image.png`, do not try to inspect that image through the filesystem as a workaround. State that this session cannot accept image input, ask the user to switch to a vision-capable model for image analysis, and continue with any text-only part of the request.

## 0.1 Windows UTF-8 And Chinese Text Safety

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
2. Create `src/features/apps/{slug}/page.tsx` as a thin wrapper.
3. Register metadata in `src/features/lab/registry.ts`.
4. Register the explicit loader in `src/features/apps/loaders.ts`.

Recommended structure:

```text
src/features/apps/{slug}/
  page-client.tsx
  page.tsx
  types.ts
  data.ts
  components/
  styles/
    AppName.module.css
```

Client app template:

```tsx
'use client'

export function AppName() {
  return <div>App UI</div>
}

export default AppName
```

Wrapper template:

```tsx
import AppName from './page-client'

export default function Page() {
  return <AppName />
}
```

Never use a template-string dynamic import inside `src/app/lab/[slug]/page.tsx`:

```ts
import(`@/features/apps/${slug}/page-client`)
```

Turbopack needs an explicit import map for stable builds and static analysis.

### 4.2 Add A Blog Post

Blog files live in `src/content/blog/` and may use `.md` or `.mdx`.

Required frontmatter:

```yaml
title: "Post title"
description: "Post description"
date: "2026-07-06"
tags: ["tag"]
category: "Category"
published: true
```

Blog rendering rules:

- Parse metadata with `gray-matter`.
- Render body content through `next-mdx-remote/rsc`.
- Do not inject markdown with `dangerouslySetInnerHTML`.
- Do not hand-roll a markdown parser.

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
- Accent (theme color): `#7c3aed` (vivid purple)
- Accent hover: `#6d28d9`
- Accent wash: `#f5f3ff` (very light purple background)
- Background: `#ffffff`
- All hex values must be lowercase.

Purple (accent) only appears on interactive elements: buttons, links, active nav states, badges, tags, code blocks, eyebrow labels. Non-interactive text and structural elements use black/gray only.

### Typography

- Font family: browser default system font stack only. No external font imports (no Google Fonts, no `next/font`).
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

- If Codex creates a task-specific test file during development, Codex must remove that test file before delivery after the corresponding feature or fix is complete, unless the user explicitly asks to keep it as permanent regression coverage.
- Do not leave redundant test files in the project.

Lint:

- Use `pnpm run lint`.
- The underlying command is `eslint .`.
- Do not use `next lint`.

## 16. Codex Execution Principles

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
