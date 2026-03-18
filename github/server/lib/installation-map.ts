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
    // Fetch all pages first, then swap mappings atomically
    const allInstallations: Array<{ id: number; account: { login: string } }> =
      [];
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
        throw new Error(
          `Failed to fetch installations (page ${page}): ${response.status}`,
        );
      }

      const data = (await response.json()) as {
        installations: Array<{ id: number; account: { login: string } }>;
        total_count: number;
      };

      allInstallations.push(...data.installations);

      if (data.installations.length < perPage) break;
      page++;
    }

    // Only clear old mappings after all pages fetched successfully
    removeConnectionMappings(connectionId);

    for (const installation of allInstallations) {
      setInstallationMapping(installation.id, connectionId);
      console.log(
        `[Installation] Mapped ${installation.id} (${installation.account.login}) → ${connectionId}`,
      );
    }
  } catch (error) {
    console.error("[Installation] Failed to capture mappings:", error);
  }
}
