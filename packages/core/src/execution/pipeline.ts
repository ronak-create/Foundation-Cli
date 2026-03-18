// core/src/execution/pipeline.ts
//
// GAP FILLED:
//   1. onFinalize hooks called after full success (spec §3.2)
//   2. onRollback hooks called on any pipeline failure (spec §3.2)
//   3. CI mode detection: process.env.CI / process.env.NO_TTY (spec §12)
//   4. postInstallInstructions printed from each module manifest after success

import type { CompositionPlan } from "../types.js";
import {
  type ModuleRegistry,
  makeRegistryAccessor,
} from "../module-registry/registry.js";
import type { PluginHookContext } from "@systemlabs/foundation-plugin-sdk";
import { executeCompositionPlan } from "./project-writer.js";
import { applyAllPatches } from "./config-merger.js";
import {
  installDependencies,
  writeDepsToPackageJson,
  installPythonDependencies,
} from "./dependency-installer.js";
import { runHooksForPlan } from "./hook-runner.js";
import type { InstallProgress, PackageManager } from "./dependency-installer.js";
import type { WriteResult } from "./project-writer.js";
import { writeProjectState } from "../state/project-state.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecutionPipelineOptions {
  readonly targetDir: string;
  readonly registry: ModuleRegistry;
  readonly hookContext: Omit<PluginHookContext, "projectRoot">;
  readonly skipInstall?: boolean;
  readonly packageManager?: PackageManager;
  readonly onProgress?: (event: PipelineEvent) => void;
  readonly dryRun?: boolean;
  readonly stateOptions?: {
    readonly projectName: string;
    readonly selections: Readonly<Record<string, string>>;
  };
  /**
   * CI mode: skips interactive prompts; treats missing TTY as non-interactive.
   * Auto-detected from process.env.CI or process.env.NO_TTY when not supplied.
   */
  readonly ciMode?: boolean;
}

export type PipelineStage =
  | "before-write"
  | "write-files"
  | "apply-patches"
  | "before-install"
  | "install-deps"
  | "after-install"
  | "after-write"
  | "finalize"
  | "write-state"
  | "complete";

export interface PipelineEvent {
  readonly stage: PipelineStage;
  readonly message: string;
  readonly detail?: unknown;
}

export interface ExecutionPipelineResult {
  readonly writeResult: WriteResult;
  readonly patchesApplied: number;
  
  readonly installResult: {
    packageManager: string;
    installed: ReadonlyArray<string>;
    duration: number;
  } | null;
  readonly hooksExecuted: ReadonlyArray<{ moduleId: string; hook: string }>;
  readonly duration: number;
  readonly stateWritten: boolean;
  /** True when running in a CI / non-TTY environment. */
  readonly ciMode: boolean;
  /** Aggregated postInstallInstructions from all modules. */
  readonly postInstallInstructions: ReadonlyArray<{ moduleId: string; instructions: string }>;
}

// ── CI mode detection ─────────────────────────────────────────────────────────

/**
 * Returns true when running in a non-interactive environment (spec §12).
 * Checks (in order): explicit ciMode option, CI env var, NO_TTY env var,
 * lack of stdout TTY.
 */
export function detectCiMode(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  if (process.env["CI"] === "true" || process.env["CI"] === "1") return true;
  if (process.env["NO_TTY"] === "true" || process.env["NO_TTY"] === "1") return true;
  if (!process.stdout.isTTY) return true;
  return false;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Full execution pipeline:
 *
 *  1.  beforeWrite hooks
 *  2.  Write all files (atomic)
 *  3.  Apply config patches
 *  4.  beforeInstall hooks
 *  5.  Install dependencies
 *  6.  afterInstall hooks
 *  7.  afterWrite hooks
 *  8.  onFinalize hooks         ← NEW (spec §3.2)
 *  9.  Write project state
 *
 * On any failure:
 *  →   onRollback hooks         ← NEW (spec §3.2)
 *  →   re-throw original error
 */
export async function runExecutionPipeline(
  plan: CompositionPlan,
  options: ExecutionPipelineOptions,
): Promise<ExecutionPipelineResult> {
  const { targetDir, registry, skipInstall = false, dryRun = false, onProgress } = options;

  const ciMode = detectCiMode(options.ciMode);
  const start = Date.now();
  const hooksExecuted: Array<{ moduleId: string; hook: string }> = [];

  const baseCtx: PluginHookContext = {
    ...options.hookContext,
    projectRoot: targetDir,
    // Expose a narrowed RegistryAccessor so hooks can call
    // registry.orm.registerProvider() but cannot call registerModule()
    // or access full registry internals. config is Object.frozen so
    // builtin hooks cannot accidentally mutate it.
    config: Object.freeze({
      ...options.hookContext.config,
      __registry: makeRegistryAccessor(registry),
    }),
  };

  const hookOpts = {
    strict: true,
    onHookStart: (moduleId: string, hook: string) => {
      hooksExecuted.push({ moduleId, hook });
      onProgress?.({ stage: "before-write", message: `Hook ${hook} starting for ${moduleId}` });
    },
  };

  // Wrap entire pipeline in try/catch so onRollback fires on failure
  try {
    // ── 1. beforeWrite hooks ───────────────────────────────────────────────
    emit(onProgress, "before-write", "Running beforeWrite hooks…");
    await runHooksForPlan("beforeWrite", plan, registry, baseCtx, { ...hookOpts, strict: false });

    // ── 2. Write files ─────────────────────────────────────────────────────
    emit(onProgress, "write-files", `Writing ${plan.files.length} file(s)…`);
    const writeResult = await executeCompositionPlan(plan, targetDir);
    emit(onProgress, "write-files", `Wrote ${writeResult.filesWritten} file(s).`, writeResult);

    // ── 3. Apply config patches ────────────────────────────────────────────
    emit(onProgress, "apply-patches", `Applying ${plan.configPatches.length} config patch(es)…`);
    await applyAllPatches(targetDir, plan.configPatches);
    emit(onProgress, "apply-patches", `Applied ${plan.configPatches.length} config patch(es).`);

    // ── 4. beforeInstall hooks ─────────────────────────────────────────────
    emit(onProgress, "before-install", "Running beforeInstall hooks…");
    await runHooksForPlan("beforeInstall", plan, registry, baseCtx, { ...hookOpts, strict: false });

    // ── 5. Write deps + (optionally) install — split by runtime ───────────
    let installResult: ExecutionPipelineResult["installResult"] = null;

    // Partition deps: python runtime vs everything else (node / unspecified)
    const nodeDeps = plan.dependencies.filter((d) => (d.runtime ?? "node") !== "python");
    const pythonDeps = plan.dependencies.filter((d) => d.runtime === "python");

    if (nodeDeps.length > 0) {
      emit(onProgress, "install-deps", "Writing dependencies to package.json…");
      await writeDepsToPackageJson(targetDir, nodeDeps);
    }

    if (!skipInstall) {
      // Run Node and Python installs concurrently (spec §4.4)
      const installTasks: Promise<void>[] = [];

      if (nodeDeps.length > 0) {
        emit(onProgress, "install-deps", "Installing Node packages…");
        installTasks.push(
          installDependencies({
            targetDir,
            deps: nodeDeps,
            ...(options.packageManager !== undefined && { packageManager: options.packageManager }),
            dryRun,
            onProgress: (p: InstallProgress) => {
              onProgress?.({ stage: "install-deps", message: p.message, detail: p });
            },
          }).then((result) => {
            installResult = result;
            emit(
              onProgress,
              "install-deps",
              `Node packages installed via ${result.packageManager}.`,
              result,
            );
          }),
        );
      }

      if (pythonDeps.length > 0) {
        emit(onProgress, "install-deps", "Installing Python packages…");
        // Convert PackageDependency[] to pip requirement strings
        const pipSpecs = pythonDeps.map(
          (d) => `${d.name}${d.version.startsWith("^") ? `>=${d.version.slice(1)}` : d.version}`,
        );
        installTasks.push(
          installPythonDependencies({
            targetDir,
            packages: pipSpecs,
            dryRun,
            onProgress: (p: InstallProgress) => {
              onProgress?.({ stage: "install-deps", message: p.message, detail: p });
            },
          }).then((result) => {
            installResult = {
              packageManager: "pip", // Extend PackageManager or use string
              installed: result.installed,
              duration: result.duration,
            };
            emit(onProgress, "install-deps", `Python packages installed via pip.`, installResult);
          }),
        );
      }

      await Promise.all(installTasks);
    }

    // ── 6. afterInstall hooks ──────────────────────────────────────────────
    emit(onProgress, "after-install", "Running afterInstall hooks…");
    await runHooksForPlan("afterInstall", plan, registry, baseCtx, { ...hookOpts, strict: false });

    // ── 7. afterWrite hooks ────────────────────────────────────────────────
    emit(onProgress, "after-write", "Running afterWrite hooks…");
    await runHooksForPlan("afterWrite", plan, registry, baseCtx, { ...hookOpts, strict: false });

    // ── 8. onFinalize hooks (NEW — spec §3.2) ─────────────────────────────
    emit(onProgress, "finalize", "Running onFinalize hooks…");
    await runHooksForPlan("onFinalize", plan, registry, baseCtx, { ...hookOpts, strict: false });

    // ── Collect postInstallInstructions ───────────────────────────────────
    const postInstallInstructions = plan.orderedModules
      .filter(
        (m) =>
          typeof m.postInstallInstructions === "string" && m.postInstallInstructions.length > 0,
      )
      .map((m) => ({ moduleId: m.id, instructions: m.postInstallInstructions! }));

    // ── 9. Write project state ─────────────────────────────────────────────
    let stateWritten = false;
    if (options.stateOptions !== undefined) {
      emit(onProgress, "write-state", "Writing project state…");
      await writeProjectState({
        projectRoot: targetDir,
        orderedModules: plan.orderedModules,
        packageManager: (installResult ?? { packageManager: options.packageManager ?? "npm" }).packageManager,
        projectName: options.stateOptions.projectName,
        selections: options.stateOptions.selections,
      });
      stateWritten = true;
      emit(onProgress, "write-state", "Project state written.");
    }

    emit(onProgress, "complete", "Execution pipeline complete.");

    return {
      writeResult,
      patchesApplied: plan.configPatches.length,
      installResult,
      hooksExecuted,
      duration: Date.now() - start,
      stateWritten,
      ciMode,
      postInstallInstructions,
    };
  } catch (pipelineErr) {
    // ── onRollback hooks (NEW — spec §3.2) ───────────────────────────────
    // Best-effort: run rollback hooks so modules can clean up side-effects.
    // We intentionally do NOT await individual failures — rollback must not
    // mask the original error.
    try {
      await runHooksForPlan("onRollback", plan, registry, baseCtx, { strict: false });
    } catch {
      // swallow rollback errors — original error is more important
    }
    throw pipelineErr;
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function emit(
  onProgress: ((e: PipelineEvent) => void) | undefined,
  stage: PipelineStage,
  message: string,
  detail?: unknown,
): void {
  onProgress?.({ stage, message, detail });
}