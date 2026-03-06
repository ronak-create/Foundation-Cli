import type { CompositionPlan } from "../types.js";
import type { ModuleRegistry } from "../module-registry/registry.js";
import type { PluginHookContext } from "@foundation-cli/plugin-sdk";
import { executeCompositionPlan } from "./project-writer.js";
import { applyAllPatches } from "./config-merger.js";
import { installDependencies, writeDepsToPackageJson } from "./dependency-installer.js";
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
  /**
   * When provided, project state files are written after successful commit.
   * If omitted, state files are skipped (e.g. in unit tests).
   */
  readonly stateOptions?: {
    readonly projectName: string;
    readonly selections: Readonly<Record<string, string>>;
  };
}

export type PipelineStage =
  | "before-write"
  | "write-files"
  | "apply-patches"
  | "before-install"
  | "install-deps"
  | "after-install"
  | "after-write"
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
  /** Populated when stateOptions are provided and state was written. */
  readonly stateWritten: boolean;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Full execution pipeline:
 *
 *  1. beforeWrite hooks
 *  2. Write all files (atomic)
 *  3. Apply config patches
 *  4. beforeInstall hooks
 *  5. Install dependencies
 *  6. afterInstall hooks
 *  7. afterWrite hooks
 *  8. Write project state (.foundation/)   ← Phase 3 addition
 */
export async function runExecutionPipeline(
  plan: CompositionPlan,
  options: ExecutionPipelineOptions,
): Promise<ExecutionPipelineResult> {
  const { targetDir, registry, skipInstall = false, dryRun = false, onProgress } = options;

  const start = Date.now();
  const hooksExecuted: Array<{ moduleId: string; hook: string }> = [];

  const baseCtx: PluginHookContext = {
    ...options.hookContext,
    projectRoot: targetDir,
  };

  const hookOpts = {
    strict: true,
    onHookStart: (moduleId: string, hook: string) => {
      hooksExecuted.push({ moduleId, hook });
      onProgress?.({
        stage: "before-write",
        message: `Hook ${hook} starting for ${moduleId}`,
      });
    },
  };

  // ── 1. beforeWrite hooks ──────────────────────────────────────────────────
  emit(onProgress, "before-write", "Running beforeWrite hooks…");
  await runHooksForPlan("beforeWrite", plan, registry, baseCtx, {
    ...hookOpts,
    strict: false,
  });

  // ── 2. Write files ────────────────────────────────────────────────────────
  emit(onProgress, "write-files", `Writing ${plan.files.length} file(s)…`);
  const writeResult = await executeCompositionPlan(plan, targetDir);
  emit(onProgress, "write-files", `Wrote ${writeResult.filesWritten} file(s).`, writeResult);

  // ── 3. Apply config patches ───────────────────────────────────────────────
  emit(onProgress, "apply-patches", `Applying ${plan.configPatches.length} config patch(es)…`);
  await applyAllPatches(targetDir, plan.configPatches);
  emit(onProgress, "apply-patches", `Applied ${plan.configPatches.length} config patch(es).`);

  // ── 4. beforeInstall hooks ────────────────────────────────────────────────
  emit(onProgress, "before-install", "Running beforeInstall hooks…");
  await runHooksForPlan("beforeInstall", plan, registry, baseCtx, {
    ...hookOpts,
    strict: false,
  });

  // ── 5. Write deps + (optionally) install ────────────────────────────────
  let installResult: ExecutionPipelineResult["installResult"] = null;

  // Always write deps into package.json — even when skipInstall is true.
  // This guarantees a complete package.json so the user can run npm install
  // themselves without hunting for which packages to add manually.
  if (plan.dependencies.length > 0) {
    emit(onProgress, "install-deps", "Writing dependencies to package.json…");
    await writeDepsToPackageJson(targetDir, plan.dependencies);
  }

  if (!skipInstall) {
    emit(onProgress, "install-deps", "Installing dependencies…");
    const result = await installDependencies({
      targetDir,
      deps: plan.dependencies,
      ...(options.packageManager !== undefined && { packageManager: options.packageManager }),
      dryRun,
      onProgress: (p: InstallProgress) => {
        onProgress?.({ stage: "install-deps", message: p.message, detail: p });
      },
    });
    installResult = result;
    emit(onProgress, "install-deps", `Installed via ${result.packageManager}.`, result);
  }

  // ── 6. afterInstall hooks ─────────────────────────────────────────────────
  emit(onProgress, "after-install", "Running afterInstall hooks…");
  await runHooksForPlan("afterInstall", plan, registry, baseCtx, {
    ...hookOpts,
    strict: false,
  });

  // ── 7. afterWrite hooks ───────────────────────────────────────────────────
  emit(onProgress, "after-write", "Running afterWrite hooks…");
  await runHooksForPlan("afterWrite", plan, registry, baseCtx, {
    ...hookOpts,
    strict: false,
  });

  // ── 8. Write project state ────────────────────────────────────────────────
  let stateWritten = false;

  if (options.stateOptions !== undefined) {
    emit(onProgress, "write-state", "Writing project state…");

    await writeProjectState({
      projectRoot: targetDir,
      orderedModules: plan.orderedModules,
      packageManager: installResult?.packageManager ?? options.packageManager ?? "npm",
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
  };
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