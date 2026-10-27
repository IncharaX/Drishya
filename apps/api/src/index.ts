import { app } from "./app";
import { pool } from "./database";
import { env } from "./env";
import { recoverInterruptedPlans, stopPlanning } from "./planning/service";
import { recoverInterruptedVoiceovers, stopVoiceovers } from "./speech/service";
import {
  recoverInterruptedStoryboards,
  stopStoryboards,
} from "./storyboards/service";

try {
  await recoverInterruptedPlans();
  await recoverInterruptedStoryboards();
  await recoverInterruptedVoiceovers();
} catch {
  console.error(
    "Could not initialize project storage. Check the database connection and apply pending migrations.",
  );
  await pool.end();
  process.exit(1);
}
const server = app.listen(env.PORT, () => {
  console.info(`Drishya API listening on http://localhost:${env.PORT}`);
});

function shutdown() {
  server.close(() => {
    void Promise.all([stopPlanning(), stopStoryboards(), stopVoiceovers()])
      .finally(() => pool.end())
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
