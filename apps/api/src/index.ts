import { app } from "./app";
import { pool } from "./database";
import { env } from "./env";
// Long-running work belongs to the independently restarted generation worker.
try {
  await pool.query("select 1 from drishya.generation_job limit 1");
} catch {
  console.error("Apply pending database migrations before starting Drishya.");
  await pool.end();
  process.exit(1);
}
const server = app.listen(env.PORT, () => {
  console.info(`Drishya API listening on http://localhost:${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
