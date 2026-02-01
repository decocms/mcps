/**
 * Skills Registry
 *
 * Skills define reusable workflows for common development tasks.
 * Each skill has user stories, quality gates, and prompts.
 */

import { buildMcpSkill } from "./build-mcp.ts";

export interface UserStory {
  id: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  dependsOn?: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  stack: string[]; // ["*"] for any, or specific like ["deco", "bun"]
  userStories: UserStory[];
  qualityGates: Record<string, string[]>;
  prompts: {
    system: string;
    taskTemplate: string;
  };
}

// Registry of all skills
export const skills: Record<string, Skill> = {
  "build-mcp": buildMcpSkill,
};

export function getSkill(id: string): Skill | undefined {
  return skills[id];
}

export function listSkills(): Skill[] {
  return Object.values(skills);
}
