/**
 * Blacklist of MCP servers that should be excluded from listings
 * Add server names here to filter them out from the registry results
 */

export const BLACKLISTED_SERVERS: string[] = [
  // Add server names here that you want to exclude
  // Examples:
  // "com.example/broken-server",
  // "ai.vendor/non-functional-mcp",
  "ai.smithery/brave", // CORS error
  "ai.alpic.test/test-mcp-server", // CORS error
  "ai.gomarble/mcp-api", // CORS error
  "ai.klavis/strata", // CORS error
  "ai.kubit/mcp-server", // CORS error
  "ai.packmind/mcp-server", // CORS error
  "ai.seltz/seltz-ai-seltz-mcp", // CORS error
  "ai.shawndurrani/mcp-merchant", // CORS error
  "ai.shawndurrani/mcp-registry", // CORS error
  "ai.smithery/222wcnm-bilistalkermcp", // CORS error
  "ai.smithery/Aman-Amith-Shastry-scientific_computation_mcp", // CORS error
  "ai.smithery/Artin0123-gemini-image-mcp-server", // CORS error
  "ai.smithery/BadRooBot-my_test_mcp", // CORS error
  "ai.smithery/BigVik193-reddit-ads-mcp-api", // CORS error
  "ai.smithery/BigVik193-reddit-user-mcp", // CORS error
  "ai.smithery/BowenXU0126-aistudio_hw3", // CORS error
  "ai.smithery/ChiR24-unreal_mcp", // CORS error
  "ai.smithery/CollectiveSpend-collectivespend-smithery-mcp", // CORS error
  "ai.smithery/Danushkumar-V-mcp-discord", // CORS error
  "ai.smithery/DynamicEndpoints-m365-core-mcp", // CORS error
  "ai.smithery/DynamicEndpoints-powershell-exec-mcp-server", // CORS error
  "ai.smithery/RectiFlex-centerassist-mcp-cp1", // CORS error
  "ai.smithery/FelixYifeiWang-felix-mcp-smithery", // CORS error
  "ai.smithery/Funding-Machine-ghl-mcp-fundingmachine", // CORS error
  "ai.smithery/Hint-Services-obsidian-github-mcp", // CORS error
  "ai.smithery/IlyaGusev-academia_mcp", // CORS error
  "ai.smithery/IndianAppGuy-magicslide-mcp", // CORS error
  "ai.smithery/JMoak-chrono-mcp", // CORS error
  "ai.smithery/JunoJunHyun-festival-finder-mcp", // CORS error
  "ai.smithery/Kim-soung-won-mcp-smithery-exam", // CORS error
  "ai.smithery/Kryptoskatt-mcp-server", // CORS error
  "ai.smithery/Leghis-smart-thinking", // CORS error
  "ai.smithery/LinkupPlatform-linkup-mcp-server", // CORS error
  "ai.smithery/MetehanGZL-pokemcp", // CORS error
  "ai.smithery/MisterSandFR-supabase-mcp-selfhosted", // CORS error
  "ai.smithery/Nekzus-npm-sentinel-mcp", // CORS error
  "ai.smithery/Open-Scout-mcp", // CORS error
  "ai.smithery/PabloLec-keyprobe-mcp", // CORS error
  "ai.smithery/Parc-Dev-task-breakdown-server", // CORS error
  "ai.smithery/Phionx-mcp-hello-server", // CORS error
  "ai.smithery/PixdataOrg-coderide", // CORS error
  "ai.smithery/ProfessionalWiki-mediawiki-mcp-server", // CORS error
  "ai.smithery/RectiFlex-centerassist-mcp", // CORS error
  "ai.smithery/RectiFlex-centerassist-mcp-cp", // CORS error
  "ai.smithery/RectiFlex-centerassist-mcp1", // CORS error
  "ai.smithery/STUzhy-py_execute_mcp", // CORS error
  "ai.smithery/ScrapeGraphAI-scrapegraph-mcp", // CORS error
  "ai.smithery/TakoData-tako-mcp", // CORS error
  "ai.smithery/aamangeldi-dad-jokes-mcp", // CORS error
  "ai.smithery/adamamer20-paper-search-mcp-openai", // CORS error
  "ai.smithery/afgong-sqlite-mcp-server", // CORS error
  "ai.smithery/akilat-spec-leave-manager-mcp", // CORS error
  "ai.smithery/alex-llm-attack-mcp-server", // CORS error
  "ai.smithery/alphago2580-naramarketmcp", // CORS error
  "ai.smithery/anirbanbasu-frankfurtermcp", // CORS error
  "ai.smithery/anirbanbasu-pymcp", // CORS error
  "build.arca.mcp/arca-mcp-server", // CORS error
  "com.apify/apify-mcp-server", // token error
  "com.civic/nexus", // invalid scopes
  "com.figma.mcp/mcp", // CORS error
  "com.jepto/mcp", // com.gojinko.mcp/jinko
  "com.statsig/statsig-mcp-server", // oauth rederect to saas no mcp
  "io.catchmetrics.mcp/rum-analytics", // oauth  do serviço nao esta funcionando
  "io.github.mcp-fortress/mcp-fortress",
  "io.github.microsoft/EnterpriseMCP", //error "Authentication failed: Incompatible auth server: does not support dynamic client registration" but have support
  "io.ignission/mcp", // oauth  do serviço nao esta funcionando
  "live.alpic.mcpimmo-10e693d9/mcpimmo", // nao aparece botao de oauth

  // CORS or Server down
  "ai.smithery/arjunkmrm-mango-sago",
  "ai.smithery/arjunkmrm-perplexity-search",
  "ai.smithery/arjunkmrm-scrapermcp_el",
  "ai.smithery/arjunkmrm-time",
  "ai.smithery/arjunkmrm-tutorials",
  "ai.smithery/arjunkmrm-watch2",
  "ai.smithery/aryankeluskar-poke-video-mcp",
  "ai.smithery/bergeramit-bergeramit-hw3-tech",
  "ai.smithery/bergeramit-bergeramit-hw3-tech-1",
  "ai.smithery/bhushangitfull-file-mcp-smith",
  "ai.smithery/bielacki-igdb-mcp-server",
  "ai.smithery/blbl147-xhs-mcp",
  "ai.smithery/blockscout-mcp-server",
  "ai.smithery/brandonbosco-sigao-scf-mcp",
  "ai.smithery/browserbasehq-mcp-browserbase",
  "ai.smithery/callmybot-cookbook-mcp-server",
  "ai.smithery/callmybot-domoticz",
  "ai.smithery/callmybot-hello-mcp-server",
  "ai.smithery/cc25a-openai-api-agent-project123123123",
  "ai.smithery/cindyloo-dropbox-mcp-server",
  "ai.smithery/clpi-clp-mcp",
  "ai.smithery/cpretzinger-ai-assistant-simple",
  "ai.smithery/cristianoaredes-mcp-dadosbr",
  "ai.smithery/ctaylor86-mcp-video-download-server",
  "ai.smithery/cuongpo-coti-mcp",
  "ai.smithery/cuongpo-coti-mcp-1",
  "ai.smithery/data-mindset-sts-google-forms-mcp",
  "ai.smithery/devbrother2024-typescript-mcp-server-boilerplate",
  "ai.smithery/docfork-mcp",
  "ai.smithery/dsharipova-mcp-hw",
  "ai.smithery/duvomike-mcp",
  "ai.smithery/eliu243-oura-mcp-server",
  "ai.smithery/eliu243-oura-mcp-server-2",
  "ai.smithery/eliu243-oura-mcp-server-eliu",
  "ai.smithery/exa-labs-exa-code-mcp",
  "ai.smithery/faithk7-gmail-mcp",
  "ai.smithery/feeefapp-mcp",
  "ai.smithery/fengyinxia-jimeng-mcp",
  "ai.smithery/fitaf-ai-fitaf-ai-mcp",
  "ai.smithery/fitaf-ai-fitaf-mcp",
  "ai.smithery/flight505-mcp_dincoder",
  "ai.smithery/hithereiamaliff-mcp-datagovmy",
  "ai.smithery/hithereiamaliff-mcp-nextcloud",
  "ai.smithery/hjsh200219-pharminfo-mcp",
  "ai.smithery/hollaugo-financial-research-mcp-server",
  "ai.smithery/hustcc-mcp-mermaid",
  "ai.smithery/huuthangntk-claude-vision-mcp-server",
  "ai.smithery/infranodus-mcp-server-infranodus",
  "ai.smithery/isnow890-data4library-mcp",
  "ai.smithery/jekakos-mcp-user-data-enrichment",
  "ai.smithery/jenniferjiang0511-mit-ai-studio-hw3",
  "ai.smithery/jirispilka-actors-mcp-server",
  "ai.smithery/jjlabsio-korea-stock-mcp",
  "ai.smithery/jweingardt12-mlb_mcp",
  "ai.smithery/kaszek-kaszek-attio-mcp",
  "ai.smithery/keithah-hostex-mcp",
  "ai.smithery/keithah-tessie-mcp",
  "ai.smithery/keremurat-json",
  "ai.smithery/keremurat-jsonmcp",
  "ai.smithery/keremurat-mcp",
  "ai.smithery/kesslerio-attio-mcp-server",
  "ai.smithery/kesslerio-attio-mcp-server-beta",
  "ai.smithery/kirbah-mcp-youtube",
  "ai.smithery/kkjdaniel-bgg-mcp",
  "ai.smithery/kodey-ai-mapwise-mcp",
  "ai.smithery/kodey-ai-salesforce-mcp",
  "ai.smithery/kodey-ai-salesforce-mcp-kodey",
  "ai.smithery/kodey-ai-salesforce-mcp-minimal",
  "ai.smithery/kodey-ai-salesforce-mcp-server",
  "ai.smithery/kwp-lab-rss-reader-mcp",
  "ai.smithery/leandrogavidia-vechain-mcp-server",
  "ai.smithery/lineex-pubmed-mcp-smithery",
  "ai.smithery/lukaskostka99-marketing-miner-mcp",
  "ai.smithery/luminati-io-brightdata-mcp",
  "ai.smithery/magenie33-quality-dimension-generator",
  "ai.smithery/mayla-debug-mcp-google-calendar2",
  "ai.smithery/mfukushim-map-traveler-mcp",
  "ai.smithery/miguelgarzons-mcp-cun",
  "ai.smithery/minionszyw-bazi",
  "ai.smithery/mjucius-cozi_mcp",
  "ai.smithery/morosss-sdfsdf",
  "ai.smithery/motorboy1-my-mcp-server",
  "ai.smithery/mrugankpednekar-bill_splitter_mcp",
  "ai.smithery/mrugankpednekar-mcp-optimizer",
  "ai.smithery/neverinfamous-memory-journal-mcp",
  "ai.smithery/oxylabs-oxylabs-mcp",
  "ai.smithery/pinion05-supabase-mcp-lite",
  "ai.smithery/pinkpixel-dev-web-scout-mcp",
  "ai.smithery/plainyogurt21-clintrials-mcp",
  "ai.smithery/plainyogurt21-sec-edgar-mcp",
  "ai.smithery/proflulab-documentassistant",
  "ai.smithery/pythondev-pro-egw_writings_mcp_server",
  "ai.smithery/rainbowgore-stealthee-mcp-tools",
  "ai.smithery/ramadasmr-networkcalc-mcp",
  "ai.smithery/ref-tools-ref-tools-mcp",
  "ai.smithery/renCosta2025-context7fork",
  "ai.smithery/rfdez-pvpc-mcp-server",
  "ai.smithery/sachicali-discordmcp-suite",
  "ai.smithery/saidsef-mcp-github-pr-issue-analyser",
  "ai.smithery/samihalawa-whatsapp-go-mcp",
  "ai.smithery/sasabasara-where_is_my_bus_mcp",
  "ai.smithery/sebastianall1977-gmail-mcp",
  "ai.smithery/serkan-ozal-driflyte-mcp-server",
  "ai.smithery/shoumikdc-arxiv-mcp",
  "ai.smithery/skr-cloudify-clickup-mcp-server-new",
  "ai.smithery/slhad-aha-mcp",
  "ai.smithery/smithery-ai-cookbook-python-quickstart",
  "ai.smithery/smithery-ai-cookbook-ts-smithery-cli",
  "ai.smithery/smithery-ai-fetch",
  "ai.smithery/smithery-ai-github",
  "ai.smithery/smithery-ai-national-weather-service",
  "ai.smithery/smithery-ai-slack",
  "ai.smithery/smithery-notion",
  "ai.smithery/smithery-toolbox",
  "ai.smithery/sunub-obsidian-mcp-server",
  "ai.smithery/szge-lolwiki-mcp",
  "ai.smithery/truss44-mcp-crypto-price",
  "ai.smithery/turnono-datacommons-mcp-server",
  "ai.smithery/wgong-sqlite-mcp-server",
  "ai.smithery/xinkuang-china-stock-mcp",
  "ai.smithery/yuhuison-mediawiki-mcp-server-auth",
  "ai.smithery/yuna0x0-anilist-mcp",
  "ai.smithery/yuna0x0-hackmd-mcp",
  "ai.smithery/zeta-chain-cli",
  "ai.smithery/zhaoganghao-hellomcp",
  "ai.smithery/zwldarren-akshare-one-mcp",
  "ai.waystation/airtable",
  "ai.waystation/gmail",
  "ai.waystation/jira",
  "ai.waystation/mcp",
  "ai.waystation/miro",
  "ai.waystation/monday",
  "ai.waystation/office",
  "ai.waystation/postgres",
  "ai.waystation/slack",
  "ai.waystation/supabase",
  "ai.waystation/teams",
  "ai.waystation/wrike",
  "app.tradeit/mcp",
  "app.zenable/zenable",
  "biz.icecat/mcp",
  "ch.martinelli/jooq-mcp",
  "ch.pfx/mcp-server",
  "co.contraption/mcp",
  "co.thisdot.docusign-navigator/mcp",
  "com.1stdibs/1stDibs",
  "com.adspirer/ads",
  "com.appsflyer/mcp",
  "com.aribadernatal/sideways",
  "com.biodnd/agent-fin",
  "com.biodnd/agent-ip",
  "com.biodnd/agent-press",
  "com.brokerchooser/broker-safety",
  "com.bullpenstrategygroup.rotunda/mcp",
  "com.close/close-mcp",
  "com.consulatehq/consulate",
  "com.devopness.mcp/server",
  "com.dillilabs.deva/dilli-email-validation-api-server",
  "com.driflyte/driflyte-mcp-server",
  "com.epidemicsound/mcp-server",
  "com.findyourfivepm/mcp-server",
  "com.getunblocked/unblocked-mcp",
  "com.gibsonai/mcp",
  "com.glean/mcp",
  "com.hellobasestation/pdfkit",
  "com.infobip/mcp",
  "com.jumpcloud/jumpcloud-genai",
  "com.keboola/mcp",
  "com.make/mcp-server",
  "com.mcpbundles/agent-interviews",
  "com.mcpbundles/hub",
  "com.medusajs/medusa-mcp",
  "com.monikaskorykow/workshops",
  "com.mux/mcp",
  "com.newrelic/mcp-server",
  "com.peek/mcp",
  "com.pga/pga-golf",
  "com.predictleads/mcp",
  "com.qualityclouds/mcp-server-qualityclouds",
  "com.redpanda/docs-mcp",
  "com.smartling/smartling-mcp-server",
  "com.sonatype/dependency-management-mcp-server",
  //"com.stackoverflow.mcp/mcp",
  "com.streamlinehq/mcp",
  "com.stripe/mcp",
  "com.supabase/mcp",
  "com.teamwork/mcp",
  "com.textarttools/textarttools-mcp",
  "com.timeslope/timeslope-mcp",
  //"com.vercel/vercel-mcp",
  "com.webflow/mcp",
  "com.webforj/mcp",
  "com.windowsforum/mcp-server",
  "dev.anotherai/anotherai",
  "dev.augments/mcp",
  "dev.composio.rube/rube",
  "dev.continue/docs",
  "dev.lingo/main",
  "dev.looptool/looptool",
  "dev.ohmyposh/validator",
  "dev.storage/mcp",
  "directory.brick/mcp",
  "finance.double.agent4/knowledge-base",
  "garden.stanislav.svelte-llm/svelte-llm-mcp",
  "goog.workspace-developer/developer-tools",
  "host.justcall.mcp/justcall-mcp-server",
  "info.mosaique/mcp",
  "io.balldontlie/mcp",
  "io.coupler/remote-mcp-server",
  "io.foqal/Foqal",
  "io.fusionauth/mcp-docs",
  "io.github.ONLYOFFICE/docspace",
  "io.github.PayRam/payram-helper-mcp",
  "io.github.SELISEdigitalplatforms/l0-py-blocks-mcp",
  "io.github.Speeron-Polska/speeron-next",
  "io.github.TranThienTrong/asset-auto-generator",
  "io.github.abhijitjavelin/javelin-guardrails-mcp-server",
  "io.github.ax-platform/ax-platform",
  "io.github.bahfahh/noteit-mcp",
  "io.github.bitrix24/bitrix-mcp-rest",
  "io.github.equilibrium-team/tweekit",
  "io.github.humanjesse/textarttools-mcp",
  "io.github.isakskogstad/kolada-mcp",
  "io.github.isakskogstad/oecd-mcp",
  "io.github.jfrog/jfrog-mcp-server",
  "io.github.lio1204/what2watch-mcp",
  "io.github.mcpcentral-io/mcp-time",
  "io.github.meloncafe/chromadb-remote-mcp",
  "io.github.mia-platform/console-mcp-server",
  "io.github.perplexityai/mcp-server",
  "io.github.promplate/hmr",
  "io.github.ptyagiegnyte/egnyte-remote",
  "io.github.semilattice-research/mcp",
  "io.github.sharksalesinfo-blip/portfolio",
  "io.github.timescale/pg-aiguide",
  "io.github.tonymaynard97/blockscholes-mcp-server",
  "io.github.youdotcom-oss/mcp",
  "io.globalping/mcp",
  "io.opsera/opsera",
  //"io.prisma/mcp",
  "io.snapcall/mcp",
  "io.trunk/mcp-server",
  "io.tweekit/mcp",
  "md.install/try",
  "net.singular/mcp-server",
  "net.todoist/mcp",
  "org.aquaview/aquaview-mcp",
  "org.io-aerospace/mcp-server",
  "technology.draup/api-server",
  "tools.ref/ref-tools-mcp",
  "uno.platform/uno",

  // Not found (404)
  "ai.smithery/BigVik193-reddit-ads-mcp",
  "ai.smithery/ChiR24-unreal_mcp_server",
  "ai.smithery/CryptoCultCurt-appfolio-mcp-server",
  "ai.smithery/DynamicEndpoints-autogen_mcp",
  "ai.smithery/HARJAP-SINGH-3105-splitwise_mcp",
  "ai.smithery/ImRonAI-mcp-server-browserbase",
  "ai.smithery/a-ariff-canvas-instant-mcp",
  "ai.smithery/aicastle-school-openai-api-agent-project",
  "ai.smithery/aicastle-school-openai-api-agent-project11",
  "ai.smithery/airmang-hwpx-mcp",
  "ai.smithery/arjunkmrm-ahoy",
  "ai.smithery/arjunkmrm-ahoy2",
  "ai.smithery/arjunkmrm-boba-tea",
  "ai.smithery/arjunkmrm-bobo",
  "ai.smithery/arjunkmrm-brave-search-mcp-server",
  "ai.smithery/arjunkmrm-clock",
  "ai.smithery/arjunkmrm-fetch",
  "ai.smithery/arjunkmrm-lta-mcp",
  "com.fenetresurciel.verylongmcp/mcp-server-template-nodejs",
  "com.pearl.mcp/pearl-api-mcp-server",
  "live.alpic.email-mcp-400f7a0b/email-mcp",
  "live.alpic.email-mcp-8d084a7a/email-mcp",
  "live.alpic.email-mcp-ded4e7db/email-mcp",
  "live.alpic.send-email-49a8d7ee/send-email",
  "live.alpic.staging.alpic-poc-frontend-c68d130f/alpic-poc-frontend",
  "live.alpic.staging.email-mcp-c880a7f7/email-mcp",
  "live.alpic.staging.mcp-server-a2d17427/mcp-server",
  "live.alpic.staging.mcp-server-template--1488dac2/mcp-server-template-nodejs",
  "live.alpic.staging.mcp-server-template-5eacc5c3/mcp-server-template",
  "live.alpic.staging.mcp-server-template-7b99436a/mcp-server-template",
  "live.alpic.staging.mcp-server-template-8068f74b/mcp-server-template",
  "live.alpic.staging.mcp-server-template-90a89880/mcp-server-template",
  "live.alpic.staging.mcp-server-template-99cbcf02/mcp-server-template",
  "live.alpic.staging.mcp-template-e37c5898/mcp-template",
  "live.alpic.staging.node-email-mcp-25ea0992/node-email-mcp",
  "live.alpic.staging.node-email-mcp-731b03b7/node-email-mcp",
  "live.alpic.staging.node-email-mcp-a629b9bc/node-email-mcp",
  "live.alpic.staging.property-search-mcp-ce598409/property-search-mcp",
  "live.alpic.staging.server-template-3b6131fe/server-template",
  "live.alpic.staging.system-prompts-of-ai-987eba72/my-mcp-server",
  "live.alpic.staging.template-0f352e26/template",
  "live.alpic.staging.template-nodejs-d3cd3099/template-nodejs",
  "live.alpic.staging/alpic-poc-frontend-9eb5bfc8",
  "live.alpic.staging/mcp-server-template--43874b8f",
  "live.alpic.staging/mcp-server-template--de51cc9a",
  "live.alpic.staging/node-email-mcp-59eeb419",
  "live.alpic.staging/node-email-mcp-ea33e576",
  "live.alpic.staging/send-email-mcp-01f22b8f",
  "live.alpic.template-server-8e74ee32/template-server",
  "live.alpic.template-server-ed7df515/template-server",
  "net.nymbo/tools",

  // 401 + OAuth CORS (OAuth metadata inaccessible)
  "ai.cirra/salesforce-mcp",
  "ai.explorium/mcp-explorium",
  "ai.tickettailor/mcp",
  "app.getdialer/dialer",
  "app.linear/linear",
  "app.thoughtspot/mcp-server",
  "ci.git/mymlh-mcp-server",
  "co.axiom/mcp",
  "com.atlassian/atlassian-mcp-server",
  "com.devcycle/mcp",
  "com.dotprompts/dotprompts",
  "com.gitlab/mcp",
  "com.mintmcp/gcal",
  "com.mintmcp/gmail",
  "com.mintmcp/outlook-calendar",
  "com.mintmcp/outlook-email",
  //"com.monday/monday.com",
  //"com.paypal.mcp/mcp",
  "com.unifiedoffer/mcp-server",
  //"com.wix/mcp",
  "io.github.MindscapeHQ/mcp-server-raygun",
  "io.github.github/github-mcp-server",
  "io.wordlift/mcp-server",
  "trade.neglect/mcp-server",

  // Auth required (no OAuth available)
  "com.generect/generect-mcp",
  "com.onkernel/kernel-mcp-server",
  "com.postman/postman-mcp-server",
  "com.telerik/agentic-ui-generator-for-angular",

  // Timeout
  "io.github.elankeeran/companies-house-mcp",
  "net.gepuro.mcp-company-lens-v1/company-lens-mcp-registry",
];
