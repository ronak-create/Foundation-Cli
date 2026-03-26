---
title: State Management
description: State libraries - Zustand, Redux Toolkit, TanStack Query
---



Foundation CLI supports 3 state management solutions.

## Available Modules

| ID | Name | Key Files |
|----|------|-----------|
| `state-zustand` | Zustand | src/store/index.ts |
| `state-redux` | Redux Toolkit | src/store/index.ts, src/store/counterSlice.ts, ReduxProvider.tsx |
| `state-tanstack-query` | TanStack Query | src/lib/query-client.ts, QueryProvider.tsx, example hooks |

## Zustand (`state-zustand`)

Minimalist state management:
- `src/store/index.ts` — Zustand store with devtools + persist middleware

```typescript
import { create } from 'zustand';

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

Dependencies: `zustand`

## Redux Toolkit (`state-redux`)

Official Redux patterns:
- `src/store/index.ts` — configureStore
- `src/store/counterSlice.ts` — Example slice
- `src/components/ReduxProvider.tsx` — Provider wrapper

Dependencies: `@reduxjs/toolkit`, `react-redux`

## TanStack Query (`state-tanstack-query`)

Server state management:
- `src/lib/query-client.ts` — QueryClient with defaults
- `src/components/QueryProvider.tsx` — QueryClientProvider wrapper
- `src/hooks/use-example.ts` — Example useQuery hook

Dependencies: `@tanstack/react-query`, `@tanstack/react-query-devtools`

## When to Use Each

| Use Case | Recommended |
|----------|-------------|
| Client state only | Zustand |
| Complex global state | Redux Toolkit |
| Server data + caching | TanStack Query |
| Mix of client + server | TanStack Query (covers both) |

## Related

- [Modules Overview](/modules/overview/) — All categories
- [Frontend Modules](/modules/frontend/) — Pair with frontend
- [UI Libraries](/modules/ui/) — Pair with UI system
