/**
 * MCP tools for Discord role operations
 *
 * This file implements tools for:
 * - Creating roles
 * - Editing roles
 * - Deleting roles
 * - Listing guild roles
 */

import type { Env } from "../main.ts";
import { createDiscordClient } from "./utils/discord-client.ts";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  createRoleInputSchema,
  createRoleOutputSchema,
  editRoleInputSchema,
  editRoleOutputSchema,
  deleteRoleInputSchema,
  deleteRoleOutputSchema,
  getGuildRolesInputSchema,
  getGuildRolesOutputSchema,
} from "../lib/types.ts";

/**
 * CREATE_ROLE - Create a new role in a guild
 */
export const createCreateRoleTool = (env: Env) =>
  createPrivateTool({
    id: "CREATE_ROLE",
    description:
      "Create a new role in a Discord server (guild). You can configure the role name, color, permissions, and display settings. Requires MANAGE_ROLES permission.",
    inputSchema: createRoleInputSchema,
    outputSchema: createRoleOutputSchema,
    execute: async ({ context }) => {
      const {
        guildId,
        name,
        permissions,
        color,
        hoist = false,
        mentionable = false,
      } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {
        hoist,
        mentionable,
      };

      if (name) body.name = name;
      if (permissions) body.permissions = permissions;
      if (color !== undefined) body.color = color;

      try {
        const role = await client.createRole(guildId, body);
        return {
          id: role.id,
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          position: role.position,
          permissions: role.permissions,
          managed: role.managed,
          mentionable: role.mentionable,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create role: ${message}`);
      }
    },
  });

/**
 * EDIT_ROLE - Edit an existing role in a guild
 */
export const createEditRoleTool = (env: Env) =>
  createPrivateTool({
    id: "EDIT_ROLE",
    description:
      "Modify an existing role in a Discord server (guild). You can change the name, color, permissions, and display settings. Requires MANAGE_ROLES permission.",
    inputSchema: editRoleInputSchema,
    outputSchema: editRoleOutputSchema,
    execute: async ({ context }) => {
      const { guildId, roleId, name, permissions, color, hoist, mentionable } =
        context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const body: any = {};

      if (name) body.name = name;
      if (permissions) body.permissions = permissions;
      if (color !== undefined) body.color = color;
      if (hoist !== undefined) body.hoist = hoist;
      if (mentionable !== undefined) body.mentionable = mentionable;

      if (Object.keys(body).length === 0) {
        throw new Error("At least one field must be provided to edit the role");
      }

      try {
        const role = await client.editRole(guildId, roleId, body);
        return {
          id: role.id,
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          position: role.position,
          permissions: role.permissions,
          managed: role.managed,
          mentionable: role.mentionable,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to edit role: ${message}`);
      }
    },
  });

/**
 * DELETE_ROLE - Delete a role from a guild
 */
export const createDeleteRoleTool = (env: Env) =>
  createPrivateTool({
    id: "DELETE_ROLE",
    description:
      "Delete a role from a Discord server (guild). This action is permanent and cannot be undone. Requires MANAGE_ROLES permission.",
    inputSchema: deleteRoleInputSchema,
    outputSchema: deleteRoleOutputSchema,
    execute: async ({ context }) => {
      const { guildId, roleId, reason } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      const searchParams: Record<string, string> = {};
      if (reason) searchParams.reason = reason;

      try {
        await client.deleteRole(guildId, roleId, searchParams);
        return {
          success: true,
          message: "Role deleted successfully",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to delete role: ${message}`);
      }
    },
  });

/**
 * GET_GUILD_ROLES - Get all roles in a guild
 */
export const createGetGuildRolesTool = (env: Env) =>
  createPrivateTool({
    id: "GET_GUILD_ROLES",
    description:
      "Fetch all roles from a Discord server (guild). Returns role information including names, colors, permissions, and position in the hierarchy.",
    inputSchema: getGuildRolesInputSchema,
    outputSchema: getGuildRolesOutputSchema,
    execute: async ({ context }) => {
      const { guildId } = context;
      const state = env.DECO_REQUEST_CONTEXT.state;

      const client = createDiscordClient({ botToken: state.botToken });

      try {
        const roles = await client.getGuildRoles(guildId);
        return {
          roles: roles.map((role: any) => ({
            id: role.id,
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            position: role.position,
            permissions: role.permissions,
            managed: role.managed,
            mentionable: role.mentionable,
          })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get guild roles: ${message}`);
      }
    },
  });

/**
 * Array of all role-related tools
 */
export const roleTools = [
  createCreateRoleTool,
  createEditRoleTool,
  createDeleteRoleTool,
  createGetGuildRolesTool,
];
