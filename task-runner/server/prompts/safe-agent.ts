/**
 * Safe Agent Prompt Templates
 *
 * Prompt templates that enforce:
 * - Frequent commits after each change
 * - Beads task tracking
 * - Safety rules (no rm -rf, rimraf, etc.)
 * - Incremental, testable changes
 */

export interface TaskInfo {
  id: string;
  title: string;
  description?: string;
  priority?: number | string;
  epicId?: string;
}

export interface PromptContext {
  workspace: string;
  qualityGates?: string[];
  projectGuidelines?: string;
  recentContext?: string;
}

/**
 * Build the main safety rules section
 */
export function buildSafetyRules(): string {
  return `## MANDATORY SAFETY RULES

1. **COMMIT FREQUENTLY**: After each logical change, run:
   \`\`\`bash
   git add -A && git commit -m "descriptive message"
   \`\`\`
   Do NOT accumulate many changes before committing.

2. **NEVER DELETE DIRECTORIES**: 
   - Do NOT use \`rm -rf\`, \`rimraf\`, \`npx rimraf\`, or similar
   - If you need to remove files, delete them individually
   - Ask for confirmation before any bulk deletions

3. **SMALL INCREMENTAL CHANGES**:
   - Make one logical change at a time
   - Test after each change if possible
   - If a change is complex, break it into smaller steps

4. **ASK IF UNSURE**:
   - If requirements are ambiguous, explain the ambiguity
   - Propose your interpretation but wait for confirmation on major decisions
   - Do NOT guess on architectural decisions`;
}

/**
 * Build the task context section
 */
export function buildTaskSection(task: TaskInfo): string {
  const priority = task.priority ? ` (Priority: ${task.priority})` : "";
  const epic = task.epicId ? `\n- Epic: ${task.epicId}` : "";

  return `## Current Task

**${task.title}**${priority}
- Task ID: ${task.id}
- Status: in_progress${epic}

### Description
${task.description || "No additional description provided."}`;
}

/**
 * Build the quality gates section
 */
export function buildQualityGates(gates?: string[]): string {
  const defaultGates = ["bun run check", "bun run lint"];
  const qualityGates = gates && gates.length > 0 ? gates : defaultGates;

  return `## Quality Gates

Before marking complete, ensure these commands pass (if available):
${qualityGates.map((g) => `- \`${g}\``).join("\n")}

If a command is not available in this project, skip it.`;
}

/**
 * Build the completion section
 */
export function buildCompletionSection(): string {
  return `## Completion Protocol

When the task is FULLY complete:
1. Ensure all changes are committed
2. Verify quality gates pass (or explain why they don't apply)
3. Output exactly: \`<promise>COMPLETE</promise>\`

**IMPORTANT**: Only output the completion token if the task is truly finished.
If you cannot complete the task, explain what's blocking you and do NOT output the token.`;
}

/**
 * Build the full safe prompt for a task
 */
export function buildSafePrompt(
  task: TaskInfo,
  context: PromptContext,
): string {
  const sections: string[] = [];

  // Header
  sections.push(`You are working on a coding task in: ${context.workspace}`);

  // Project guidelines if provided
  if (context.projectGuidelines) {
    sections.push(`## Project Guidelines

${context.projectGuidelines}`);
  }

  // Recent context if provided
  if (context.recentContext) {
    sections.push(`## Recent Context

${context.recentContext}`);
  }

  // Safety rules
  sections.push(buildSafetyRules());

  // Task details
  sections.push(buildTaskSection(task));

  // Quality gates
  sections.push(buildQualityGates(context.qualityGates));

  // Completion protocol
  sections.push(buildCompletionSection());

  return sections.join("\n\n");
}

/**
 * Build a minimal prompt for quick tasks
 */
export function buildQuickPrompt(
  task: TaskInfo,
  workspace: string,
): string {
  return `Working in: ${workspace}

Task: ${task.title} (${task.id})
${task.description || ""}

Rules:
1. Commit after each change: git add -A && git commit -m "message"
2. No rm -rf or rimraf
3. When done: <promise>COMPLETE</promise>`;
}

/**
 * Parse completion status from agent output
 */
export function detectCompletion(output: string): boolean {
  return output.includes("<promise>COMPLETE</promise>");
}

/**
 * Extract any error messages or blocking reasons from output
 */
export function extractBlockingReason(output: string): string | null {
  // Look for common patterns indicating the agent couldn't complete
  const patterns = [
    /cannot complete.*?because[:\s]+(.+?)(?:\n|$)/i,
    /blocked by[:\s]+(.+?)(?:\n|$)/i,
    /unable to proceed[:\s]+(.+?)(?:\n|$)/i,
    /missing.*?requirement[:\s]+(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}
