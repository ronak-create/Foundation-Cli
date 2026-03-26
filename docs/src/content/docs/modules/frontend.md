---
title: Frontend Modules
description: Frontend frameworks - Next.js, React + Vite, Vue 3, Svelte
---



Foundation CLI supports 4 frontend frameworks. Each generates a complete, working frontend with hot reload, TypeScript, and modern tooling.

## Available Modules

| ID | Name | Provides | Key Files |
|----|------|----------|-----------|
| `frontend-nextjs` | Next.js (App Router) | `frontend` | app/layout.tsx, app/page.tsx, next.config.mjs |
| `frontend-react-vite` | React 18 + Vite | `frontend` | src/main.tsx, src/App.tsx, vite.config.ts |
| `frontend-vue` | Vue 3 + Vite | `frontend` | src/App.vue, src/main.ts, vite.config.ts |
| `frontend-svelte` | Svelte + Vite | `frontend` | src/App.svelte, svelte.config.js, vite.config.ts |

## Next.js (`frontend-nextjs`)

Full Next.js 14 App Router setup with:
- `app/layout.tsx` — Root layout with metadata
- `app/page.tsx` — Home page
- `app/globals.css` — Global styles
- `next.config.mjs` — Next.js config
- TypeScript configured

```bash
foundation create my-app --preset saas
# Select Next.js when prompted
```

## React + Vite (`frontend-react-vite`)

React 18 with Vite for fast development:
- `index.html` — Entry HTML
- `src/main.tsx` — React root mount
- `src/App.tsx` — Root component
- `vite.config.ts` — Vite config with React plugin

## Vue 3 (`frontend-vue`)

Vue 3 with Composition API:
- `src/App.vue` — Root component
- `src/main.ts` — Vue app mount
- `vite.config.ts` — Vite config with Vue plugin

## Svelte (`frontend-svelte`)

Svelte 4/5 with Vite:
- `src/App.svelte` — Root component
- `src/main.ts` — Mount script
- `svelte.config.js` — Svelte config
- `vite.config.ts` — Vite config with Svelte plugin

## Using Multiple Frontends

Foundation CLI generates one frontend per project. The `frontend` capability token ensures only one is selected.

## Related

- [Modules Overview](/modules/overview/) — All categories
- [Backend Modules](/modules/backend/) — Pair with a backend
- [UI Libraries](/modules/ui/) — Add a UI system
