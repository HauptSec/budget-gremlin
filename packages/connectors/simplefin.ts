import { lookup } from "node:dns/promises";
import { cents } from "../domain/index.ts";
export type RemoteAccount = {
  id: string;
  name: string;
  currency: string;
  balance: string;
  "balance-date": number;
  transactions?: {
    id: string;
    posted: number;
    transacted_at?: number;
    amount: string;
    description: string;
    pending?: boolean;
  }[];
};
export type AccountSet = {
  accounts: RemoteAccount[];
  errlist?: { code: string; msg: string }[];
  errors?: string[];
};
export interface ConnectorProvider {
  claim(token: string): Promise<string>;
  fetch(access: string, start: string, end: string): Promise<AccountSet>;
}
export async function validateUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    !["bridge.simplefin.org", "beta-bridge.simplefin.org"].includes(
      url.hostname,
    ) ||
    (url.port && url.port !== "443")
  )
    throw new Error("Only the official SimpleFIN HTTPS hosts are allowed");
  const addresses = await lookup(url.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((a) =>
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::|fc|fd|fe80)/i.test(
        a.address,
      ),
    )
  )
    throw new Error("Provider address is not public");
  return url;
}
async function request(raw: string, init: RequestInit = {}) {
  const url = await validateUrl(raw);
  const auth = url.username
    ? Buffer.from(
        decodeURIComponent(url.username) +
          ":" +
          decodeURIComponent(url.password),
      ).toString("base64")
    : undefined;
  url.username = "";
  url.password = "";
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      ...init.headers,
      ...(auth ? { Authorization: "Basic " + auth } : {}),
    },
  });
  if (!response.ok)
    throw new Error(
      response.status === 402
        ? "payment_required"
        : response.status === 403
          ? "authorization_expired"
          : response.status === 429
            ? "rate_limited"
            : "provider_unavailable",
    );
  return response;
}
export const simplefin: ConnectorProvider = {
  async claim(setup) {
    let raw: string;
    try {
      raw = Buffer.from(setup.trim(), "base64").toString("utf8");
    } catch {
      throw new Error("Invalid setup token");
    }
    const url = await validateUrl(raw);
    if (!url.pathname.includes("/claim/")) throw new Error("Invalid claim URL");
    const response = await request(url.href, {
      method: "POST",
      headers: { "Content-Length": "0" },
    });
    const access = (await response.text()).trim();
    await validateUrl(access);
    return access;
  },
  async fetch(access, start, end) {
    const url = new URL(access);
    url.pathname = url.pathname.replace(/\/$/, "") + "/accounts";
    url.searchParams.set(
      "start-date",
      String(Math.floor(+new Date(start + "T00:00:00Z") / 1000)),
    );
    url.searchParams.set(
      "end-date",
      String(Math.floor(+new Date(end + "T00:00:00Z") / 1000)),
    );
    url.searchParams.set("pending", "1");
    const data = (await (await request(url.href)).json()) as AccountSet;
    if (!Array.isArray(data.accounts))
      throw new Error("invalid_provider_response");
    for (const a of data.accounts) {
      cents(a.balance);
      for (const t of a.transactions || []) cents(t.amount);
    }
    return data;
  },
};
