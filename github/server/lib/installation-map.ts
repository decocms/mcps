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
    // Clear old mappings for this connection before storing new ones
    removeConnectionMappings(connectionId);

    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await fetch(
        `https://api.github.com/user/installations?per_page=${perPage}&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );

      if (!response.ok) {
        console.log(
          `[Installation] Failed to fetch installations: ${response.status}`,
        );
        return;
      }

      const data = (await response.json()) as {
        installations: Array<{ id: number; account: { login: string } }>;
        total_count: number;
      };

      for (const installation of data.installations) {
        setInstallationMapping(installation.id, connectionId);
        console.log(
          `[Installation] Mapped ${installation.id} (${installation.account.login}) → ${connectionId}`,
        );
      }

      if (data.installations.length < perPage) break;
      page++;
    }
  } catch (error) {
    console.error("[Installation] Failed to capture mappings:", error);
  }
}
