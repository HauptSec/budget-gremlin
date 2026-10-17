import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 200)
    throw new Error("Password must be 12–200 characters");
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function checkPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export function encryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error("Configure ENCRYPTION_KEY with 32 random bytes in hex");
  return Buffer.from(key, "hex");
}
export function seal(value: string, key = encryptionKey()) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("hex"),
    tag: c.getAuthTag().toString("hex"),
    data: data.toString("base64"),
  });
}
export function unseal(value: string, key = encryptionKey()) {
  const o = JSON.parse(value);
  if (o.v !== 1) throw new Error("Unsupported encrypted format");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(o.iv, "hex"));
  d.setAuthTag(Buffer.from(o.tag, "hex"));
  return Buffer.concat([
    d.update(Buffer.from(o.data, "base64")),
    d.final(),
  ]).toString("utf8");
}
