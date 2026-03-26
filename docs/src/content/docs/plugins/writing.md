---
title: Writing a Plugin
description: How to build a community plugin for Foundation CLI
---



Plugins extend Foundation CLI with custom modules, hooks, or integrations.

## Quick Start

```bash
foundation create-plugin my-plugin
```

This scaffolds:

```
foundation-plugin-my-plugin/
├── manifest.json
├── hooks.mjs
├── package.json
├── tsconfig.json
├── src/index.ts
├── README.md
├── files/
└── patches/
```

## manifest.json

```json
{
  "id": "plugin-my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A custom plugin",
  "category": "addon",
  "runtime": "node",
  "provides": [],
  "requires": [],
  "dependencies": [],
  "files": [],
  "configPatches": []
}
```

## hooks.mjs

```javascript
export default {
  onRegister: async (ctx) => {
    console.log('Plugin registered!');
  },
  afterWrite: async (ctx) => {
    // Add custom files or run post-install logic
  }
};
```

## Package.json

```json
{
  "name": "foundation-plugin-my-plugin",
  "version": "1.0.0",
  "keywords": ["foundation-plugin"],
  "foundation": {
    "manifest": "manifest.json"
  }
}
```

## Publishing

```bash
npm publish --access public
```

Users install with:

```bash
foundation add foundation-plugin-my-plugin
```

## Related

- [Plugins Overview](/plugins/overview/)
- [Manifest Schema](/plugins/manifest/)
- [Sandbox Security](/plugins/sandbox/)
