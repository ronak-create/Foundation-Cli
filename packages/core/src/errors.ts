export class FoundationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FoundationError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FoundationError);
    }
  }
}

// ── FileTransaction errors ────────────────────────────────────────────────────

export class PathTraversalError extends FoundationError {
  constructor(attemptedPath: string) {
    super(
      `Path traversal detected: "${attemptedPath}" escapes the project root.`,
      "ERR_PATH_TRAVERSAL",
    );
    this.name = "PathTraversalError";
  }
}

export class TransactionStateError extends FoundationError {
  constructor(expectedState: string, actualState: string) {
    super(
      `Invalid transaction state: expected "${expectedState}", got "${actualState}".`,
      "ERR_TRANSACTION_STATE",
    );
    this.name = "TransactionStateError";
  }
}

export class TransactionCommitError extends FoundationError {
  constructor(cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : "Unknown commit error";
    super(`Transaction commit failed: ${message}`, "ERR_TRANSACTION_COMMIT");
    this.name = "TransactionCommitError";
  }
}

export class TransactionRollbackError extends FoundationError {
  constructor(cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : "Unknown rollback error";
    super(
      `Transaction rollback failed: ${message}`,
      "ERR_TRANSACTION_ROLLBACK",
    );
    this.name = "TransactionRollbackError";
  }
}

// ── Registry errors ───────────────────────────────────────────────────────────

export class DuplicateModuleError extends FoundationError {
  constructor(id: string) {
    super(
      `A module with id "${id}" is already registered.`,
      "ERR_DUPLICATE_MODULE",
    );
    this.name = "DuplicateModuleError";
  }
}

export class ModuleNotFoundError extends FoundationError {
  constructor(id: string) {
    super(`Module "${id}" is not registered.`, "ERR_MODULE_NOT_FOUND");
    this.name = "ModuleNotFoundError";
  }
}

// ── Manifest validation errors ────────────────────────────────────────────────

/**
 * Carries field-level validation failure details.
 * Each entry in `fieldErrors` describes exactly which field failed and why,
 * making programmatic inspection possible without parsing the message string.
 */
export interface ValidationFieldError {
  /** JSON-pointer-style path, e.g. "dependencies[0].name" or "version" */
  readonly field: string;
  /** Human-readable reason, e.g. "must match semver pattern" */
  readonly message: string;
  /** The invalid value, if available */
  readonly value?: unknown;
}

export class ValidationError extends FoundationError {
  constructor(
    public readonly manifestId: string | undefined,
    public readonly fieldErrors: ReadonlyArray<ValidationFieldError>,
  ) {
    const summary = fieldErrors
      .map((e) => `  • ${e.field}: ${e.message}`)
      .join("\n");
    const id = manifestId !== undefined ? `"${manifestId}"` : "(unknown)";
    super(
      `Manifest validation failed for module ${id}:\n${summary}`,
      "ERR_MANIFEST_VALIDATION",
    );
    this.name = "ValidationError";
  }
}

// ── Resolver errors ───────────────────────────────────────────────────────────

export class CircularDependencyError extends FoundationError {
  constructor(public readonly cycle: ReadonlyArray<string>) {
    super(
      `Circular dependency detected: ${cycle.join(" → ")}`,
      "ERR_CIRCULAR_DEPENDENCY",
    );
    this.name = "CircularDependencyError";
  }
}

export class ModuleConflictError extends FoundationError {
  constructor(
    public readonly moduleId: string,
    public readonly conflictsWith: string,
  ) {
    super(
      `Module "${moduleId}" conflicts with "${conflictsWith}".`,
      "ERR_MODULE_CONFLICT",
    );
    this.name = "ModuleConflictError";
  }
}

export class MissingRequiredModuleError extends FoundationError {
  constructor(
    public readonly moduleId: string,
    public readonly requiredBy: string,
  ) {
    super(
      `Module "${requiredBy}" requires "${moduleId}", but it is not registered.`,
      "ERR_MISSING_REQUIRED_MODULE",
    );
    this.name = "MissingRequiredModuleError";
  }
}

// ── Composition errors ────────────────────────────────────────────────────────

export class DuplicateFilePathError extends FoundationError {
  constructor(
    public readonly filePath: string,
    public readonly moduleA: string,
    public readonly moduleB: string,
  ) {
    super(
      `Duplicate file path "${filePath}" contributed by both "${moduleA}" and "${moduleB}".`,
      "ERR_DUPLICATE_FILE_PATH",
    );
    this.name = "DuplicateFilePathError";
  }
}

export class ConflictingDependencyVersionError extends FoundationError {
  constructor(
    public readonly packageName: string,
    public readonly versionA: string,
    public readonly versionB: string,
  ) {
    super(
      `Conflicting versions for package "${packageName}": "${versionA}" vs "${versionB}".`,
      "ERR_CONFLICTING_DEPENDENCY_VERSION",
    );
    this.name = "ConflictingDependencyVersionError";
  }
}

// ── State errors ──────────────────────────────────────────────────────────────

export class StateWriteError extends FoundationError {
  constructor(
    public readonly file: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Failed to write Foundation state file "${file}": ${msg}`,
      "ERR_STATE_WRITE",
    );
    this.name = "StateWriteError";
  }
}

export class StateReadError extends FoundationError {
  constructor(
    public readonly file: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Failed to read Foundation state file "${file}": ${msg}`,
      "ERR_STATE_READ",
    );
    this.name = "StateReadError";
  }
}