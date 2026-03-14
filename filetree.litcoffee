# File Tree: Foundation-Cli

**Generated:** 3/14/2026, 3:07:07 PM
**Root Path:** `c:\Users\RONAK P\OneDrive\Desktop\Foundation CLI\foundation-cli-error-resolve\Foundation-Cli`

```
├── .github
│   └── workflows
│       └── ci.yml
├── packages
│   ├── cli
│   │   ├── src
│   │   │   ├── __tests__
│   │   │   │   ├── generate.integration.test.ts
│   │   │   │   ├── phase1-credentials.test.ts
│   │   │   │   ├── phase4.integration.test.ts
│   │   │   │   └── prompt-graph.test.ts
│   │   │   ├── commands
│   │   │   │   ├── add.ts
│   │   │   │   ├── create-plugin.ts
│   │   │   │   ├── create.ts
│   │   │   │   ├── eject.ts
│   │   │   │   ├── plugins.ts
│   │   │   │   ├── search.ts
│   │   │   │   ├── upgrade.ts
│   │   │   │   └── validate.ts
│   │   │   ├── execution
│   │   │   │   └── env-writer.ts
│   │   │   ├── generator
│   │   │   │   └── generate.ts
│   │   │   ├── prompt
│   │   │   │   ├── adapter.ts
│   │   │   │   ├── archetypes.ts
│   │   │   │   ├── credential-collector.ts
│   │   │   │   ├── credentials.ts
│   │   │   │   ├── flow.ts
│   │   │   │   ├── graph-definition.ts
│   │   │   │   ├── graph.ts
│   │   │   │   └── questions.ts
│   │   │   ├── ui
│   │   │   │   └── renderer.ts
│   │   │   ├── bin.ts
│   │   │   ├── conflict-resolver.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── vitest.config.ts
│   ├── core
│   │   ├── src
│   │   │   ├── __tests__
│   │   │   │   ├── conflict-detection.test.ts
│   │   │   │   ├── execution.integration.test.ts
│   │   │   │   ├── manifest-validator.test.ts
│   │   │   │   ├── npm-search.test.ts
│   │   │   │   ├── planner.test.ts
│   │   │   │   ├── plugin-discovery.test.ts
│   │   │   │   ├── plugin-installer.test.ts
│   │   │   │   ├── plugin-sandbox.test.ts
│   │   │   │   ├── project-state.test.ts
│   │   │   │   ├── registry-plugins.test.ts
│   │   │   │   ├── registry.test.ts
│   │   │   │   └── resolver.test.ts
│   │   │   ├── composition
│   │   │   │   └── planner.ts
│   │   │   ├── dependency-resolver
│   │   │   │   ├── graph.ts
│   │   │   │   └── resolver.ts
│   │   │   ├── execution
│   │   │   │   ├── config-merger.ts
│   │   │   │   ├── dependency-installer.ts
│   │   │   │   ├── hook-runner.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── pipeline.ts
│   │   │   │   └── project-writer.ts
│   │   │   ├── file-merger
│   │   │   │   ├── json-merge.ts
│   │   │   │   └── requiremenets-merge.ts
│   │   │   ├── installer
│   │   │   │   └── install.ts
│   │   │   ├── manifest-validator
│   │   │   │   ├── index.ts
│   │   │   │   └── validator.ts
│   │   │   ├── module-registry
│   │   │   │   ├── loader.ts
│   │   │   │   ├── module-loader.ts
│   │   │   │   └── registry.ts
│   │   │   ├── orm
│   │   │   │   ├── index.ts
│   │   │   │   └── orm-service.ts
│   │   │   ├── plugin-installer
│   │   │   │   ├── index.ts
│   │   │   │   ├── npm-fetcher.ts
│   │   │   │   └── plugin-installer.ts
│   │   │   ├── registry-search
│   │   │   │   ├── index.ts
│   │   │   │   └── npm-search.ts
│   │   │   ├── sandbox
│   │   │   │   ├── index.ts
│   │   │   │   ├── plugin-sandbox.ts
│   │   │   │   └── safe-path.ts
│   │   │   ├── state
│   │   │   │   ├── index.ts
│   │   │   │   ├── lockfile.ts
│   │   │   │   └── project-state.ts
│   │   │   ├── templating
│   │   │   │   └── render.ts
│   │   │   ├── errors.ts
│   │   │   ├── file-transaction.ts
│   │   │   ├── index.ts
│   │   │   ├── path-utils.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── vitest.config.ts
│   ├── modules
│   │   ├── src
│   │   │   ├── __tests__
│   │   │   │   ├── addon-plugins.integration.test.ts
│   │   │   │   └── module-loader.test.ts
│   │   │   ├── addon
│   │   │   │   ├── openai
│   │   │   │   │   ├── hooks.mjs
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── manifest.json
│   │   │   │   ├── redis
│   │   │   │   │   ├── hooks.mjs
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── manifest.json
│   │   │   │   ├── stripe
│   │   │   │   │   ├── hooks.mjs
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── manifest.json
│   │   │   │   └── index.ts
│   │   │   ├── auth
│   │   │   │   ├── auth0.ts
│   │   │   │   ├── clerk.ts
│   │   │   │   ├── jwt.ts
│   │   │   │   ├── oauth.ts
│   │   │   │   └── session.ts
│   │   │   ├── backend
│   │   │   │   ├── django.ts
│   │   │   │   ├── express.ts
│   │   │   │   ├── fastapi.ts
│   │   │   │   └── nestjs.ts
│   │   │   ├── database
│   │   │   │   ├── mongodb.ts
│   │   │   │   ├── mysql.ts
│   │   │   │   ├── postgresql.ts
│   │   │   │   ├── sqlite.ts
│   │   │   │   └── supabase.ts
│   │   │   ├── deployment
│   │   │   │   ├── aws.ts
│   │   │   │   ├── docker.ts
│   │   │   │   ├── render.ts
│   │   │   │   └── vercel.ts
│   │   │   ├── frontend
│   │   │   │   ├── nextjs.ts
│   │   │   │   ├── react-vite.ts
│   │   │   │   ├── svelte.ts
│   │   │   │   └── vue.ts
│   │   │   ├── orm
│   │   │   │   ├── mongoose.ts
│   │   │   │   ├── prisma.ts
│   │   │   │   ├── provider-utils.ts
│   │   │   │   ├── sqlalchemy.ts
│   │   │   │   └── typeorm.ts
│   │   │   ├── state
│   │   │   │   ├── redux.ts
│   │   │   │   ├── tanstack-query.ts
│   │   │   │   └── zustand.ts
│   │   │   ├── ui
│   │   │   │   ├── bootstrap.ts
│   │   │   │   ├── chakra.ts
│   │   │   │   ├── mui.ts
│   │   │   │   ├── shadcn.ts
│   │   │   │   └── tailwind.ts
│   │   │   ├── index.ts
│   │   │   └── registry-loader.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── vitest.config.ts
│   ├── plugin-sdk
│   │   ├── src
│   │   │   ├── __tests__
│   │   │   │   ├── integration.test.ts
│   │   │   │   ├── schema.test.ts
│   │   │   │   └── validate.test.ts
│   │   │   ├── index.ts
│   │   │   ├── schema.ts
│   │   │   ├── types.ts
│   │   │   └── validate.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   └── testing
│       ├── src
│       │   ├── fixtures.ts
│       │   └── index.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── tsup.config.ts
├── public
│   └── favicon.svg
├── .eslintrc.cjs
├── .gitignore
├── .prettierrc.json
├── LICENSE
├── README.md
├── index.html
├── package.json
├── packages.zip
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── turbo.json
```

---
*Generated by FileTree Pro Extension*