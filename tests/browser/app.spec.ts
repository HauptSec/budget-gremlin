import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function login(page: any) {
  await page.goto("/");
  await page.getByLabel("Email address").fill("demo@budgetgremlin.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill("gremlin-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little clearer, Demo." }),
  ).toBeVisible();
}
test("household journey: overview, transactions, create/edit, budget, report drilldown", async ({
  page,
}) => {
  await login(page);
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page
    .getByLabel("Merchant", { exact: true })
    .fill("Browser fixture coffee");
  await page.getByLabel("Amount", { exact: true }).fill("-12.34");
  await page.getByLabel("Category 1", { exact: true }).selectOption("dining");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search transactions").fill("Browser fixture");
  await expect(
    page.getByRole("button", { name: /Browser fixture coffee/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Browser fixture coffee/ }).click();
  await page.getByLabel("Notes").fill("Verified in a real browser");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Budget", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your category plan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page.getByLabel("Groceries allocation", { exact: true }).fill("700");
  await page.getByRole("button", { name: "Save monthly plan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer perspective." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Spending \$/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Exact total" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: "test-results/reports-desktop.png",
    fullPage: true,
  });
});
test("CSV import is previewed and reimport does not duplicate", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page.getByRole("button", { name: "Import CSV" }).click();
  const csv =
    "Date,Name,Amount\n2026-09-01,Playwright CSV shop,-25.12\n2026-09-02,Playwright CSV refund,5.00";
  await page.getByLabel("CSV statement").setInputFiles({
    name: "fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Preview mapping" }).click();
  await expect(page.getByText("2 valid rows")).toBeVisible();
  await page.getByRole("button", { name: "Import valid rows" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search transactions").fill("Playwright CSV");
  await expect(
    page.getByRole("button", { name: /Playwright CSV shop/ }),
  ).toBeVisible();
});
test("mobile shell and accessibility", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});
test("logout protects the ledger and service worker never caches financial API", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  const r = await page.request.get("/api/v1/transactions");
  expect(r.status()).toBe(401);
  const cacheUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const n of names) {
      const c = await caches.open(n);
      urls.push(...(await c.keys()).map((r) => r.url));
    }
    return urls;
  });
  expect(cacheUrls.some((u) => u.includes("/api/"))).toBe(false);
});

test("all main screens meet automated contrast/accessibility checks in both themes", async ({
  page,
}) => {
  await login(page);
  const violations: any[] = [];
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    for (const name of [
      "Overview",
      "Transactions",
      "Budget",
      "Recurring plans",
      "Calendar",
      "Reports",
      "Accounts",
      "AI assistant",
      "Settings",
    ]) {
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name, exact: true })
        .click();
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText("Gathering the details…")).toHaveCount(0);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      violations.push(
        ...result.violations.map((v) => ({
          theme,
          page: name,
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            message: n.failureSummary,
          })),
        })),
      );
    }
  }
  expect(violations).toEqual([]);
});
test("rule editor, settings and keyboard dialog behavior", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await page
    .getByLabel("Rule name", { exact: true })
    .fill("Browser grocery rule");
  await page.getByLabel("Condition 1 value").fill("Market");
  await page.getByLabel("Assign category").selectOption("groceries");
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(
    page.getByText("Browser grocery rule", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview existing matches" }).click();
  await expect(
    page.getByRole("button", { name: "Apply preview" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Household name").fill("Browser household");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved");
});
test("360px layouts and vector app icons", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page);
  for (const name of [
    "Transactions",
    "Budget",
    "Recurring plans",
    "Calendar",
    "Reports",
    "Accounts",
    "Settings",
  ]) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 360);
  }
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.goto("/gremlin.svg");
    await page
      .locator("svg")
      .screenshot({ path: `apps/web/public/icon-${size}.png` });
  }
});

test("first-time bank linking offers creation instead of submitting a null account", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/v1/meta", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, accounts: [] } });
  });
  await page.route("**/api/v1/connections", (route) =>
    route.fulfill({
      json: [{ id: "fixture", start: "2025-01-01", error: null }],
    }),
  );
  await page.route("**/api/v1/connections/fixture/accounts", (route) =>
    route.fulfill({ json: [{ id: "remote", name: "Bank savings" }] }),
  );
  let linked = false;
  await page.route("**/api/v1/connections/fixture/link", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.provider_id).toBe("remote");
    expect(body.new_account.type).toBe("savings");
    expect(body.account_id).toBeUndefined();
    linked = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Bank connections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Link accounts", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Link account", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Local account", { exact: true }).selectOption("new");
  await page
    .getByLabel("Account type", { exact: true })
    .selectOption("savings");
  await page
    .getByRole("button", { name: "Create and link", exact: true })
    .click();
  await expect.poll(() => linked).toBe(true);
});

test("AI workspace supports local memory and confirmed recurring budget proposals", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "AI assistant", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meet your money gremlin." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page
    .getByLabel("Household budgeting preferences")
    .fill("Prefer a separate grocery budget.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(page.getByLabel("Household budgeting preferences")).toHaveValue(
    "Prefer a separate grocery budget.",
  );
  await page.getByRole("button", { name: "Recurring", exact: true }).click();
  await page.getByLabel("Item name").fill("Test monthly rent");
  await page.getByLabel("Monthly amount (USD)").fill("1200");
  await page
    .getByLabel("Planning category", { exact: true })
    .selectOption("housing");
  await page
    .getByRole("button", { name: "Save recurring item", exact: true })
    .click();
  await expect(
    page.getByText("Test monthly rent", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Propose budget from recurring items",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review proposed changes" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review proposed changes" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("recurring plans populate budgets and calendar supports matching, unlinking and mobile access", async ({
  page,
}) => {
  await login(page);
  const meta = await (await page.request.get("/api/v1/meta")).json();
  const current = meta.today.slice(0, 7);
  await page
    .getByRole("button", { name: "Recurring plans", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add recurring item", exact: true })
    .click();
  await page
    .getByLabel("Recurring item name", { exact: true })
    .fill("Calendar fixture utility");
  await page
    .getByLabel("Amount per occurrence (USD)", { exact: true })
    .fill("500");
  await page
    .getByLabel("Recurring category", { exact: true })
    .selectOption("utilities");
  await page.getByLabel("Start date", { exact: false }).fill(current + "-01");
  await page.getByLabel("Day of month", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Save recurring plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const budget = await (
    await page.request.get("/api/v1/budgets/" + current)
  ).json();
  expect(
    budget.lines.find((l: any) => l.category_id === "utilities").amount,
  ).toBe(50000);
  const auth = await (await page.request.get("/api/v1/auth/me")).json();
  const created = await page.request.post("/api/v1/transactions", {
    headers: { "X-CSRF-Token": auth.csrf },
    data: {
      account_id: "checking",
      date: current + "-01",
      merchant: "Calendar fixture utility",
      amount: -50000,
      status: "posted",
      allocations: [{ category_id: "utilities", amount: -50000, tags: [] }],
    },
  });
  expect(created.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page
    .getByRole("button", { name: /Calendar fixture utility.*paid/ })
    .click();
  await expect(
    page.getByText("Automatically matched", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Unlink transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Calendar fixture utility/ }).click();
  await expect(
    page.getByLabel("Transaction matching", { exact: true }),
  ).toHaveValue("none");
  await page.getByLabel("Skip this occurrence").check();
  await page
    .getByRole("button", { name: "Save occurrence", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Calendar fixture utility.*skipped/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/calendar-desktop.png",
    fullPage: true,
  });
  for (const mobile of [false, true]) {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    if (mobile)
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  }
  await page.screenshot({
    path: "test-results/calendar-mobile.png",
    fullPage: true,
  });
});

test("income filters and creating a recurring plan from transaction details", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page
    .getByLabel("Merchant", { exact: true })
    .fill("Recurring salary fixture");
  await page.getByLabel("Amount", { exact: true }).fill("1250.00");
  await page.getByLabel("Category 1", { exact: true }).selectOption("income");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search transactions").fill("Recurring salary fixture");
  await page.getByLabel("Filter money flow").selectOption("out");
  await expect(page.getByText("Nothing here just yet")).toBeVisible();
  await page.getByLabel("Filter money flow").selectOption("income");
  await page.getByRole("button", { name: /Recurring salary fixture/ }).click();
  await page
    .getByRole("button", { name: "Add to recurring plans", exact: true })
    .click();
  await expect(page.getByLabel("Recurring item name")).toHaveValue(
    "Recurring salary fixture",
  );
  await expect(page.getByLabel("Recurring item type")).toHaveValue("income");
  await expect(
    page.getByLabel("Amount per occurrence (USD)", { exact: true }),
  ).toHaveValue("1250");
  await expect(
    page.getByLabel("Recurring category", { exact: true }),
  ).toHaveValue("income");
  await page.getByLabel("Frequency", { exact: true }).selectOption("biweekly");
  await page
    .getByRole("button", { name: "Save recurring plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Recurring plans", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recurring salary fixture", exact: true }),
  ).toBeVisible();
});
