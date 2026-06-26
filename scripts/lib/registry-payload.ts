/**
 * Shared app.json → registry item mapping.
 *
 * One canonical mapping used by BOTH:
 *  - `publish-one.ts` (publishes a single MCP to the live mesh registry), and
 *  - `build-registry-json.ts` (builds the static `registry.json` catalog).
 *
 * Keeping it in one place guarantees the committed `registry.json` stays
 * byte-for-byte consistent with what the publish flow would produce.
 */

export interface AppJson {
  scopeName: string;
  name: string;
  friendlyName?: string;
  description?: string;
  icon?: string;
  unlisted?: boolean;
  official?: boolean;
  connection?: {
    type?: string;
    url?: string;
    configSchema?: Record<string, unknown>;
  };
  bindings?: Record<string, string>;
  requester?: {
    name?: string;
    email?: string;
    repository?: string;
  };
  metadata?: {
    categories?: string[];
    official?: boolean;
    tags?: string[];
    short_description?: string;
    mesh_description?: string;
    mesh_unlisted?: boolean;
  };
  tools?: Array<{ name: string; description?: string }>;
}

export interface MeshTool {
  name: string;
  description?: string | null;
}

export interface MeshMeta {
  verified?: boolean;
  tags?: string[];
  categories?: string[];
  friendly_name?: string | null;
  short_description?: string | null;
  owner?: string | null;
  readme?: string | null;
  has_remote?: boolean;
  has_oauth?: boolean;
  tools?: MeshTool[];
}

/** The registry item (`data` of a publish-request, an item of `registry.json`). */
export interface RegistryItemData {
  id: string;
  title: string;
  description?: string | null;
  is_public?: boolean;
  _meta?: { "mcp.mesh"?: MeshMeta };
  server: {
    name: string;
    title?: string;
    description?: string;
    websiteUrl?: string;
    icons?: Array<{ src: string }>;
    remotes?: Array<{
      type?: string;
      url?: string;
      name?: string;
      title?: string;
      description?: string;
    }>;
    repository?: { url?: string };
  };
}

export interface BuildRegistryDataOptions {
  /** README/long description to inline as `_meta["mcp.mesh"].readme`. */
  readme?: string | null;
}

/**
 * Map an app.json into a registry item (`RegistryItemData`).
 *
 * `is_public` reflects the app's listed state; downstream consumers may filter
 * on it (the static catalog keeps only public items).
 */
export function buildRegistryData(
  app: AppJson,
  opts: BuildRegistryDataOptions = {},
): RegistryItemData {
  const id = `${app.scopeName}/${app.name}`;
  const title = app.friendlyName ?? app.name;
  const isOfficial = app.metadata?.official ?? app.official ?? false;
  const hasRemote =
    app.connection?.type !== "BINDING" && Boolean(app.connection?.url);
  const hasOAuth = Boolean(app.connection?.configSchema);

  const tools: MeshTool[] | undefined = app.tools?.map((t) => ({
    name: t.name,
    description: t.description ?? null,
  }));

  const meshMeta: MeshMeta = {
    verified: isOfficial,
    friendly_name: app.friendlyName ?? null,
    short_description: app.metadata?.short_description?.slice(0, 160) ?? null,
    owner: app.scopeName,
    has_remote: hasRemote,
    has_oauth: hasOAuth,
  };

  if (app.metadata?.tags?.length) meshMeta.tags = app.metadata.tags;
  if (app.metadata?.categories?.length) {
    meshMeta.categories = [app.metadata.categories[0]];
  }
  if (opts.readme) {
    meshMeta.readme = opts.readme;
  } else if (app.metadata?.mesh_description) {
    meshMeta.readme = app.metadata.mesh_description;
  }
  if (tools?.length) meshMeta.tools = tools;

  const remotes: RegistryItemData["server"]["remotes"] = [];
  if (hasRemote && app.connection?.url) {
    remotes.push({
      type: app.connection.type ?? "HTTP",
      url: app.connection.url,
      name: app.name,
      title,
      description: app.description,
    });
  }

  return {
    id,
    title,
    description: app.description ?? null,
    is_public: !(app.unlisted ?? app.metadata?.mesh_unlisted ?? false),
    _meta: { "mcp.mesh": meshMeta },
    server: {
      name: app.name,
      title,
      description: app.description,
      ...(app.icon ? { icons: [{ src: app.icon }] } : {}),
      ...(remotes.length ? { remotes } : {}),
      ...(app.requester?.repository
        ? { repository: { url: app.requester.repository } }
        : {}),
    },
  };
}
