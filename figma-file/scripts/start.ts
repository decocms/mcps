const proc = Bun.spawn(
  ["deco", "link", "-p", "3001", "--", "bun", "run", "dev"],
  {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
  },
);

const decoder = new TextDecoder();

function printWithMcpUrl(text: string, write: (s: string) => void) {
  write(text);
  const match = text.match(/Preview: (https:\/\/[^\s]+)/);
  if (match) {
    process.stdout.write(`   -> 🔗 MCP URL: ${match[1]}/api/mcp\n`);
  }
}

await Promise.all([
  (async () => {
    for await (const chunk of proc.stdout) {
      printWithMcpUrl(decoder.decode(chunk), (s) => process.stdout.write(s));
    }
  })(),
  (async () => {
    for await (const chunk of proc.stderr) {
      printWithMcpUrl(decoder.decode(chunk), (s) => process.stderr.write(s));
    }
  })(),
]);
