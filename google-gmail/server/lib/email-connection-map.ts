/**
 * In-memory mapping from Gmail email address to Mesh connection ID.
 *
 * Populated during onChange when we fetch the user's Gmail profile.
 */

const emailMap = new Map<string, string>();

export function setEmailMapping(email: string, connectionId: string): void {
  emailMap.set(email.toLowerCase(), connectionId);
}

export function getConnectionForEmail(email: string): string | undefined {
  return emailMap.get(email.toLowerCase());
}

export function removeConnectionMappings(connectionId: string): void {
  for (const [email, connId] of emailMap) {
    if (connId === connectionId) {
      emailMap.delete(email);
    }
  }
}
