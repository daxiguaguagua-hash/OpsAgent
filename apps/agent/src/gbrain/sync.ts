import { InMemoryGBrainClient } from "./in-memory-client.js";
import { listSyncable, loadSources } from "./sources.js";

async function main() {
  const sourceFilter = process.argv[2];
  const sources = loadSources();
  const client = new InMemoryGBrainClient();
  const targets = sourceFilter
    ? sources.filter((s) => s.id === sourceFilter)
    : listSyncable(sources);
  let total = 0;
  for (const source of targets) {
    const result = await client.syncSource(source.id);
    total += result.synced;
    console.log(`[gbrain:sync] ${source.id} → synced ${result.synced} chunks`);
  }
  console.log(`[gbrain:sync] total synced: ${total}`);
}

main().catch((error) => {
  console.error("[gbrain:sync] failed:", error);
  process.exit(1);
});
