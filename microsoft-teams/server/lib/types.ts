// Microsoft Graph notification payload (POST body from Graph)
export interface GraphNotificationPayload {
  value: GraphNotification[];
}

export interface GraphNotification {
  subscriptionId: string;
  subscriptionExpirationDateTime: string;
  changeType: "created" | "updated" | "deleted";
  resource: string;
  clientState?: string;
  resourceData: {
    id: string;
    "@odata.type": string;
    "@odata.id": string;
    teamId?: string;
    channelId?: string;
  };
  encryptedContent?: unknown;
}

// Parsed resource path — e.g. "teams/{teamId}/channels/{channelId}/messages/{messageId}"
export interface ParsedResource {
  teamId: string;
  channelId: string;
  messageId: string;
}

export function parseResource(resource: string): ParsedResource | null {
  // teams('teamId')/channels('channelId')/messages('messageId')
  // OR: teams/teamId/channels/channelId/messages/messageId
  const match = resource.match(
    /teams[/(']([^/')]+)[)'/].*channels[/(']([^/')]+)[)'/].*messages[/(']([^/')]+)/i,
  );
  if (!match) return null;
  return {
    teamId: match[1],
    channelId: match[2],
    messageId: match[3],
  };
}
