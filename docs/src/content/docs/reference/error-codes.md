---
title: Error Codes
description: Complete list of Foundation CLI error codes and their meanings
---



All Foundation CLI errors extend `FoundationError` and carry a stable `code` string.

## Core Errors

| Error | Code | Description |
|-------|------|-------------|
| `ModuleNotFoundError` | `ERR_MODULE_NOT_FOUND` | Selected module ID doesn't exist |
| `ModuleConflictError` | `ERR_MODULE_CONFLICT` | Incompatible modules selected |
| `MissingRequiredModuleError` | `ERR_MISSING_REQUIRED_MODULE` | Required capability has no provider |
| `ModuleDeprecatedError` | `ERR_MODULE_DEPRECATED` | Module is deprecated |
| `ModuleRemovedError` | `ERR_MODULE_REMOVED` | Module has been removed |

## ORM Errors

| Error | Code | Description |
|-------|------|-------------|
| `ORMProviderAlreadyRegisteredError` | `ERR_ORM_PROVIDER_ALREADY_REGISTERED` | Second ORM provider registered |
| `ORMProviderNotFoundError` | `ERR_ORM_PROVIDER_NOT_FOUND` | No ORM provider available |

## Transaction Errors

| Error | Code | Description |
|-------|------|-------------|
| `TransactionStateError` | `ERR_TRANSACTION_STATE` | Invalid transaction state |
| `TransactionCommitError` | `ERR_TRANSACTION_COMMIT` | Failed to commit files |
| `TransactionRollbackError` | `ERR_TRANSACTION_ROLLBACK` | Failed to rollback |

## Installation Errors

| Error | Code | Description |
|-------|------|-------------|
| `DependencyInstallError` | `ERR_DEPENDENCY_INSTALL` | Package installation failed |
| `PackageNotFoundError` | `ERR_PACKAGE_NOT_FOUND` | npm package not found |
| `VersionConflictError` | `ERR_VERSION_CONFLICT` | Incompatible dependency versions |

## Hook Errors

| Error | Code | Description |
|-------|------|-------------|
| `HookExecutionError` | `ERR_HOOK_EXECUTION` | Hook threw during execution |
| `HookTimeoutError` | `ERR_HOOK_TIMEOUT` | Hook exceeded timeout |

## Handling Errors

```typescript
import { ModuleNotFoundError } from '@systemlabs/foundation-core';

try {
  await foundation.create(options);
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.log('Module not found:', error.moduleId);
  }
}
```

## Related

- [Troubleshooting](/reference/troubleshooting/)
- [Dependency Resolution](/core-concepts/dependency-resolution/)
