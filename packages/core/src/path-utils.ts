// packages/core/src/path-utils.ts
import path from "node:path";
import { PathTraversalError } from "./errors.js";

/**
 * Normalises a path using posix separators for internal consistency,
 * then converts to the platform-native separator for actual I/O.
 */
export function normalisePosix(input: string): string {
  return input.split(path.sep).join(path.posix.sep);
}

/**
 * Resolves `relativePath` against `root` and asserts that the result
 * is strictly contained within `root`.  Throws PathTraversalError if not.
 *
 * @param root         Absolute path to the project root.
 * @param relativePath Caller-supplied relative path (may be adversarial).
 * @returns            Absolute, platform-native resolved path.
 */
export function safeResolve(root: string, relativePath: string): string {
  // Normalise both paths to posix internally, then resolve to absolute.
  const normRoot = path.resolve(root);
  const resolved = path.resolve(normRoot, relativePath);

  // Ensure the resolved path starts with root + separator (or IS root).
  const rootWithSep = normRoot.endsWith(path.sep)
    ? normRoot
    : normRoot + path.sep;

  if (resolved !== normRoot && !resolved.startsWith(rootWithSep)) {
    throw new PathTraversalError(relativePath);
  }

  return resolved;
}

/**
 * Returns the relative posix path from `root` to `absolute`.
 * For display / logging purposes only.
 */
export function toRelativePosix(root: string, absolute: string): string {
  return normalisePosix(path.relative(root, absolute));
}
