import nodePath from "node:path";

/**
 * A minimal, namespaced path API injected into the plugin sandbox.
 *
 * Only the methods that are genuinely useful in a hook (string manipulation)
 * are exposed. Methods that touch the filesystem (exists, stat, readdir, etc.)
 * are excluded — those belong to FileTransaction.
 *
 * All methods are pure functions that operate on strings only.
 */
export interface SandboxedPath {
  readonly join: (...segments: string[]) => string;
  readonly basename: (p: string, ext?: string) => string;
  readonly dirname: (p: string) => string;
  readonly extname: (p: string) => string;
  readonly relative: (from: string, to: string) => string;
  readonly isAbsolute: (p: string) => boolean;
  readonly normalize: (p: string) => string;
}

export function makeSafePath(): SandboxedPath {
  return Object.freeze({
    join: (...segments: string[]) => nodePath.join(...segments),
    basename: (p: string, ext?: string) => nodePath.basename(p, ext),
    dirname: (p: string) => nodePath.dirname(p),
    extname: (p: string) => nodePath.extname(p),
    relative: (from: string, to: string) => nodePath.relative(from, to),
    isAbsolute: (p: string) => nodePath.isAbsolute(p),
    normalize: (p: string) => nodePath.normalize(p),
  });
}
