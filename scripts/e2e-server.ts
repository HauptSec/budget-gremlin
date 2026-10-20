import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../apps/api/db.ts";
import { seed } from "./seed.ts";
import { createServer } from "../apps/api/server.ts";
const directory = mkdtempSync(join(tmpdir(), "gremlin-e2e-"));
const store = new Store(join(directory, "test.sqlite"));
await seed(store, "gremlin-test-password");
const app = await createServer(store, {
  origin: "http://127.0.0.1:4173",
  rateLimitMax: 10000,
  loginRateLimitMax: 1000, // Synthetic browser suite signs in once per test.
});
await app.listen({ host: "127.0.0.1", port: 4173 });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    store.close();
    process.exit(0);
  });
