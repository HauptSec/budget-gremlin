import { backup } from "node:sqlite";
import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  readdir,
  copyFile,
} from "node:fs/promises";
import { join, basename } from "node:path";
import { Store } from "./db.ts";
import { seal, unseal, encryptionKey } from "./security.ts";
export async function createBackup(
  s: Store,
  dir = process.env.BACKUP_DIR || "backups",
) {
  encryptionKey();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const name = `gremlin-${new Date().toISOString().replaceAll(":", "-")}.encrypted`,
    temp = join(dir, name + ".tmp");
  await backup(s.db, temp);
  try {
    const bytes = await readFile(temp);
    await writeFile(join(dir, name), seal(bytes.toString("base64")), {
      mode: 0o600,
    });
  } finally {
    await unlink(temp).catch(() => {});
  }
  const list = (await readdir(dir))
    .filter((n) => n.endsWith(".encrypted"))
    .sort()
    .reverse();
  const keep = new Set(list.slice(0, 14));
  const weeks = new Set<string>();
  for (const n of list) {
    const date = new Date(n.slice(8, 18));
    const week = String(Math.floor(+date / (7 * 86400000)));
    if (!weeks.has(week) && weeks.size < 8) {
      weeks.add(week);
      keep.add(n);
    }
  }
  for (const n of list) if (!keep.has(n)) await unlink(join(dir, n));
  if (process.env.BACKUP_COPY_DIR) {
    await mkdir(process.env.BACKUP_COPY_DIR, { recursive: true });
    await copyFile(
      join(dir, name),
      join(process.env.BACKUP_COPY_DIR, basename(name)),
    );
  }
  return name;
}
export async function restoreBackup(file: string, destination: string) {
  const encoded = unseal(await readFile(file, "utf8"));
  await writeFile(destination, Buffer.from(encoded, "base64"), {
    flag: "wx",
    mode: 0o600,
  });
  const restored = new Store(destination);
  try {
    const check = restored.db.prepare("PRAGMA integrity_check").get();
    if (check?.integrity_check !== "ok")
      throw new Error("Restored database failed integrity check");
    return {
      transactions: restored.txs().length,
      accounts: restored.accounts().length,
    };
  } finally {
    restored.close();
  }
}
