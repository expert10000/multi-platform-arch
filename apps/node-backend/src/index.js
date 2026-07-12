import { join } from "node:path";
import { createServer } from "./server.js";
import { createSqlitePlatform } from "../../../packages/platform/src/index.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const databasePath = process.env.DZONE_DATABASE_PATH ?? join(process.cwd(), "data", "platform.sqlite");
const platform = createSqlitePlatform({ databasePath });
const server = createServer(platform);
platform.workers.jobs.start();

function shutdown() {
  platform.workers.jobs.stop();
  server.close(() => {
    platform.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, () => {
  console.log(`DZONE shared platform API listening on http://localhost:${port}`);
});
