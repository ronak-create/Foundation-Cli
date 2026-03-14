/**
 * generator-service.ts
 *
 * GeneratorService is a registry of named code generators attached to each
 * ModuleRegistry instance (via `registry.generators`).
 *
 * Generators are registered by modules during their `onRegister` hook and are
 * invoked by the `foundation generate` CLI command.
 *
 * Design mirrors ORMService: thin registry, provider-pattern, zero I/O.
 */

import type { FileEntry } from "@systemlabs/foundation-plugin-sdk";
import type { ORMService, ORMModelDefinition, ORMFieldDefinition } from "../orm/orm-service.js";
import type { ProjectSelections } from "../state/project-state.js";
import { FoundationError } from "../errors.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class GeneratorNotFoundError extends FoundationError {
  constructor(public readonly generatorId: string) {
    super(
      `Generator "${generatorId}" is not registered. ` +
        `Available generators are registered by ORM and backend modules.`,
      "ERR_GENERATOR_NOT_FOUND",
    );
    this.name = "GeneratorNotFoundError";
  }
}

export class DuplicateGeneratorError extends FoundationError {
  constructor(public readonly generatorId: string) {
    super(
      `Generator "${generatorId}" is already registered.`,
      "ERR_GENERATOR_DUPLICATE",
    );
    this.name = "DuplicateGeneratorError";
  }
}

// ── Context & result types ────────────────────────────────────────────────────

/**
 * Context passed to every generator's `generate()` function.
 * Contains everything a generator needs to produce files.
 */
export interface GeneratorContext {
  /** The model/resource name as provided by the user, e.g. "Post", "User". */
  readonly modelName: string;
  /** Portable field definitions for this model. */
  readonly fields: ReadonlyArray<ORMFieldDefinition>;
  /** Absolute path to the project root. */
  readonly projectRoot: string;
  /** Active ORM service — generators can call orm.registerModel() and orm.buildSchemaFiles(). */
  readonly orm: ORMService;
  /** The project's stored selections (backend, database, etc.) from foundation.config.json. */
  readonly selections: ProjectSelections;
}

/**
 * What a generator returns after running.
 */
export interface GeneratorResult {
  /** Files to write into the project (paths relative to projectRoot). */
  readonly files: ReadonlyArray<FileEntry>;
  /**
   * ORM model definition to register with the active provider.
   * When present the generator command will call registry.orm.registerModel().
   */
  readonly model?: Omit<ORMModelDefinition, "sourceModuleId">;
  /**
   * Human-readable messages to print after the files are written.
   * E.g. "Run `npx prisma migrate dev` to apply your new migration."
   */
  readonly postGenerateMessages?: ReadonlyArray<string>;
}

// ── Generator definition ──────────────────────────────────────────────────────

/**
 * Contract every generator must satisfy.
 *
 * Generators are registered in a module's `onRegister` hook:
 *
 * ```ts
 * async onRegister(ctx) {
 *   const registry = extractRegistry(ctx);
 *   registry?.generators.register({
 *     id: "crud",
 *     name: "CRUD Generator",
 *     description: "Generates model, service, controller, and routes",
 *     generate: async (genCtx) => { ... }
 *   });
 * }
 * ```
 */
export interface GeneratorDefinition {
  /**
   * Unique generator ID, scoped by convention to avoid collisions.
   * Built-in generators use short names: "model", "crud".
   */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Short description shown in `foundation generate --list`. */
  readonly description: string;
  /**
   * The generator function. Receives a GeneratorContext and returns
   * the files to write and optional ORM model definition.
   */
  readonly generate: (ctx: GeneratorContext) => Promise<GeneratorResult>;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Registry of code generators. One instance per ModuleRegistry.
 *
 * Lifecycle:
 *  1. Created by ModuleRegistry constructor (exposed as `registry.generators`).
 *  2. Modules call `registry.generators.register(def)` in `onRegister`.
 *  3. `foundation generate <id> <ModelName>` resolves the generator and calls `invoke()`.
 */
export class GeneratorService {
  readonly #generators: Map<string, GeneratorDefinition> = new Map();

  /**
   * Registers a generator. Throws if the ID is already taken.
   */
  register(def: GeneratorDefinition): void {
    if (this.#generators.has(def.id)) {
      throw new DuplicateGeneratorError(def.id);
    }
    this.#generators.set(def.id, def);
  }

  /**
   * Returns the generator with the given ID, or throws GeneratorNotFoundError.
   */
  get(id: string): GeneratorDefinition {
    const def = this.#generators.get(id);
    if (def === undefined) throw new GeneratorNotFoundError(id);
    return def;
  }

  /**
   * Returns true when a generator with the given ID is registered.
   */
  has(id: string): boolean {
    return this.#generators.has(id);
  }

  /**
   * Returns all registered generators in registration order.
   */
  list(): ReadonlyArray<GeneratorDefinition> {
    return Array.from(this.#generators.values());
  }

  /**
   * Convenience: resolve and invoke a generator in one call.
   */
  async invoke(id: string, ctx: GeneratorContext): Promise<GeneratorResult> {
    return this.get(id).generate(ctx);
  }
}