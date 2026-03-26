---
title: Plugin Manifest Schema
description: Complete reference for plugin manifest.json fields
---



The manifest.json defines your plugin's metadata, files, and configuration.

## Full Schema

```json
{
  "id": "plugin-example",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "A descriptive description",
  "category": "addon",
  "runtime": "node",
  "provides": [],
  "requires": [],
  "dependencies": [],
  "files": [],
  "configPatches": [],
  "compatibility": {
    "requires": [],
    "conflicts": [],
    "compatibleWith": {}
  }
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID in kebab-case |
| `name` | string | Human-readable name |
| `version` | string | semver version |
| `description` | string | Brief description |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `category` | string | Module category |
| `runtime` | string | `node`, `python`, or `multi` |
| `provides` | string[] | Capability tokens |
| `requires` | string[] | Required capabilities |
| `dependencies` | PackageDependency[] | npm packages |
| `files` | FileEntry[] | Files to generate |
| `configPatches` | ConfigPatch[] | Config merges |
| `compatibility` | Compatibility | Conflict rules |

## FileEntry

```json
{
  "relativePath": "src/my-file.ts",
  "content": "console.log('Hello');",
  "when": "deployment.docker"
}
```

## ConfigPatch

```json
{
  "file": "package.json",
  "patch": {
    "scripts": {
      "my-script": "node src/my-file.js"
    }
  }
}
```

## Related

- [Writing a Plugin](/plugins/writing/)
- [Module Manifest](/reference/module-manifest/)
