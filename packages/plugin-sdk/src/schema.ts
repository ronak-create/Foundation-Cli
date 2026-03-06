// plugin-sdk/src/schema.ts
//
// AJV JSON Schema for ModuleManifest validation.
// Updated to cover all new fields from the architecture spec:
//   provides, optional, variables, postInstallInstructions, status,
//   peerFrameworks (inside compatibility), pluginApiVersion, author, verified.
//
// We use a plain Record schema (not JSONSchemaType<ModuleManifest>) because
// AJV's strict generic cannot fully represent optional nested Record<string,…>
// shapes without complex workarounds. Runtime validation remains complete.
//
// NOTE: AJV v8 uses JSON Schema Draft-2019-09 and does NOT support the
// OpenAPI `nullable: true` extension. Use `type: ["foo", "null"]` instead.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODULE_MANIFEST_SCHEMA: Record<string, any> = {
  type: "object",
  properties: {
    // ── Core identity ──────────────────────────────────────────────────────
    id: {
      type: "string",
      minLength: 1,
      // kebab-case: single-segment ("tooling") and multi-segment ("frontend-nextjs")
      pattern: "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
    },
    name:        { type: "string", minLength: 1 },
    version: {
      type: "string",
      // Strict semver: MAJOR.MINOR.PATCH with optional pre-release
      pattern:
        "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
        "(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)" +
        "(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$",
    },
    description: { type: "string", minLength: 1 },
    category: {
      type: "string",
      enum: [
        "frontend", "backend", "database", "orm", "auth", "state",
        "ui", "deployment", "testing", "tooling", "addon",
      ],
    },
    runtime: {
      type: ["string", "null"],
      enum: ["node", "python", "multi", null],
    },

    // ── New: lifecycle status ──────────────────────────────────────────────
    status: {
      type: ["string", "null"],
      enum: ["stable", "experimental", "deprecated", "removed", null],
    },

    // ── New: capability tokens ─────────────────────────────────────────────
    provides: {
      type: ["array", "null"],
      items: { type: "string", minLength: 1 },
    },
    optional: {
      type: ["array", "null"],
      items: { type: "string", minLength: 1 },
    },

    // ── New: template variables ────────────────────────────────────────────
    variables: {
      type: ["object", "null"],
      additionalProperties: {
        type: "object",
        properties: {
          type:        { type: "string", enum: ["string", "number", "boolean"] },
          default:     {},
          prompt:      { type: ["boolean", "null"] },
          description: { type: ["string", "null"] },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },

    // ── New: post-install instructions ────────────────────────────────────
    postInstallInstructions: { type: ["string", "null"] },

    // ── Dependencies ──────────────────────────────────────────────────────
    dependencies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            // npm package name: scoped (@scope/name) and plain names
            pattern: "^(@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$",
          },
          version: { type: "string", minLength: 1 },
          scope: {
            type: "string",
            enum: ["dependencies", "devDependencies", "peerDependencies"],
          },
          runtime: {
            type: ["string", "null"],
            enum: ["node", "python", "multi", null],
          },
        },
        required: ["name", "version", "scope"],
        additionalProperties: false,
      },
    },

    // ── Files (added optional `when` field) ───────────────────────────────
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          relativePath: { type: "string", minLength: 1 },
          content:      { type: "string" },
          overwrite:    { type: ["boolean", "null"] },
          when:         { type: ["string", "null"] },
        },
        required: ["relativePath", "content"],
        additionalProperties: false,
      },
    },

    // ── Config patches ────────────────────────────────────────────────────
    configPatches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          targetFile: { type: "string", minLength: 1 },
          merge:      { type: "object" },
        },
        required: ["targetFile", "merge"],
        additionalProperties: false,
      },
    },

    // ── Compatibility (added compatibleWith as object, peerFrameworks) ────
    compatibility: {
      type: "object",
      properties: {
        requires: {
          type: ["array", "null"],
          items: { type: "string" },
        },
        conflicts: {
          type: ["array", "null"],
          items: { type: "string" },
        },
        // Changed from array to object (category → string[])
        compatibleWith: {
          type: ["object", "null"],
          additionalProperties: {
            type: "array",
            items: { type: "string" },
          },
        },
        // New: peer framework semver ranges
        peerFrameworks: {
          type: ["object", "null"],
          additionalProperties: { type: "string" },
        },
      },
      required: [],
      additionalProperties: false,
    },

    // ── Plugin-only fields (optional at schema level; validated at install) ─
    pluginApiVersion: { type: ["string", "null"] },
    author:           { type: ["string", "null"] },
    verified:         { type: ["boolean", "null"] },

    // ── Tags ──────────────────────────────────────────────────────────────
    tags: {
      type: ["array", "null"],
      items: { type: "string" },
    },
  },
  required: [
    "id", "name", "version", "description", "category",
    "dependencies", "files", "configPatches", "compatibility",
  ],
  additionalProperties: false,
};