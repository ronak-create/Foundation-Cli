import type { JSONSchemaType } from "ajv";
import type { ModuleManifest } from "./types.js";

export const MODULE_MANIFEST_SCHEMA: JSONSchemaType<ModuleManifest> = {
  type: "object",
  properties: {
    id: {
      type: "string",
      minLength: 1,
      /**
       * kebab-case: starts and ends with alphanumeric, inner chars may be
       * alphanumeric or hyphens.  Single-segment ("tooling") also allowed.
       */
      pattern: "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
    },
    name: {
      type: "string",
      minLength: 1,
    },
    version: {
      type: "string",
      /**
       * Strict semver: MAJOR.MINOR.PATCH with optional pre-release.
       * e.g.  1.0.0   2.3.4-beta.1   0.0.1-rc.2
       */
      pattern:
        "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
        "(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)" +
        "(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$",
    },
    description: {
      type: "string",
      minLength: 1,
    },
    category: {
      type: "string",
      enum: [
        "frontend",
        "backend",
        "database",
        "auth",
        "ui",
        "deployment",
        "testing",
        "tooling",
      ],
    },
    runtime: {
      type: "string",
      enum: ["node", "python", "multi"],
      nullable: true,
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            // npm package name: allows scoped (@scope/name) and plain names
            pattern: "^(@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$",
          },
          version: {
            type: "string",
            minLength: 1,
          },
          scope: {
            type: "string",
            enum: ["dependencies", "devDependencies", "peerDependencies"],
          },
          runtime: {
            type: "string",
            enum: ["node", "python", "multi"],
            nullable: true,
          },
        },
        required: ["name", "version", "scope"],
        additionalProperties: false,
      },
    },
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          relativePath: {
            type: "string",
            minLength: 1,
          },
          content: {
            type: "string",
          },
          overwrite: {
            type: "boolean",
            nullable: true,
          },
        },
        required: ["relativePath", "content"],
        additionalProperties: false,
      },
    },
    configPatches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          targetFile: {
            type: "string",
            minLength: 1,
          },
          merge: {
            type: "object",
          },
        },
        required: ["targetFile", "merge"],
        additionalProperties: false,
      },
    },
    compatibility: {
      type: "object",
      properties: {
        requires: {
          type: "array",
          items: { type: "string" },
          nullable: true,
        },
        conflicts: {
          type: "array",
          items: { type: "string" },
          nullable: true,
        },
        compatibleWith: {
          type: "array",
          items: { type: "string" },
          nullable: true,
        },
      },
      required: [],
      additionalProperties: false,
    },
    tags: {
      type: "array",
      items: { type: "string" },
      nullable: true,
    },
  },
  required: [
    "id",
    "name",
    "version",
    "description",
    "category",
    "dependencies",
    "files",
    "configPatches",
    "compatibility",
  ],
  additionalProperties: false,
};