// cli/src/commands/generate.ts
//
// Phase 4 — Features 1 & 2
//
// `foundation generate model <ModelName>`
//   Prompts for field definitions interactively, registers the model with the
//   active ORM provider, and writes the provider-generated schema file(s).
//
// `foundation generate crud <ModelName>`
//   Everything in "model" plus a service, controller, and routes layer.
//   Templates are chosen based on the active backend (express, nestjs, fastapi,
//   django) read from foundation.config.json.
//
// `foundation generate --list`
//   Lists all generators registered by installed modules.
//
// Usage:
//   foundation generate model Post
//   foundation generate crud Post
//   foundation generate --list

// import fs    from "node:fs/promises";
// import path  from "node:path";
import chalk from "chalk";
import ora from "ora";
import { input, select, confirm } from "@inquirer/prompts";
import {
  ModuleRegistry,
  FileTransaction,
  isFoundationProject,
  readProjectState,
  registerInstalledPlugins,
  resolveModules,
  buildCompositionPlan,
  runHooksForPlan,
  type ORMService,
  type ORMFieldDefinition,
  type ORMFieldType,
  renderTemplate,
} from "@systemlabs/foundation-core";
import { loadBuiltinModules } from "@systemlabs/foundation-modules";
import { printError, printSection } from "../ui/renderer.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runGenerateCommand(args: ReadonlyArray<string>): Promise<void> {
  const [subcommand, modelNameArg] = args;

  // foundation generate --list
  if (subcommand === "--list" || subcommand === "-l") {
    await runListGenerators();
    return;
  }

  if (!subcommand) {
    printGenerateUsage();
    process.exit(0);
  }

  if (subcommand !== "model" && subcommand !== "crud") {
    printError(`Unknown generator: "${subcommand}". Use "model" or "crud".`);
    printGenerateUsage();
    process.exit(1);
  }

  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError("`foundation generate` must be run inside a Foundation project directory.");
    process.exit(1);
  }

  // Prompt for model name if not supplied
  let modelName = modelNameArg ?? "";
  if (!modelName) {
    modelName = await input({
      message: "Model name (e.g. Post, User, Invoice):",
      validate: (v) =>
        /^[A-Z][A-Za-z0-9]*$/.test(v.trim())
          ? true
          : "Model name must start with an uppercase letter (PascalCase).",
    });
  }
  modelName = modelName.trim();

  if (!/^[A-Z][A-Za-z0-9]*$/.test(modelName)) {
    printError("Model name must be PascalCase (e.g. Post, BlogPost, InvoiceItem).");
    process.exit(1);
  }

  // Build registry and load project state
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  // Fire onRegister hooks so ORM providers register themselves with registry.orm.
  // Without this, registry.orm.buildSchemaFiles() always returns [] because
  // no provider has called registerProvider() yet.
  const { lockfile, config } = await readProjectState(cwd);
  const installedIds = (lockfile?.modules ?? [])
    .map(m => m.id)
    .filter(id => registry.hasModule(id));
  if (installedIds.length > 0) {
    const resolution = resolveModules(installedIds, registry);
    const plan       = buildCompositionPlan(resolution.ordered);
    await runHooksForPlan("onRegister", plan, registry, {
      projectRoot:     cwd,
      config:          { __registry: registry },
      selectedModules: installedIds,
    }, { strict: false });
  }

  const selections = config?.selections ?? {};

  // Prompt for fields interactively
  printSection(`Define fields for ${modelName}`);
  process.stdout.write(
    chalk.dim("  Add fields one by one. Press Enter with an empty name to finish.\n\n"),
  );

  const fields = await promptForFields();

  if (subcommand === "model") {
    await runModelGenerator(cwd, modelName, fields, registry);
  } else {
    await runCrudGenerator(cwd, modelName, fields, registry, selections);
  }
}

// ── foundation generate --list ────────────────────────────────────────────────

async function runListGenerators(): Promise<void> {
  const cwd = process.cwd();
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);

  if (await isFoundationProject(cwd)) {
    await registerInstalledPlugins(cwd, registry);
  }

  const generators = registry.generators.list();

  // Always include built-in generators
  const builtins = [
    { id: "model", name: "Model Generator", description: "Generate ORM model + schema files" },
    {
      id: "crud",
      name: "CRUD Generator",
      description: "Generate model, service, controller, and routes",
    },
  ];

  printSection("Available Generators");

  for (const g of builtins) {
    process.stdout.write(
      `  ${chalk.cyan(g.id.padEnd(12))} ${chalk.white(g.name.padEnd(24))} ${chalk.dim(g.description)}\n`,
    );
  }

  for (const g of generators) {
    process.stdout.write(
      `  ${chalk.magenta(g.id.padEnd(12))} ${chalk.white(g.name.padEnd(24))} ${chalk.dim(g.description)}\n`,
    );
  }

  process.stdout.write("\n");
  process.stdout.write(
    chalk.dim(`  Usage: ${chalk.white("foundation generate <id> <ModelName>")}\n\n`),
  );
}

// ── Feature 2: Model Generator ────────────────────────────────────────────────

async function runModelGenerator(
  cwd: string,
  modelName: string,
  fields: ORMFieldDefinition[],
  registry: ModuleRegistry,
//   selections: Record<string, string>,
): Promise<void> {
  const spinner = ora({ text: chalk.dim("Registering model…"), color: "cyan" }).start();

  try {
    // Register the model with the ORM service
    const modelId = `cli.${modelName}`;
    registry.orm.registerModel({ id: modelId, name: modelName, fields }, "foundation-cli");

    // Generate schema files via the active ORM provider
    const schemaFiles = registry.orm.buildSchemaFiles();

    if (schemaFiles.length === 0) {
      spinner.warn(
        chalk.yellow(
          "No ORM provider is active — model registered in memory only.\n" +
            "    Install an ORM module (foundation add orm-prisma) to generate schema files.",
        ),
      );
    } else {
      spinner.text = chalk.dim(`Writing ${schemaFiles.length} schema file(s)…`);

      const txn = new FileTransaction({ projectRoot: cwd });
      await txn.open();
      for (const file of schemaFiles) {
        await txn.stage(file.relativePath, file.content);
      }
      await txn.commit();

      spinner.succeed(chalk.green(`Model "${modelName}" generated successfully.`));

      printSection("Generated Files");
      for (const file of schemaFiles) {
        process.stdout.write(`  ${chalk.dim("•")} ${chalk.green(file.relativePath)}\n`);
      }
      process.stdout.write("\n");

      printPostModelMessages(registry.orm);
    }
  } catch (err) {
    spinner.fail(chalk.red("Model generation failed."));
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ── Feature 1: CRUD Generator ─────────────────────────────────────────────────

async function runCrudGenerator(
  cwd: string,
  modelName: string,
  fields: ORMFieldDefinition[],
  registry: ModuleRegistry,
  selections: Record<string, string>,
): Promise<void> {
  const spinner = ora({ text: chalk.dim("Generating CRUD scaffold…"), color: "cyan" }).start();

  try {
    // 1. Register model + generate schema files (same as model generator)
    const modelId = `cli.${modelName}`;
    registry.orm.registerModel({ id: modelId, name: modelName, fields }, "foundation-cli");
    const schemaFiles = registry.orm.buildSchemaFiles();

    // 2. Detect active backend
    const backend = detectBackend(selections);

    // 3. Generate CRUD layer files
    const crudFiles = generateCrudFiles(modelName, fields, backend);

    const allFiles = [...schemaFiles, ...crudFiles];
    spinner.text = chalk.dim(`Writing ${allFiles.length} file(s)…`);

    const txn = new FileTransaction({ projectRoot: cwd });
    await txn.open();
    for (const file of allFiles) {
      await txn.stage(file.relativePath, file.content);
    }
    await txn.commit();

    spinner.succeed(chalk.green(`CRUD scaffold for "${modelName}" generated successfully.`));

    printSection("Generated Files");

    if (schemaFiles.length > 0) {
      process.stdout.write(`  ${chalk.dim("Schema:")}\n`);
      for (const f of schemaFiles) {
        process.stdout.write(`    ${chalk.dim("•")} ${chalk.green(f.relativePath)}\n`);
      }
    }

    process.stdout.write(`  ${chalk.dim("CRUD:")}\n`);
    for (const f of crudFiles) {
      process.stdout.write(`    ${chalk.dim("•")} ${chalk.cyan(f.relativePath)}\n`);
    }

    process.stdout.write("\n");
    printPostCrudMessages(modelName, backend, registry.orm);
  } catch (err) {
    spinner.fail(chalk.red("CRUD generation failed."));
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ── Interactive field prompts ─────────────────────────────────────────────────

async function promptForFields(): Promise<ORMFieldDefinition[]> {
  const fields: ORMFieldDefinition[] = [];

  // Always add a default primary key first
  fields.push({ name: "id", type: "uuid", primaryKey: true, generated: true, required: true });
  process.stdout.write(
    `  ${chalk.dim("ℹ")}  ${chalk.dim(`"id" (uuid, primaryKey) added automatically`)}\n\n`,
  );

  const FIELD_TYPES: Array<{ name: string; value: ORMFieldType }> = [
    { name: "string  — text / varchar", value: "string" },
    { name: "number  — integer / float", value: "number" },
    { name: "boolean — true / false", value: "boolean" },
    { name: "date    — timestamp", value: "date" },
    { name: "uuid    — UUID / cuid", value: "uuid" },
    { name: "json    — unstructured JSON", value: "json" },
  ];

  let collecting = true;
  while (collecting) {
    const fieldName = await input({ message: "Field name (empty to finish):" });
    if (!fieldName.trim()) {
      collecting = false;
      continue;
    }
    const name = fieldName.trim();

    if (!/^[a-z][a-zA-Z0-9_]*$/.test(name)) {
      process.stdout.write(
        chalk.yellow("  ⚠  Field name must start with a lowercase letter. Try again.\n"),
      );
      continue;
    }

    if (fields.some((f) => f.name === name)) {
      process.stdout.write(chalk.yellow(`  ⚠  Field "${name}" already exists. Try again.\n`));
      continue;
    }

    const type = await select<ORMFieldType>({
      message: `Type for "${name}":`,
      choices: FIELD_TYPES,
    });

    const required = await confirm({
      message: `Is "${name}" required (non-nullable)?`,
      default: true,
    });

    const unique = await confirm({
      message: `Is "${name}" unique?`,
      default: false,
    });

    fields.push({ name, type, required, unique });
    process.stdout.write(
      `  ${chalk.green("✔")}  Added: ${chalk.white(name)} (${chalk.cyan(type)}` +
        `${required ? "" : ", optional"}${unique ? ", unique" : ""})\n`,
    );
  }

  // Always add createdAt / updatedAt timestamps
  fields.push({ name: "createdAt", type: "date", required: true, generated: true });
  fields.push({ name: "updatedAt", type: "date", required: true, generated: true });
  process.stdout.write(
    `  ${chalk.dim("ℹ")}  ${chalk.dim('"createdAt" and "updatedAt" (date, generated) added automatically')}\n`,
  );

  return fields;
}

// ── CRUD file generation ──────────────────────────────────────────────────────

type Backend = "express" | "nestjs" | "fastapi" | "django" | "generic";

function detectBackend(selections: Record<string, string>): Backend {
  const b = selections["backend"] ?? "";
  if (b.includes("express")) return "express";
  if (b.includes("nestjs")) return "nestjs";
  if (b.includes("fastapi")) return "fastapi";
  if (b.includes("django")) return "django";
  return "generic";
}

function generateCrudFiles(
  modelName: string,
  fields: ORMFieldDefinition[],
  backend: Backend,
): Array<{ relativePath: string; content: string; overwrite: boolean }> {
  const lower = modelName.toLowerCase();
  const vars = { modelName, lower, fields };

  if (backend === "fastapi" || backend === "django") {
    return generatePythonCrud(modelName, lower, fields);
  }

  return [
    {
      relativePath: `src/services/${lower}.service.ts`,
      content: renderTemplate(SERVICE_TEMPLATE_TS, vars),
      overwrite: false,
    },
    {
      relativePath: `src/controllers/${lower}.controller.ts`,
      content: renderTemplate(
        backend === "nestjs" ? CONTROLLER_TEMPLATE_NESTJS : CONTROLLER_TEMPLATE_EXPRESS,
        vars,
      ),
      overwrite: false,
    },
    {
      relativePath: `src/routes/${lower}.routes.ts`,
      content: renderTemplate(
        backend === "nestjs" ? ROUTES_TEMPLATE_NESTJS : ROUTES_TEMPLATE_EXPRESS,
        vars,
      ),
      overwrite: false,
    },
  ];
}

function generatePythonCrud(
  modelName: string,
  lower: string,
  fields: ORMFieldDefinition[],
): Array<{ relativePath: string; content: string; overwrite: boolean }> {
  const vars = { modelName, lower, fields };
  return [
    {
      relativePath: `src/routers/${lower}.py`,
      content: renderTemplate(ROUTER_TEMPLATE_FASTAPI, vars),
      overwrite: false,
    },
    {
      relativePath: `src/schemas/${lower}.py`,
      content: renderTemplate(SCHEMA_TEMPLATE_PYDANTIC, vars),
      overwrite: false,
    },
  ];
}

// ── Post-generate messages ────────────────────────────────────────────────────

function printPostModelMessages(orm: ORMService): void {
  const provider = orm.getProvider();

  if (!provider) return;

  const messages: string[] = [];
  if (provider.id === "orm-prisma") {
    messages.push("Run `npx prisma migrate dev --name add_model` to create a migration.");
    messages.push("Run `npx prisma generate` to regenerate the Prisma client.");
  } else if (provider.id === "orm-typeorm") {
    messages.push("Run `npm run migration:run` to apply the new entity.");
  } else if (provider.id === "orm-sqlalchemy") {
    messages.push(
      'Run `alembic revision --autogenerate -m "add model"` then `alembic upgrade head`.',
    );
  } else if (provider.id === "orm-mongoose") {
    messages.push("The Mongoose model is ready to import. No migration needed.");
  }

  if (messages.length === 0) return;

  process.stdout.write(`  ${chalk.bold("Next steps:")}\n`);
  for (const m of messages) {
    process.stdout.write(`  ${chalk.dim("→")} ${chalk.dim(m)}\n`);
  }
  process.stdout.write("\n");
}

function printPostCrudMessages(modelName: string, backend: Backend, orm: ORMService): void {
  const lower = modelName.toLowerCase();
  printPostModelMessages(orm);

  process.stdout.write(`  ${chalk.bold("Wire up routes:")}\n`);
  if (backend === "express" || backend === "generic") {
    process.stdout.write(
      `  ${chalk.dim("→")} ${chalk.dim(`In src/index.ts: import { ${lower}Router } from "./routes/${lower}.routes.js"`)}\n`,
    );
    process.stdout.write(
      `  ${chalk.dim("→")} ${chalk.dim(`app.use("/${lower}s", ${lower}Router);`)}\n`,
    );
  } else if (backend === "nestjs") {
    process.stdout.write(
      `  ${chalk.dim("→")} ${chalk.dim(`Add ${modelName}Controller to your module's controllers array.`)}\n`,
    );
  } else if (backend === "fastapi") {
    process.stdout.write(
      `  ${chalk.dim("→")} ${chalk.dim(`In main.py: app.include_router(${lower}_router, prefix="/${lower}s")`)}\n`,
    );
  }
  process.stdout.write("\n");
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printGenerateUsage(): void {
  process.stdout.write(
    `\n  ${chalk.bold("Usage:")} ${chalk.cyan("foundation generate")} ${chalk.dim("<subcommand> [ModelName]")}\n\n` +
      `  ${chalk.bold("Subcommands:")}\n` +
      `    ${chalk.cyan("model")} ${chalk.dim("<Name>")}   Generate ORM model + schema files\n` +
      `    ${chalk.cyan("crud")}  ${chalk.dim("<Name>")}   Generate model + service + controller + routes\n` +
      `    ${chalk.cyan("--list")}         List all available generators\n\n` +
      `  ${chalk.bold("Examples:")}\n` +
      `    ${chalk.dim("foundation generate model Post")}\n` +
      `    ${chalk.dim("foundation generate crud BlogPost")}\n` +
      `    ${chalk.dim("foundation generate --list")}\n\n`,
  );
}

// ── EJS Templates — TypeScript / Express ─────────────────────────────────────

const SERVICE_TEMPLATE_TS = `// <%= modelName %> service
// Generated by foundation-cli

export interface <%= modelName %>CreateInput {
<% for (const f of fields.filter(f => !f.primaryKey && !f.generated)) { %>  <%= f.name %>: <%= tsType(f.type) %><% if (!f.required) { %> | null<% } %>;
<% } %>}

export interface <%= modelName %>UpdateInput extends Partial<<%= modelName %>CreateInput> {}

// TODO: replace with your ORM client import
// import { db } from "../lib/db.js";

export const <%= lower %>Service = {
  async findAll() {
    // return db.<%= lower %>.findMany();
    throw new Error("Not implemented — wire up your ORM client.");
  },

  async findById(id: string) {
    // return db.<%= lower %>.findUnique({ where: { id } });
    throw new Error("Not implemented — wire up your ORM client.");
  },

  async create(data: <%= modelName %>CreateInput) {
    // return db.<%= lower %>.create({ data });
    throw new Error("Not implemented — wire up your ORM client.");
  },

  async update(id: string, data: <%= modelName %>UpdateInput) {
    // return db.<%= lower %>.update({ where: { id }, data });
    throw new Error("Not implemented — wire up your ORM client.");
  },

  async remove(id: string) {
    // return db.<%= lower %>.delete({ where: { id } });
    throw new Error("Not implemented — wire up your ORM client.");
  },
};

function tsType(t: string): string {
  const map: Record<string, string> = {
    string: "string", number: "number", boolean: "boolean",
    date: "Date", uuid: "string", json: "Record<string, unknown>",
  };
  return map[t] ?? "unknown";
}
`;

const CONTROLLER_TEMPLATE_EXPRESS = `// <%= modelName %> controller — Express
// Generated by foundation-cli

import type { Request, Response, NextFunction } from "express";
import { <%= lower %>Service } from "../services/<%= lower %>.service.js";

export const <%= lower %>Controller = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await <%= lower %>Service.findAll();
      res.json(items);
    } catch (err) { next(err); }
  },

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await <%= lower %>Service.findById(req.params.id!);
      if (!item) return res.status(404).json({ error: "<%= modelName %> not found" });
      res.json(item);
    } catch (err) { next(err); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await <%= lower %>Service.create(req.body);
      res.status(201).json(item);
    } catch (err) { next(err); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await <%= lower %>Service.update(req.params.id!, req.body);
      res.json(item);
    } catch (err) { next(err); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await <%= lower %>Service.remove(req.params.id!);
      res.status(204).send();
    } catch (err) { next(err); }
  },
};
`;

const ROUTES_TEMPLATE_EXPRESS = `// <%= modelName %> routes — Express
// Generated by foundation-cli

import { Router } from "express";
import { <%= lower %>Controller } from "../controllers/<%= lower %>.controller.js";

export const <%= lower %>Router = Router();

<%= lower %>Router.get("/",    <%= lower %>Controller.getAll);
<%= lower %>Router.get("/:id", <%= lower %>Controller.getOne);
<%= lower %>Router.post("/",   <%= lower %>Controller.create);
<%= lower %>Router.put("/:id", <%= lower %>Controller.update);
<%= lower %>Router.delete("/:id", <%= lower %>Controller.remove);
`;

const CONTROLLER_TEMPLATE_NESTJS = `// <%= modelName %> controller — NestJS
// Generated by foundation-cli

import { Controller, Get, Post, Put, Delete, Body, Param } from "@nestjs/common";
import { <%= modelName %>Service } from "./<%= lower %>.service";

@Controller("<%= lower %>s")
export class <%= modelName %>Controller {
  constructor(private readonly <%= lower %>Service: <%= modelName %>Service) {}

  @Get()
  findAll() { return this.<%= lower %>Service.findAll(); }

  @Get(":id")
  findOne(@Param("id") id: string) { return this.<%= lower %>Service.findById(id); }

  @Post()
  create(@Body() body: unknown) { return this.<%= lower %>Service.create(body as never); }

  @Put(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.<%= lower %>Service.update(id, body as never);
  }

  @Delete(":id")
  remove(@Param("id") id: string) { return this.<%= lower %>Service.remove(id); }
}
`;

const ROUTES_TEMPLATE_NESTJS = `// <%= modelName %> NestJS module
// Generated by foundation-cli

import { Module } from "@nestjs/common";
import { <%= modelName %>Controller } from "./<%= lower %>.controller";
import { <%= modelName %>Service } from "./<%= lower %>.service";

@Module({
  controllers: [<%= modelName %>Controller],
  providers:   [<%= modelName %>Service],
  exports:     [<%= modelName %>Service],
})
export class <%= modelName %>Module {}
`;

// ── EJS Templates — Python / FastAPI ─────────────────────────────────────────

const ROUTER_TEMPLATE_FASTAPI = `# <%= modelName %> router — FastAPI
# Generated by foundation-cli

from fastapi import APIRouter, HTTPException
from .schemas.<%= lower %> import <%= modelName %>Create, <%= modelName %>Update, <%= modelName %>Response

<%= lower %>_router = APIRouter(tags=["<%= modelName %>"])


@<%= lower %>_router.get("/", response_model=list[<%= modelName %>Response])
async def list_<%= lower %>s():
    # TODO: wire up your SQLAlchemy / database session
    raise NotImplementedError


@<%= lower %>_router.get("/{id}", response_model=<%= modelName %>Response)
async def get_<%= lower %>(id: str):
    raise NotImplementedError


@<%= lower %>_router.post("/", response_model=<%= modelName %>Response, status_code=201)
async def create_<%= lower %>(data: <%= modelName %>Create):
    raise NotImplementedError


@<%= lower %>_router.put("/{id}", response_model=<%= modelName %>Response)
async def update_<%= lower %>(id: str, data: <%= modelName %>Update):
    raise NotImplementedError


@<%= lower %>_router.delete("/{id}", status_code=204)
async def delete_<%= lower %>(id: str):
    raise NotImplementedError
`;

const SCHEMA_TEMPLATE_PYDANTIC = `# <%= modelName %> Pydantic schemas — FastAPI
# Generated by foundation-cli

from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid


class <%= modelName %>Base(BaseModel):
<% for (const f of fields.filter(f => !f.primaryKey && !f.generated)) { %>    <%= f.name %>: <%= pyType(f.type) %><% if (!f.required) { %> | None = None<% } %>
<% } %>

class <%= modelName %>Create(<%= modelName %>Base):
    pass


class <%= modelName %>Update(<%= modelName %>Base):
<% for (const f of fields.filter(f => !f.primaryKey && !f.generated)) { %>    <%= f.name %>: Optional[<%= pyType(f.type) %>] = None
<% } %>

class <%= modelName %>Response(<%= modelName %>Base):
    id: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


def pyType(t: str) -> str:
    return {"string": "str", "number": "float", "boolean": "bool",
            "date": "datetime", "uuid": "str", "json": "dict"}.get(t, "str")
`;