---
title: Module Manifest Reference
description: Complete reference for module manifest.json fields
---



The module manifest defines what a module generates and how it integrates.

## Full Schema

```typescript
interface ModuleManifest {
  id: string;                    // kebab-case, unique
  name: string;
  version: string;               // semver
  description: string;
  category: PluginCategory;
  runtime?: "node" | "python" | "multi";
  provides?: string[];           // capability tokens
  optional?: string[];           // soft dependencies
  variables?: Record<string, VariableDef>;
  postInstallInstructions?: string;
  status?: "stable" | "experimental" | "deprecated" | "removed";
  dependencies: PackageDependency[];
  files: FileEntry[];
  configPatches: ConfigPatch[];
  compatibility: {
    requires?: string[];
    conflicts?: string[];
    compatibleWith?: Record<string, string[]>;
    peerFrameworks?: Record<string, string>;
  };
  tags?: string[];
}
```

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | Yes | Display name |
| `version` | string | Yes | semver version |
| `description` | string | Yes | Brief description |
| `category` | string | Yes | Module category |
| `runtime` | string | No | `node`, `python`, `multi` |
| `provides` | string[] | No | Capabilities provided |
| `requires` | string[] | No | Capabilities needed |
| `status` | string | No | Lifecycle status |

## FileEntry

```typescript
interface FileEntry {
  relativePath: string;
  content: string;
  when?: string;  // Conditional: 'deployment.docker', etc.
}
```

## ConfigPatch

```typescript
interface ConfigPatch {
  file: string;
  patch: Record<string, any>;
  strategy?: 'merge' | 'replace';
}
```

## Example: Backend Module

```json
{
  "id": "backend-express",
  "name": "Express",
  "version": "0.1.0",
  "category": "backend",
  "description": "Fast, unopinionated web framework",
  "runtime": "node",
  "provides": ["backend"],
  "requires": [],
  "dependencies": [
    { "name": "express", "version": "^4.18.0", "scope": "dependencies" }
  ],
  "files": [
    { "relativePath": "src/server.ts", "content": "..." }
  ],
  "configPatches": [
    {
      "file": "package.json",
      "patch": { "scripts": { "dev": "ts-node src/server.ts" } }
    }
  ],
  "compatibility": {
    "conflicts": []
  }
}
```

## Related

- [Module System](/core-concepts/module-system/)
- [Plugins: Manifest](/plugins/manifest/)
