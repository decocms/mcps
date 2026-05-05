import { getSnapshotTool } from "./get-snapshot.ts";
import { getTrafficTool } from "./get-traffic.ts";
import { listAbTestsTool } from "./list-ab-tests.ts";
import { listFunnelsTool } from "./list-funnels.ts";
import { listRecordingsTool } from "./list-recordings.ts";
import { listSnapshotsTool } from "./list-snapshots.ts";
import { listSurveysTool } from "./list-surveys.ts";
import { trackConversionTool } from "./track-conversion.ts";
import { verifyCredentialsTool } from "./verify-credentials.ts";

export const tools = [
  trackConversionTool,
  verifyCredentialsTool,
  listSnapshotsTool,
  getSnapshotTool,
  listRecordingsTool,
  listAbTestsTool,
  listFunnelsTool,
  listSurveysTool,
  getTrafficTool,
];
