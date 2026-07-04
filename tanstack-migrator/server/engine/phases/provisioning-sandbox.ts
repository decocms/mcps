/** Phase: provisioning_sandbox — VM_START (or simulation) for the target repo. */

import { addEvent } from "../../db/events.ts";
import { updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver } from "../../sandbox/client.ts";

export async function provisioningSandbox(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  const driver = getDriver(ctx);

  // Persist the project id BEFORE starting the sandbox — a failed start then
  // retries against the same project instead of creating duplicates.
  let current = site;
  if (driver.prepareProject && !site.virtual_mcp_id) {
    const { virtualMcpId } = await driver.prepareProject(site, ctx);
    current = await updateSite(site.id, { virtual_mcp_id: virtualMcpId });
    await addEvent(site.id, `Projeto mesh criado: ${virtualMcpId}`);
  }

  const info = await driver.ensure(current, ctx);

  await updateSite(site.id, {
    sandbox_handle: info.handle,
    sandbox_preview_url: info.previewUrl,
    preview_ready: false,
    virtual_mcp_id: info.virtualMcpId ?? site.virtual_mcp_id,
    status: "migrating_script",
    phase_detail: "sandbox de pé, rodando o script de migração",
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(
    site.id,
    `Sandbox provisionado (${driver.name}): ${info.handle}${info.previewUrl ? ` — preview ${info.previewUrl}` : ""}`,
  );
}
