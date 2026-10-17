import { Store, uid } from "../apps/api/db.ts";
import { hashPassword } from "../apps/api/security.ts";
import { seed } from "./seed.ts";
import { createBackup, restoreBackup } from "../apps/api/backup.ts";
import { createServer } from "../apps/api/server.ts";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
try {
  process.loadEnvFile(".env");
} catch {
  /* optional local config */
}
const command = process.argv[2];
if (command === "restore") {
  if (!process.argv[3] || !process.argv[4])
    throw new Error("Usage: npm run restore -- BACKUP NEW_DATABASE_PATH");
  console.log(await restoreBackup(process.argv[3], process.argv[4]));
  process.exit(0);
}
const s = new Store(process.env.DATABASE_PATH || "data/budget-gremlin.sqlite");
try {
  if (command === "setup" || command === "seed") {
    if (s.db.prepare("SELECT id FROM users LIMIT 1").get())
      throw new Error("Installation already has users; setup is disabled");
    const password = process.env.ADMIN_PASSWORD;
    if (!password)
      throw new Error(
        "Set ADMIN_PASSWORD (12+ characters) in your environment for this command only.",
      );
    if (command === "seed") {
      await seed(s, password);
      console.log(
        "Synthetic demo created. Sign in as demo@budgetgremlin.local using ADMIN_PASSWORD.",
      );
    } else {
      const email = process.env.ADMIN_EMAIL;
      if (!email) throw new Error("Set ADMIN_EMAIL for initial owner.");
      const name = process.env.ADMIN_NAME || "Owner";
      s.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?,0)")
        .run(
          uid(),
          email.toLowerCase(),
          name,
          "owner",
          await hashPassword(password),
        );
      console.log("Owner created. Further users can join by invitation.");
    }
  } else if (command === "backup")
    console.log("Encrypted backup:", await createBackup(s));
  else if (command === "openapi") {
    const app = await createServer(s, { serveStatic: false });
    await app.ready();
    writeFileSync("docs/openapi.json", JSON.stringify(app.swagger(), null, 2));
    await app.close();
    console.log("Wrote docs/openapi.json");
  } else throw new Error("Commands: setup, seed, backup, restore, openapi");
} finally {
  s.close();
}
