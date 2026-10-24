// One-time (or occasional) seeding of the Tamil channel database.
//   npm run seed            → ~30 channel searches (~3,000 quota units) + trending charts
//   npm run seed -- --deep  → also searches recent popular videos (~6,000 units total)
// Then run `npm run collect` a few times (or let the daily cron do it) to fetch them.
import "dotenv/config";
import { discoverFromTrending, pendingCount, seedDiscovery } from "../src/lib/collector";
import { pg } from "../src/db";

async function main() {
  const deep = process.argv.includes("--deep");
  console.log(`Seeding Tamil channels${deep ? " (deep)" : ""}…`);
  const fromSearch = await seedDiscovery({ includeRecentVideos: deep });
  console.log(`  queued ${fromSearch} channels from search`);
  const fromTrending = await discoverFromTrending();
  console.log(`  queued ${fromTrending} channels from trending charts`);
  console.log(`Pending channels waiting to be fetched: ${await pendingCount()}`);
  console.log("Next: run `npm run collect` to fetch them (repeat until pending is 0).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pg.end());
