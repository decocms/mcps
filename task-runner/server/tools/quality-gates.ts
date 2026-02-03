/**
 * Quality Gates Detection and Management
 *
 * Auto-detects quality gates from project configuration (package.json, etc.)
 * and provides tools for managing project-level success criteria.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { getWorkspace } from "./workspace.ts";

// ============================================================================
// Types
// ============================================================================

export interface QualityGate {
  id: string;
  name: string;
  command: string;
  description?: string;
  required: boolean;
  source: "auto" | "manual"; // auto = detected from package.json, manual = user-defined
}

export interface QualityGateResult {
  gate: string;
  command: string;
  passed: boolean;
  output: string;
  duration: number;
}

export interface QualityGatesBaseline {
  verified: boolean;
  verifiedAt: string;
  allPassed: boolean;
  acknowledged: boolean; // User acknowledged pre-existing failures
  failingGates: string[]; // Names of gates that were failing
  results: QualityGateResult[];
}

export interface ProjectConfig {
  qualityGates: QualityGate[];
  qualityGatesBaseline?: QualityGatesBaseline;
  completionToken: string;
  memoryDir: string;
  lastUpdated: string;
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_FILE = ".beads/project-config.json";
const DEFAULT_COMPLETION_TOKEN = "<promise>COMPLETE</promise>";
const DEFAULT_MEMORY_DIR = "memory";

// Common quality gate patterns to detect
const QUALITY_GATE_PATTERNS: Array<{
  scripts: string[];
  name: string;
  description: string;
}> = [
  {
    scripts: ["check", "typecheck", "type-check", "tsc"],
    name: "Type Check",
    description: "TypeScript type checking",
  },
  {
    scripts: ["lint", "eslint", "oxlint"],
    name: "Lint",
    description: "Code linting",
  },
  {
    scripts: ["test", "test:unit", "vitest", "jest"],
    name: "Test",
    description: "Run tests",
  },
  {
    scripts: ["build"],
    name: "Build",
    description: "Build the project",
  },
  {
    scripts: ["fmt", "format", "prettier"],
    name: "Format",
    description: "Code formatting",
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

async function loadProjectConfig(workspace: string): Promise<ProjectConfig> {
  const configPath = `${workspace}/${CONFIG_FILE}`;
  try {
    const content = await Bun.file(configPath).text();
    return JSON.parse(content);
  } catch {
    return {
      qualityGates: [],
      completionToken: DEFAULT_COMPLETION_TOKEN,
      memoryDir: DEFAULT_MEMORY_DIR,
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function saveProjectConfig(
  workspace: string,
  config: ProjectConfig,
): Promise<void> {
  const configPath = `${workspace}/${CONFIG_FILE}`;
  config.lastUpdated = new Date().toISOString();
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}

async function detectQualityGatesFromPackageJson(
  workspace: string,
): Promise<QualityGate[]> {
  const gates: QualityGate[] = [];

  try {
    const packageJsonPath = `${workspace}/package.json`;
    const content = await Bun.file(packageJsonPath).text();
    const pkg = JSON.parse(content) as { scripts?: Record<string, string> };

    if (!pkg.scripts) return gates;

    const scriptNames = Object.keys(pkg.scripts);

    for (const pattern of QUALITY_GATE_PATTERNS) {
      for (const scriptName of pattern.scripts) {
        if (scriptNames.includes(scriptName)) {
          // Detect package manager
          let runner = "npm run";
          try {
            await Bun.file(`${workspace}/bun.lock`).text();
            runner = "bun run";
          } catch {
            try {
              await Bun.file(`${workspace}/pnpm-lock.yaml`).text();
              runner = "pnpm run";
            } catch {
              try {
                await Bun.file(`${workspace}/yarn.lock`).text();
                runner = "yarn";
              } catch {
                // Default to npm
              }
            }
          }

          gates.push({
            id: `gate-${scriptName}`,
            name: pattern.name,
            command: `${runner} ${scriptName}`,
            description: pattern.description,
            required: scriptName !== "build", // Build is optional by default
            source: "auto",
          });
          break; // Only add one gate per pattern
        }
      }
    }
  } catch {
    // No package.json or parse error
  }

  return gates;
}

// ============================================================================
// QUALITY_GATES_DETECT
// ============================================================================

export const createQualityGatesDetectTool = (_env: Env) =>
  createPrivateTool({
    id: "QUALITY_GATES_DETECT",
    description:
      "Auto-detect quality gates from the project's package.json scripts. Finds common patterns like 'check', 'lint', 'test', etc.",
    inputSchema: z.object({
      save: z
        .boolean()
        .optional()
        .describe("Save detected gates to project config"),
    }),
    outputSchema: z.object({
      gates: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          command: z.string(),
          description: z.string().optional(),
          required: z.boolean(),
          source: z.enum(["auto", "manual"]),
        }),
      ),
      saved: z.boolean(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const gates = await detectQualityGatesFromPackageJson(workspace);

      if (context.save && gates.length > 0) {
        const config = await loadProjectConfig(workspace);
        // Merge with existing manual gates
        const manualGates = config.qualityGates.filter(
          (g) => g.source === "manual",
        );
        config.qualityGates = [...gates, ...manualGates];
        await saveProjectConfig(workspace, config);
      }

      return {
        gates,
        saved: context.save ?? false,
      };
    },
  });

// ============================================================================
// QUALITY_GATES_LIST
// ============================================================================

export const createQualityGatesListTool = (_env: Env) =>
  createPrivateTool({
    id: "QUALITY_GATES_LIST",
    description: "List all configured quality gates for the project",
    inputSchema: z.object({}),
    outputSchema: z.object({
      gates: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          command: z.string(),
          description: z.string().optional(),
          required: z.boolean(),
          source: z.enum(["auto", "manual"]),
        }),
      ),
      completionToken: z.string(),
    }),
    execute: async () => {
      const workspace = getWorkspace();
      const config = await loadProjectConfig(workspace);

      return {
        gates: config.qualityGates,
        completionToken: config.completionToken,
      };
    },
  });

// ============================================================================
// QUALITY_GATES_ADD
// ============================================================================

export const createQualityGatesAddTool = (_env: Env) =>
  createPrivateTool({
    id: "QUALITY_GATES_ADD",
    description: "Add a custom quality gate to the project",
    inputSchema: z.object({
      name: z.string().describe("Display name for the gate"),
      command: z.string().describe("Command to run (e.g., 'bun run test')"),
      description: z
        .string()
        .optional()
        .describe("Description of what this gate checks"),
      required: z
        .boolean()
        .optional()
        .describe("Whether this gate must pass (default: true)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      gate: z.object({
        id: z.string(),
        name: z.string(),
        command: z.string(),
        description: z.string().optional(),
        required: z.boolean(),
        source: z.enum(["auto", "manual"]),
      }),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const config = await loadProjectConfig(workspace);

      const gate: QualityGate = {
        id: `gate-${Date.now()}`,
        name: context.name,
        command: context.command,
        description: context.description,
        required: context.required ?? true,
        source: "manual",
      };

      config.qualityGates.push(gate);
      await saveProjectConfig(workspace, config);

      return {
        success: true,
        gate,
      };
    },
  });

// ============================================================================
// QUALITY_GATES_RUN
// ============================================================================

export const createQualityGatesRunTool = (_env: Env) =>
  createPrivateTool({
    id: "QUALITY_GATES_RUN",
    description:
      "Run all quality gates and report which pass/fail. Use before marking a task complete.",
    inputSchema: z.object({
      requiredOnly: z
        .boolean()
        .optional()
        .describe("Only run required gates (default: true)"),
    }),
    outputSchema: z.object({
      allPassed: z.boolean(),
      results: z.array(
        z.object({
          gate: z.string(),
          command: z.string(),
          passed: z.boolean(),
          output: z.string(),
          duration: z.number(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const config = await loadProjectConfig(workspace);
      const requiredOnly = context.requiredOnly ?? true;

      const gatesToRun = requiredOnly
        ? config.qualityGates.filter((g) => g.required)
        : config.qualityGates;

      const results: Array<{
        gate: string;
        command: string;
        passed: boolean;
        output: string;
        duration: number;
      }> = [];

      for (const gate of gatesToRun) {
        const start = Date.now();
        try {
          const [cmd, ...args] = gate.command.split(" ");
          const proc = Bun.spawn([cmd, ...args], {
            cwd: workspace,
            stdout: "pipe",
            stderr: "pipe",
          });

          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          const exitCode = await proc.exited;

          results.push({
            gate: gate.name,
            command: gate.command,
            passed: exitCode === 0,
            output: (stdout + stderr).slice(-500), // Last 500 chars
            duration: Date.now() - start,
          });
        } catch (error) {
          results.push({
            gate: gate.name,
            command: gate.command,
            passed: false,
            output: error instanceof Error ? error.message : String(error),
            duration: Date.now() - start,
          });
        }
      }

      return {
        allPassed: results.every((r) => r.passed),
        results,
      };
    },
  });

// ============================================================================
// PROJECT_CONFIG_GET
// ============================================================================

export const createProjectConfigGetTool = (_env: Env) =>
  createPrivateTool({
    id: "PROJECT_CONFIG_GET",
    description:
      "Get the full project configuration including quality gates and settings",
    inputSchema: z.object({}),
    outputSchema: z.object({
      config: z.object({
        qualityGates: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            command: z.string(),
            description: z.string().optional(),
            required: z.boolean(),
            source: z.enum(["auto", "manual"]),
          }),
        ),
        completionToken: z.string(),
        memoryDir: z.string(),
        lastUpdated: z.string(),
      }),
    }),
    execute: async () => {
      const workspace = getWorkspace();
      const config = await loadProjectConfig(workspace);
      return { config };
    },
  });

// ============================================================================
// QUALITY_GATES_VERIFY
// ============================================================================

export const createQualityGatesVerifyTool = (_env: Env) =>
  createPrivateTool({
    id: "QUALITY_GATES_VERIFY",
    description:
      "Run quality gates to establish a baseline. Must be done before creating tasks. Returns current state and allows acknowledging pre-existing failures.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      allPassed: z.boolean(),
      results: z.array(
        z.object({
          gate: z.string(),
          command: z.string(),
          passed: z.boolean(),
          output: z.string(),
          duration: z.number(),
        }),
      ),
      baseline: z.object({
        verified: z.boolean(),
        verifiedAt: z.string(),
        allPassed: z.boolean(),
        acknowledged: z.boolean(),
        failingGates: z.array(z.string()),
      }),
    }),
    execute: async () => {
      const workspace = getWorkspace();
      const config = await loadProjectConfig(workspace);
      const requiredGates = config.qualityGates.filter((g) => g.required);

      const results: QualityGateResult[] = [];

      for (const gate of requiredGates) {
        const start = Date.now();
        try {
          const [cmd, ...args] = gate.command.split(" ");
          const proc = Bun.spawn([cmd, ...args], {
            cwd: workspace,
            stdout: "pipe",
            stderr: "pipe",
          });

          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          const exitCode = await proc.exited;

          results.push({
            gate: gate.name,
            command: gate.command,
            passed: exitCode === 0,
            output: (stdout + stderr).slice(-500),
            duration: Date.now() - start,
          });
        } catch (error) {
          results.push({
            gate: gate.name,
            command: gate.command,
            passed: false,
            output: error instanceof Error ? error.message : String(error),
            duration: Date.now() - start,
          });
        }
      }

      const allPassed = results.every((r) => r.passed);
      const failingGates = results.filter((r) => !r.passed).map((r) => r.gate);

      // Update baseline - not acknowledged yet if there are failures
      const baseline: QualityGatesBaseline = {
        verified: true,
        verifiedAt: new Date().toISOString(),
        allPassed,
        acknowledged: allPassed, // Auto-acknowledge if all pass
        failingGates,
        results,
      };

      config.qualityGatesBaseline = baseline;
      await saveProjectConfig(workspace, config);

      return {
        allPassed,
        results,
        baseline: {
          verified: baseline.verified,
          verifiedAt: baseline.verifiedAt,
          allPassed: baseline.allPassed,
          acknowledged: baseline.acknowledged,
          failingGates: baseline.failingGates,
        },
      };
    },
  });

// ============================================================================
// QUALITY_GATES_ACKNOWLEDGE
// ============================================================================

export const createQualityGatesAcknowledgeTool = (_env: Env) =>
  createPrivateTool({
    id: "QUALITY_GATES_ACKNOWLEDGE",
    description:
      "Acknowledge pre-existing quality gate failures. After acknowledging, agents will NOT attempt to fix these failures - they will focus only on their assigned task.",
    inputSchema: z.object({
      acknowledge: z.boolean().describe("Set to true to acknowledge failures"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      baseline: z
        .object({
          verified: z.boolean(),
          allPassed: z.boolean(),
          acknowledged: z.boolean(),
          failingGates: z.array(z.string()),
        })
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const config = await loadProjectConfig(workspace);

      if (!config.qualityGatesBaseline?.verified) {
        return {
          success: false,
          error:
            "No baseline verified. Run QUALITY_GATES_VERIFY first to establish baseline.",
        };
      }

      if (config.qualityGatesBaseline.allPassed) {
        return {
          success: true,
          baseline: {
            verified: true,
            allPassed: true,
            acknowledged: true,
            failingGates: [],
          },
        };
      }

      config.qualityGatesBaseline.acknowledged = context.acknowledge;
      await saveProjectConfig(workspace, config);

      return {
        success: true,
        baseline: {
          verified: config.qualityGatesBaseline.verified,
          allPassed: config.qualityGatesBaseline.allPassed,
          acknowledged: config.qualityGatesBaseline.acknowledged,
          failingGates: config.qualityGatesBaseline.failingGates,
        },
      };
    },
  });

// ============================================================================
// QUALITY_GATES_BASELINE_GET
// ============================================================================

export const createQualityGatesBaselineGetTool = (_env: Env) =>
  createPrivateTool({
    id: "QUALITY_GATES_BASELINE_GET",
    description: "Get the current quality gates baseline verification status",
    inputSchema: z.object({}),
    outputSchema: z.object({
      hasBaseline: z.boolean(),
      baseline: z
        .object({
          verified: z.boolean(),
          verifiedAt: z.string(),
          allPassed: z.boolean(),
          acknowledged: z.boolean(),
          failingGates: z.array(z.string()),
        })
        .optional(),
      canCreateTasks: z.boolean(),
    }),
    execute: async () => {
      const workspace = getWorkspace();
      const config = await loadProjectConfig(workspace);

      const baseline = config.qualityGatesBaseline;
      const hasBaseline = !!baseline?.verified;
      const canCreateTasks =
        hasBaseline && (baseline.allPassed || baseline.acknowledged);

      return {
        hasBaseline,
        baseline: baseline
          ? {
              verified: baseline.verified,
              verifiedAt: baseline.verifiedAt,
              allPassed: baseline.allPassed,
              acknowledged: baseline.acknowledged,
              failingGates: baseline.failingGates,
            }
          : undefined,
        canCreateTasks,
      };
    },
  });

// ============================================================================
// Export all quality gate tools
// ============================================================================

export const qualityGateTools = [
  createQualityGatesDetectTool,
  createQualityGatesListTool,
  createQualityGatesAddTool,
  createQualityGatesRunTool,
  createProjectConfigGetTool,
  createQualityGatesVerifyTool,
  createQualityGatesAcknowledgeTool,
  createQualityGatesBaselineGetTool,
];
