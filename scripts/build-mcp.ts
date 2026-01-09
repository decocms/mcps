import { $ } from "bun";

const FOLDER_OVERRIDES = {
	vibeMcp: "mcp-studio",
};

const PKG_NAME_OVERRIDES = {
	vibemcp: "mcp-studio",
	openrouter: "@decocms/openrouter",
};

const getMcpPkgName = (siteName: string) => {
	return PKG_NAME_OVERRIDES[siteName] || siteName;
};

const siteName = process.env.DECO_SITE_NAME;

if (!siteName) {
	console.error("❌ Error: DECO_SITE_NAME environment variable is not set");
	process.exit(1);
}

console.log(`Building MCP for site name ${siteName}`);

const pkgToBuild = getMcpPkgName(siteName);

if (!pkgToBuild) {
	console.error(
		`❌ Error building MCP: package with name ${siteName} not found`,
	);
	process.exit(1);
}

await $`bun run --filter=${pkgToBuild} build`;
await $`mv ./${FOLDER_OVERRIDES[siteName] || siteName}/dist ./dist`;
