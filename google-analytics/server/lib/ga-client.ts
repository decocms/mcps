import { OAuth2Client } from "google-auth-library";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { AnalyticsAdminServiceClient } from "@google-analytics/admin";
import type { Env } from "../types/env.ts";
import { getGoogleAccessToken } from "./env.ts";

export interface GaClientConfig {
  accessToken: string;
}

export class GaClient {
  public dataClient: BetaAnalyticsDataClient;
  public adminClient: AnalyticsAdminServiceClient;

  constructor(config: GaClientConfig) {
    const authClient = new OAuth2Client();
    authClient.setCredentials({ access_token: config.accessToken });
    
    // We instantiate both clients utilizing the explicit oauth object.
    this.dataClient = new BetaAnalyticsDataClient({ authClient });
    this.adminClient = new AnalyticsAdminServiceClient({ authClient });
  }

  static fromEnv(env: Env): GaClient {
    const accessToken = getGoogleAccessToken(env);
    return new GaClient({ accessToken });
  }
}
