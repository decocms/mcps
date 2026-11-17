import { z } from "zod";
import { adminFetch } from "../lib/client.ts";
import { createDyTool } from "../lib/tool.ts";

// DY console internal API. Undocumented and may change without notice.

const sectionId = z
  .string()
  .regex(/^\d+$/)
  .optional()
  .describe(
    "DY section (site) id. Defaults to the sectionId in the configuration.",
  );

const confirm = z
  .literal(true)
  .describe("Must be true: this changes the live DY section.");

const listSchema = {
  sectionId,
  q: z.string().default("").describe("Search by name."),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
};

const readOnly = { readOnlyHint: true, openWorldHint: true };
const write = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
};

export const sectionsListTool = createDyTool({
  id: "DY_ADMIN_SECTIONS_LIST",
  description:
    "List the DY sections (sites) the console session can access, with id, name, platform and permissions. Use the id as sectionId in the other DY_ADMIN_* tools to switch sites.",
  inputSchema: z.object({ sectionId }),
  annotations: readOnly,
  // Not section-scoped, but DY still requires a section the user can access.
  handler: ({ sectionId }, env) =>
    adminFetch(env, "/api/int/users/sections_permissions", { sectionId }),
});

const CAMPAIGN_LISTS = {
  all: "smarts",
  api: "api_campaigns",
  app: "mobile_campaigns",
} as const;

export const campaignsListTool = createDyTool({
  id: "DY_ADMIN_CAMPAIGNS_LIST",
  description:
    "List campaigns of a DY section with id, type (smartType), status, active variations and experience counts.",
  inputSchema: z.object({
    ...listSchema,
    kind: z
      .enum(["all", "api", "app"])
      .default("all")
      .describe(
        "all: every campaign type of the section. api: only API campaigns (Experience API selectors). app: Experience App campaigns.",
      ),
    status: z
      .array(z.enum(["ACTIVE", "DRAFT", "PAUSED", "ARCHIVED"]))
      .default(["ACTIVE", "DRAFT"]),
  }),
  annotations: readOnly,
  handler: ({ sectionId, kind, q, limit, offset, status }, env) =>
    adminFetch(env, `/api/int/adm_api_server/${CAMPAIGN_LISTS[kind]}`, {
      method: "POST",
      sectionId,
      body: { limit, offset, q, sort: "updatedDate:desc", status },
    }),
});

export const campaignGetTool = createDyTool({
  id: "DY_ADMIN_CAMPAIGN_GET",
  description:
    "Get a DY campaign with its experiences, targeting, variations, allocation and settings. The result is the exact shape DY_ADMIN_CAMPAIGN_SAVE accepts.",
  inputSchema: z.object({ sectionId, campaignId: z.number().int() }),
  annotations: readOnly,
  // /adapter/get, not /api/int/smarts/{id}: the latter puts an edit lock on the campaign.
  handler: ({ sectionId, campaignId }, env) =>
    adminFetch(env, `/adapter/get/${campaignId}`, { sectionId }),
});

export const campaignSaveTool = createDyTool({
  id: "DY_ADMIN_CAMPAIGN_SAVE",
  description:
    "Create or update a DY campaign. Pass the object from DY_ADMIN_CAMPAIGN_GET with your changes. With an id it updates that campaign. Without one it creates a new campaign: copy an existing one and drop the ids of the campaign, its experiences (id, experienceId, experimentVersionId, settings.versionId) and variations (id, experimentVariationId), and give it a new name, uniqueName and settings.selectorName. Saving publishes immediately: DY ignores isDraft here.",
  inputSchema: z.object({
    sectionId,
    campaign: z
      .record(z.string(), z.unknown())
      .describe("Campaign object as returned by DY_ADMIN_CAMPAIGN_GET."),
    confirm,
  }),
  annotations: write,
  handler: ({ sectionId, campaign }, env) =>
    campaign.id
      ? adminFetch(env, `/adapter/save/${campaign.id}`, {
          method: "PUT",
          sectionId,
          body: campaign,
        })
      : adminFetch(env, "/adapter/save", {
          method: "POST",
          sectionId,
          body: campaign,
        }),
});

export const campaignSetPausedTool = createDyTool({
  id: "DY_ADMIN_CAMPAIGN_SET_PAUSED",
  description: "Pause or resume a DY campaign.",
  inputSchema: z.object({
    sectionId,
    campaignId: z.number().int(),
    paused: z.boolean(),
    confirm,
  }),
  annotations: write,
  handler: async ({ sectionId, campaignId, paused }, env) => {
    const { traceId: _, ...campaign } = await adminFetch(
      env,
      `/adapter/get/${campaignId}`,
      { sectionId },
    );
    return adminFetch(env, `/adapter/save/${campaignId}`, {
      method: "PUT",
      sectionId,
      body: { ...campaign, isPaused: paused },
    });
  },
});

export const campaignsArchiveTool = createDyTool({
  id: "DY_ADMIN_CAMPAIGNS_ARCHIVE",
  description:
    "Archive or unarchive DY campaigns. Archived campaigns stop serving and can be restored.",
  inputSchema: z.object({
    sectionId,
    campaignIds: z.array(z.number().int()).min(1),
    archive: z.boolean().default(true).describe("false to unarchive."),
    confirm,
  }),
  annotations: write,
  handler: ({ sectionId, campaignIds, archive }, env) =>
    adminFetch(
      env,
      `/api/int/smarts/multiple/${archive ? "archive" : "unarchive"}`,
      {
        method: "POST",
        sectionId,
        body: { ids: campaignIds, is_archive: archive },
      },
    ),
});

export const campaignsDeleteTool = createDyTool({
  id: "DY_ADMIN_CAMPAIGNS_DELETE",
  description:
    "Permanently delete DY campaigns. Archive them first with DY_ADMIN_CAMPAIGNS_ARCHIVE. This cannot be undone.",
  inputSchema: z.object({
    sectionId,
    campaignIds: z.array(z.number().int()).min(1),
    confirm,
  }),
  annotations: write,
  handler: ({ sectionId, campaignIds }, env) =>
    adminFetch(env, "/api/int/smarts/multiple/delete", {
      method: "POST",
      sectionId,
      body: { ids: campaignIds },
    }),
});

export const campaignReportTool = createDyTool({
  id: "DY_ADMIN_CAMPAIGN_REPORT",
  description:
    "Experiment report of a DY campaign experience: per-variation normalization, metric totals, uplift and probability to be best for one metric and date range. Defaults to the first experience, the current report version and the primary metric; availableMetrics lists the other metric ids.",
  inputSchema: z.object({
    sectionId,
    campaignId: z.number().int(),
    experienceId: z
      .number()
      .int()
      .optional()
      .describe("Defaults to the campaign's first experience."),
    reportVersionId: z
      .number()
      .int()
      .optional()
      .describe("Defaults to the current version."),
    metric: z
      .string()
      .optional()
      .describe(
        'Metric uniqueId from availableMetrics, e.g. "0_default_Variation Clicks" for CTR. Defaults to the primary metric.',
      ),
    from: z.string().date().optional().describe("YYYY-MM-DD."),
    to: z.string().date().optional().describe("YYYY-MM-DD."),
    dimension: z
      .enum(["TOTAL", "UNIQUE"])
      .default("TOTAL")
      .describe("TOTAL: sessions. UNIQUE: users."),
  }),
  annotations: readOnly,
  handler: async (input, env) => {
    const { campaignId, sectionId } = input;
    const get = (path: string) => adminFetch(env, path, { sectionId });

    const campaign = await get(`/api/int/reports/experiences/${campaignId}`);
    const experiences = campaign.experiences as { id: number; name: string }[];
    const experienceId = input.experienceId ?? experiences[0]?.id;
    if (!experienceId) throw new Error("Campaign has no experiences.");

    const versions = (
      await get(
        `/api/int/reports/experiences/report_versions/${experienceId}?groupSmartType=DEFAULT`,
      )
    ).items as {
      id: number;
      name: string;
      smartType: string;
      scenario: string;
    }[];
    const version = input.reportVersionId
      ? versions.find((v) => v.id === input.reportVersionId)
      : versions[0];
    if (!version) throw new Error("Report version not found.");

    type Metric = {
      uniqueId: string;
      id: number;
      name: string;
      endpoint: string;
    };
    const metrics = (
      await get(
        `/api/int/reports/secondary_metric_options?campaignId=${campaignId}&experienceId=${experienceId}&reportVersionId=${version.id}`,
      )
    ).items as Metric[];
    const metric = input.metric
      ? metrics.find((m) => m.uniqueId === input.metric)
      : ((await get(
          `/api/int/reports/experience_primary_metric/${experienceId}?reportVersionId=${version.id}`,
        )) as unknown as Metric);
    if (!metric) throw new Error(`Unknown metric "${input.metric}".`);

    const section = await get(
      `/api/int/sections/${sectionId ?? env.MESH_REQUEST_CONTEXT?.state?.sectionId}`,
    );

    const report = await adminFetch(
      env,
      `/api/int/reports/get_experiment/${campaignId}/${experienceId}/${metric.endpoint}`,
      {
        method: "POST",
        sectionId,
        body: {
          data: {
            from: input.from ?? null,
            to: input.to ?? null,
            sectionOffset: section.timeZoneOffset ?? 0,
            eventId: metric.id,
            eventName: metric.name,
            eventType: null,
            goalId: null,
            campaignType: version.smartType,
            dimension: input.dimension,
            reportVersionId: version.id,
            audiences: [],
            baseline: null,
            scenario: version.scenario,
          },
        },
      },
    );
    return {
      campaign: campaign.campaignName,
      experiences,
      experienceId,
      reportVersion: version,
      metric,
      availableMetrics: metrics.map((m) => m.uniqueId),
      report,
    };
  },
});

const listTool = (id: string, description: string, path: string) =>
  createDyTool({
    id,
    description,
    inputSchema: z.object(listSchema),
    annotations: readOnly,
    handler: ({ sectionId, q, limit, offset }, env) =>
      adminFetch(env, `/api/int/adm_api_server/${path}`, {
        method: "POST",
        sectionId,
        body: { limit, offset, q, sort: "" },
      }),
  });

export const audiencesListTool = listTool(
  "DY_ADMIN_AUDIENCES_LIST",
  "List DY audiences of a section with id, name, type, conditions summary and usage.",
  "audiences",
);
export const strategiesListTool = listTool(
  "DY_ADMIN_STRATEGIES_LIST",
  "List DY recommendation strategies of a section with id, algorithm, data feed, filter rules and usage.",
  "strategies",
);
export const goalsListTool = listTool(
  "DY_ADMIN_GOALS_LIST",
  "List DY goals (conversion events such as Purchase or Add to Cart) used as campaign objectives and report metrics.",
  "goals",
);

export const feedsListTool = createDyTool({
  id: "DY_ADMIN_FEEDS_LIST",
  description:
    "List the data feeds of a DY section with type, size, sync type, sync status and last sync time.",
  inputSchema: z.object({ sectionId }),
  annotations: readOnly,
  handler: ({ sectionId }, env) =>
    adminFetch(env, "/api/int/data_feeds", { sectionId }),
});

export const audienceGetTool = createDyTool({
  id: "DY_ADMIN_AUDIENCE_GET",
  description:
    "Get a DY audience with its conditions (disjunctive_conditions: groups OR-ed together, each with AND-ed conditions). The result is the shape DY_ADMIN_AUDIENCE_SAVE accepts.",
  inputSchema: z.object({ sectionId, audienceId: z.number().int() }),
  annotations: readOnly,
  handler: ({ sectionId, audienceId }, env) =>
    adminFetch(env, `/audiences/audience/${audienceId}`, { sectionId }),
});

type ConditionGroup = {
  id?: number;
  condition_type: string;
  sub_type?: string | null;
  conditions: Record<string, unknown>[];
};

/** The console's Rails endpoints take nested attributes on create and a plain tree on update. */
export function toAudiencePayload(audience: Record<string, unknown>) {
  const groups =
    (
      audience.disjunctive_conditions as {
        disjunctive_conditions?: ConditionGroup[];
      }
    )?.disjunctive_conditions ?? [];
  const base = {
    audience_type: audience.audience_type ?? "user_attributes",
    comment: audience.comment ?? null,
    compatibility: audience.compatibility,
    condition_days: audience.condition_days,
    is_predefined: false,
    labels: audience.labels ?? [],
    name: audience.name,
    validDays: audience.validDays,
  };
  if (!audience.id) {
    return {
      audience: {
        ...base,
        disjunctive_conditions: {
          disjunctive_conditions_attributes: groups.map(
            ({ id: _, conditions, ...group }) => ({
              ...group,
              conditions_attributes: conditions.map(({ id: _, ...c }) => c),
            }),
          ),
        },
      },
    };
  }
  return {
    audience: {
      ...base,
      id: audience.id,
      is_predefined: audience.is_predefined ?? false,
      section_id: audience.section_id,
      is_archived: false,
      is_hidden: false,
      disjunctive_conditions: {
        disjunctive_conditions: groups.map(
          ({ id, condition_type, sub_type, conditions }) => ({
            id,
            condition_type,
            sub_type,
            conditions,
          }),
        ),
      },
    },
  };
}

export const audienceSaveTool = createDyTool({
  id: "DY_ADMIN_AUDIENCE_SAVE",
  description:
    "Create or update a DY audience. Pass the object from DY_ADMIN_AUDIENCE_GET with your changes (name, comment, condition_days, disjunctive_conditions). With an id it updates that audience; without one it creates a new audience, so copy an existing one, drop its id and give it a new name. Campaigns using the audience change targeting immediately.",
  inputSchema: z.object({
    sectionId,
    audience: z
      .record(z.string(), z.unknown())
      .describe("Audience object as returned by DY_ADMIN_AUDIENCE_GET."),
    confirm,
  }),
  annotations: write,
  handler: ({ sectionId, audience }, env) =>
    adminFetch(
      env,
      audience.id
        ? `/audiences/audience/${audience.id}`
        : "/audiences/audience",
      {
        method: audience.id ? "POST" : "PUT",
        sectionId,
        body: toAudiencePayload(audience),
      },
    ),
});

export const audiencesDeleteTool = createDyTool({
  id: "DY_ADMIN_AUDIENCES_DELETE",
  description:
    "Archive and permanently delete DY audiences. Check first that no campaign uses them. This cannot be undone.",
  inputSchema: z.object({
    sectionId,
    audienceIds: z.array(z.number().int()).min(1),
    confirm,
  }),
  annotations: write,
  handler: async ({ sectionId, audienceIds }, env) => {
    const body = { ids: audienceIds };
    await adminFetch(
      env,
      "/api/int/adm_api_server/audiences/multiple_archive",
      {
        method: "POST",
        sectionId,
        body,
      },
    );
    return adminFetch(env, "/audiences/multiple/delete", {
      method: "POST",
      sectionId,
      body,
    });
  },
});

export const strategyGetTool = createDyTool({
  id: "DY_ADMIN_STRATEGY_GET",
  description:
    "Get a DY recommendation strategy: algorithm, data feed, filter rules, pinned items and slots. The result is the shape DY_ADMIN_STRATEGY_SAVE accepts.",
  inputSchema: z.object({ sectionId, strategyId: z.number().int() }),
  annotations: readOnly,
  handler: ({ sectionId, strategyId }, env) =>
    adminFetch(env, `/api/int/recommendation_widgets/${strategyId}`, {
      sectionId,
    }),
});

export const strategySaveTool = createDyTool({
  id: "DY_ADMIN_STRATEGY_SAVE",
  description:
    "Create or update a DY recommendation strategy. Pass the object from DY_ADMIN_STRATEGY_GET with your changes; with an id it updates that strategy (live in every campaign using it), without one it creates a new strategy.",
  inputSchema: z.object({
    sectionId,
    strategy: z
      .record(z.string(), z.unknown())
      .describe("Strategy object as returned by DY_ADMIN_STRATEGY_GET."),
    confirm,
  }),
  annotations: write,
  handler: ({ sectionId, strategy }, env) =>
    adminFetch(
      env,
      `/api/int/recommendation_widgets${strategy.id ? `/${strategy.id}` : ""}`,
      { method: strategy.id ? "PUT" : "POST", sectionId, body: strategy },
    ),
});

export const strategiesDeleteTool = createDyTool({
  id: "DY_ADMIN_STRATEGIES_DELETE",
  description:
    "Permanently delete DY recommendation strategies. Check first that no campaign uses them. This cannot be undone.",
  inputSchema: z.object({
    sectionId,
    strategyIds: z.array(z.number().int()).min(1),
    confirm,
  }),
  annotations: write,
  handler: ({ sectionId, strategyIds }, env) =>
    adminFetch(env, "/api/int/recommendation_widgets/multiple/delete", {
      method: "POST",
      sectionId,
      body: { ids: strategyIds },
    }),
});

export const feedSyncTool = createDyTool({
  id: "DY_ADMIN_FEED_SYNC",
  description:
    "Queue a manual sync of a DY data feed (re-reads the feed from its source, like Sync now in the console). Check progress with DY_ADMIN_FEEDS_LIST (syncStatus goes pending, then success).",
  inputSchema: z.object({ sectionId, feedId: z.number().int() }),
  annotations: { readOnlyHint: false, openWorldHint: true },
  handler: ({ sectionId, feedId }, env) =>
    adminFetch(
      env,
      `/api/int/data_feeds/manually_queue_feed_sync?feed_id=${feedId}`,
      { sectionId },
    ),
});

export const adminTools = [
  sectionsListTool,
  campaignsListTool,
  campaignGetTool,
  campaignSaveTool,
  campaignSetPausedTool,
  campaignsArchiveTool,
  campaignsDeleteTool,
  campaignReportTool,
  audiencesListTool,
  strategiesListTool,
  goalsListTool,
  feedsListTool,
  audienceGetTool,
  audienceSaveTool,
  audiencesDeleteTool,
  strategyGetTool,
  strategySaveTool,
  strategiesDeleteTool,
  feedSyncTool,
];
