---
title: UI Libraries
description: UI systems - Tailwind CSS, ShadCN/UI, Material UI, Chakra UI, Bootstrap
---



Foundation CLI supports 5 UI systems. These pair with frontend frameworks to provide styling and components.

## Available Modules

| ID | Name | Requires | Key Files |
|----|------|----------|-----------|
| `ui-tailwind` | Tailwind CSS | — | tailwind.config.js, postcss.config.js, globals.css |
| `ui-shadcn` | ShadCN/UI | ui-tailwind | tailwind.config.ts, components.json, lib/utils.ts |
| `ui-mui` | Material UI | — | src/lib/theme.ts, components/MuiProvider.tsx |
| `ui-chakra` | Chakra UI | — | components/ChakraProvider.tsx |
| `ui-bootstrap` | Bootstrap | — | src/app/layout.tsx, src/styles/custom.scss |

## Tailwind CSS (`ui-tailwind`)

Utility-first CSS framework:
- `tailwind.config.js` — Content paths, theme extension
- `postcss.config.js` — PostCSS with Tailwind + Autoprefixer
- `src/app/globals.css` — Tailwind directives

## ShadCN/UI (`ui-shadcn`)

Builds on Tailwind with CSS variables:
- `tailwind.config.ts` — CSS variable-based colors
- `components.json` — ShadCN component config
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)

Auto-injects `ui-tailwind` as dependency.

## Material UI (`ui-mui`)

React component library:
- `src/lib/theme.ts` — MUI createTheme() with palette + typography
- `src/components/MuiProvider.tsx` — ThemeProvider wrapper

Dependencies: `@mui/material`, `@emotion/react`, `@emotion/styled`

## Chakra UI (`ui-chakra`)

Accessible component library:
- `src/components/ChakraProvider.tsx` — ChakraProvider with custom theme

Dependencies: `@chakra-ui/react`, `@emotion/react`, `@emotion/styled`, `framer-motion`

## Bootstrap (`ui-bootstrap`)

Classic CSS framework:
- `src/app/layout.tsx` — Bootstrap CSS import
- `src/styles/custom.scss` — SCSS entry point

Dependencies: `bootstrap`, `sass`

## Related

- [Modules Overview](/modules/overview/) — All categories
- [Frontend Modules](/modules/frontend/) — Pair with frontend
- [State Management](/modules/state/) — Add state management
