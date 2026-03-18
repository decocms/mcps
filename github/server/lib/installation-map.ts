/**
 * In-memory mapping from GitHub installation ID to Mesh connection ID.
 *
 * Populated during onChange when we discover which installations
 * the user's OAuth token has access to.
 */

const installationMap = new Map<number, string>();

export function setInstallationMapping(
  installationId: number,
  connectionId: string,
): void {
  installationMap.set(installationId, connectionId);
}

export function getConnectionForInstallation(
  installationId: number,
): string | undefined {
  return installationMap.get(installationId);
}

export function removeConnectionMappings(connectionId: string): void {
  for (const [installationId, connId] of installationMap) {
    if (connId === connectionId) {
      installationMap.delete(installationId);
    }
  }
}

/**
 * Fetch the user's GitHub App installations and store mappings.
 */
export async function captureInstallationMappings(
  token: string,
  connectionId: string,
): Promise<void> {
  try {
    const response = await fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      console.log(
        `[Installation] Failed to fetch installations: ${response.status}`,
      );
      return;
    }

    const data = (await response.json()) as {
      installations: Array<{ id: number; account: { login: string } }>;
    };

    for (const installation of data.installations) {
      setInstallationMapping(installation.id, connectionId);
      console.log(
        `[Installation] Mapped ${installation.id} (${installation.account.login}) → ${connectionId}`,
      );
    }
  } catch (error) {
    console.error("[Installation] Failed to capture mappings:", error);
  }
}
