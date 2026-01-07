import { $ } from "bun";

const SITE_NAME_TO_MCP_FOLDER_OVERRIDES = {
  vibemcp: "mcp-studio",
};

const getMcpFolder = (siteName: string) => {
  return SITE_NAME_TO_MCP_FOLDER_OVERRIDES[siteName] || siteName;
};

const siteName = process.env.DECO_SITE_NAME;

if (!siteName) {
  console.error("❌ Error: DECO_SITE_NAME environment variable is not set");
  process.exit(1);
}

console.log(`Building MCP for site name ${siteName}`);

const folderToBuild = getMcpFolder(siteName);

if (!folderToBuild) {
  console.error(
    `❌ Error building MCP: package with name ${siteName} not found`,
  );
  process.exit(1);
}

await $`bun run --filter=${folderToBuild} build`;
await $`mv ./${folderToBuild}/dist ./dist`;
