/**
 * orm-service.ts
 *
 * ORMService is a shared infrastructure service owned by each ModuleRegistry
 * instance.  It has four responsibilities:
 *
 *  1. Provider registration — ORM modules call `registerProvider()` during
 *     their `onRegister` hook.
 *
 *  2. Model registration — Feature modules call `registerModel()` to declare
 *     entities that the active ORM should include in its generated schema.
 *
 *  3. Schema file generation — `buildSchemaFiles()` is called by the
 *     composition planner and returns additional FileEntry objects.
 *
 *  4. Seed registration — Modules call `registerSeed()` to declare seed
 *     functions. `foundation db seed` invokes them via `runSeeds()`.
 */

import type { FileEntry } from "@systemlabs/foundation-plugin-sdk";
import { FoundationError } from "../errors.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class ORMProviderAlreadyRegisteredError extends FoundationError {
  constructor(existingId: string, incomingId: string) {
    super(
      `ORM provider "${existingId}" is already registered; cannot register "${incomingId}". ` +
        `Only one ORM provider may be active at a time.`,
      "ERR_ORM_PROVIDER_ALREADY_REGISTERED",
    );
    this.name = "ORMProviderAlreadyRegisteredError";
  }
}

export class ORMModelAlreadyRegisteredError extends FoundationError {
  constructor(modelId: string) {
    super(`ORM model "${modelId}" is already registered.`, "ERR_ORM_MODEL_ALREADY_REGISTERED");
    this.name = "ORMModelAlreadyRegisteredError";
  }
}

export class ORMProviderNotFoundError extends FoundationError {
  constructor() {
    super(
      "No ORM provider is registered. Install an ORM module (prisma, typeorm, mongoose, sqlalchemy).",
      "ERR_ORM_PROVIDER_NOT_FOUND",
    );
    this.name = "ORMProviderNotFoundError";
  }
}

export class DuplicateSeedError extends FoundationError {
  constructor(public readonly seedId: string) {
    super(`Seed "${seedId}" is already registered.`, "ERR_SEED_DUPLICATE");
    this.name = "DuplicateSeedError";
  }
}

export type ORMFieldType = "string" | "number" | "boolean" | "date" | "uuid" | "json";

// ── Relation definition ───────────────────────────────────────────────────────

export type ORMRelationType =
  | "many-to-one"
  | "one-to-many"
  | "one-to-one"
  | "many-to-many";

/**
 * Portable, ORM-agnostic relation descriptor.
 * Each provider maps this to its own association syntax:
 *   Prisma     → relation blocks
 *   TypeORM    → @ManyToOne / @OneToMany decorators
 *   Mongoose   → Schema ref + populate
 *   SQLAlchemy → relationship()
 */
export interface ORMRelationDefinition {
  /** Property / field name on the owning model, e.g. "author". */
  readonly name: string;
  readonly type: ORMRelationType;
  /** The target model name, e.g. "User". */
  readonly target: string;
  /** Foreign key column name (optional — providers may infer it). */
  readonly foreignKey?: string;
  /** Whether deleting the parent cascades to children. */
  readonly cascade?: boolean;
}

// ── Model definition ──────────────────────────────────────────────────────────

export interface ORMFieldDefinition {
  /** Column / property name. */
  readonly name: string;
  /** Portable type — providers map this to ORM-specific syntax. */
  readonly type: ORMFieldType;
  readonly required?: boolean;
  readonly unique?: boolean;
  readonly primaryKey?: boolean;
  /** Whether the ORM should auto-generate a value on create. */
  readonly generated?: boolean;
}

export interface ORMModelDefinition {
  /**
   * Stable registration key.  Recommended: `{moduleId}.{ModelName}`,
   * e.g. "auth-jwt.Session".
   */
  readonly id: string;
  /** Class / collection / table name. */
  readonly name: string;
  readonly fields: ReadonlyArray<ORMFieldDefinition>;
  /** Optional relations to other registered models. */
  readonly relations?: ReadonlyArray<ORMRelationDefinition>;
  /** Injected automatically by registerModel(). */
  readonly sourceModuleId: string;
}

// ── Provider interface ────────────────────────────────────────────────────────

/**
 * Contract that every ORM module's provider must satisfy.
 */
export interface ORMProvider {
  /** Matches the ORM module's manifest.id, e.g. "orm-prisma". */
  readonly id: string;
  readonly name: string;
  buildSchemaFiles(models: ReadonlyArray<ORMModelDefinition>): ReadonlyArray<FileEntry>;
}

// ── Seeder types ──────────────────────────────────────────────────────────────

/**
 * Thin abstraction over the ORM client passed to seed functions.
 * Each ORM provider supplies a concrete implementation when runSeeds() is called.
 *
 * Providers are not required to implement every method — they should throw
 * a descriptive error for unsupported operations.
 */
export interface SeedContext {
  /**
   * Create a single record in the named model's table / collection.
   * The `data` shape must match the model's field definitions.
   */
  create(modelName: string, data: Record<string, unknown>): Promise<void>;
  /**
   * Create multiple records in a single operation.
   */
  createMany(modelName: string, data: ReadonlyArray<Record<string, unknown>>): Promise<void>;
}

export interface SeedDefinition {
  /** Unique seed ID, e.g. "auth.adminUser". Follows same convention as model IDs. */
  readonly id: string;
  /** The module that registered this seed. Injected by registerSeed(). */
  readonly sourceModuleId: string;
  /** The async seed function. Receives a SeedContext backed by the active ORM. */
  readonly run: (ctx: SeedContext) => Promise<void>;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ORMService {
  #provider: ORMProvider | null = null;
  readonly #models: Map<string, ORMModelDefinition> = new Map();
  readonly #seeds:  Map<string, SeedDefinition>     = new Map();

  // ── Provider API ────────────────────────────────────────────────────────────

  registerProvider(provider: ORMProvider): void {
    if (this.#provider !== null) {
      if (this.#provider.id === provider.id) return;
      throw new ORMProviderAlreadyRegisteredError(this.#provider.id, provider.id);
    }
    this.#provider = provider;
  }

  getProvider(): ORMProvider | null { return this.#provider; }

  requireProvider(): ORMProvider {
    if (this.#provider === null) throw new ORMProviderNotFoundError();
    return this.#provider;
  }

  hasProvider(): boolean { return this.#provider !== null; }

  // ── Model API ───────────────────────────────────────────────────────────────

  registerModel(
    model: Omit<ORMModelDefinition, "sourceModuleId">,
    sourceModuleId: string,
  ): void {
    const existing = this.#models.get(model.id);
    if (existing !== undefined) {
      if (existing.sourceModuleId === sourceModuleId && existing.name === model.name) return;
      throw new ORMModelAlreadyRegisteredError(model.id);
    }
    this.#models.set(model.id, { ...model, sourceModuleId });
  }

  getModels(): ReadonlyArray<ORMModelDefinition> {
    return Array.from(this.#models.values());
  }

  hasModels(): boolean { return this.#models.size > 0; }

  // ── Schema generation ───────────────────────────────────────────────────────

  buildSchemaFiles(): ReadonlyArray<FileEntry> {
    if (this.#provider === null || this.#models.size === 0) return [];
    return this.#provider.buildSchemaFiles(this.getModels());
  }

  // ── Seeder API ──────────────────────────────────────────────────────────────

  /**
   * Register a seed function. Idempotent for the same id + sourceModuleId.
   * Throws DuplicateSeedError if the same id is registered from a different module.
   */
  registerSeed(
    seed: Omit<SeedDefinition, "sourceModuleId">,
    sourceModuleId: string,
  ): void {
    const existing = this.#seeds.get(seed.id);
    if (existing !== undefined) {
      if (existing.sourceModuleId === sourceModuleId) return; // idempotent
      throw new DuplicateSeedError(seed.id);
    }
    this.#seeds.set(seed.id, { ...seed, sourceModuleId });
  }

  getSeeds(): ReadonlyArray<SeedDefinition> {
    return Array.from(this.#seeds.values());
  }

  hasSeeds(): boolean { return this.#seeds.size > 0; }

  /**
   * Runs all registered seeds in registration order using the given SeedContext.
   * The context is supplied by the active ORM provider (or the CLI command).
   */
  async runSeeds(ctx: SeedContext): Promise<void> {
    for (const seed of this.#seeds.values()) {
      await seed.run(ctx);
    }
  }
}