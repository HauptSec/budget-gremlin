import { scheduledAi } from "./ai.ts";
import { Store } from "./db.ts";
import { createServer } from "./server.ts";
import { publicConnections, syncConnection } from "./sync.ts";
import { createBackup } from "./backup.ts";
try {
  process.loadEnvFile(".env");
} catch {
  /* optional config */
}
const store = new Store(
  process.env.DATABASE_PATH || "data/budget-gremlin.sqlite",
);
if (
  process.env.NODE_ENV === "production" &&
  process.env.SECURE_COOKIES !== "true"
)
  throw new Error(
    "Production requires SECURE_COOKIES=true and an HTTPS reverse proxy",
  );
const app = await createServer(store);
await app.listen({
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
});
console.log(
  `Budget Gremlin listening on ${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3001}`,
);
let working = false;
const timer = setInterval(async () => {
  if (working) return;
  working = true;
  try {
    for (const c of publicConnections(store))
      if (c.next_run && c.next_run < Date.now())
        await syncConnection(store, c.id).catch(() =>
          console.warn("Bank sync requires attention; see Settings."),
        );
    await scheduledAi(store);
    const day = new Date().toISOString().slice(0, 10);
    if (
      process.env.ENCRYPTION_KEY &&
      store.get("jobs", "backup")?.day !== day
    ) {
      await createBackup(store);
      store.put("jobs", "backup", { day });
    }
  } catch {
    console.warn(
      "Scheduled job failed; check backup and connection configuration.",
    );
  } finally {
    working = false;
  }
}, 60000);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    clearInterval(timer);
    await app.close();
    store.close();
    process.exit(0);
  });
