// Runs the collector locally without the serverless time limit.
//   npm run collect                → one big run (up to 15 minutes, 300 pending channels)
//   npm run collect -- --minutes 5 → shorter run
import "dotenv/config";
import { runCollector } from "../src/lib/collector";
import { pg } from "../src/db";

async function main() {
  const i = process.argv.indexOf("--minutes");
  const minutes = i > -1 ? Number(process.argv[i + 1]) : 15;
  console.log(`Collecting for up to ${minutes} minutes…`);
  const report = await runCollector({ maxMs: minutes * 60_000, maxPending: 300, maxRefresh: 200 });
  console.table(report);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pg.end());
