---
title: Sandbox Security
description: How plugin hooks run securely in isolated worker threads
---



Community plugin hooks run in a sandboxed environment to prevent malicious code from accessing your system.

## Security Model

- **worker_threads Worker** — Physically separate V8 context (not `vm.Script`)
- Blocks function constructor escape path

## Blocked Modules

Sandboxed hooks cannot require:

- `fs`, `net`, `child_process`
- `http`, `https` (outbound requests)
- `os`, `vm`, `module`, `require`

## Allowed Modules

Only safe subsets:

- `crypto` (hashing)
- `path` (path manipulation)

## File Access

Hooks cannot access paths outside `projectRoot`:

```typescript
// This throws
import { readFileSync } from 'fs';
readFileSync('/etc/passwd'); // Blocked by safeResolve()
```

## Timeout

Hooks timeout after 30 seconds to prevent infinite loops.

## Error Types

| Error | Description |
|-------|-------------|
| `SandboxBlockedModuleError` | Attempted to require blocked module |
| `SandboxTimeoutError` | Hook exceeded timeout |
| `SandboxError` | General sandbox violation |

## Related

- [Writing a Plugin](/plugins/writing/)
- [Hooks](/core-concepts/hooks/)
