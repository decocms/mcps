import { workspaceTools } from "./workspaces.ts";
import { campaignTools } from "./campaigns.ts";
import { goalTools } from "./goals.ts";
import { variationTools } from "./variations.ts";
import { sectionTools } from "./sections.ts";
import { featureTools } from "./features.ts";
import { featureRuleTools } from "./feature-rules.ts";
import { reportTools } from "./reports.ts";
import { userTools } from "./users.ts";
import { websiteTools } from "./websites.ts";
import { draftTools } from "./drafts.ts";
import { widgetTools } from "./widgets.ts";

export const tools = [
  ...workspaceTools,
  ...campaignTools,
  ...goalTools,
  ...variationTools,
  ...sectionTools,
  ...featureTools,
  ...featureRuleTools,
  ...reportTools,
  ...userTools,
  ...websiteTools,
  ...draftTools,
  ...widgetTools,
];
