import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const QUERY = "s=TRADE_LICENSE&s=VISA&loc=DUBAI_MAINLAND&visas=2&time=WEEKS_2_4";

/** Fails the test on any CSP violation or any request that leaves the site. */
function guard(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(`CSP: ${m.text()}`);
  });
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.hostname !== "localhost" && url.protocol !== "data:") problems.push(`External request: ${r.url()}`);
  });
  return problems;
}

async function noSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test("English: pick services, answer questions, compare, open a company", async ({ page }) => {
  const problems = guard(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("heading", { name: "What do you need help with?" })).toBeVisible();
  await expect(page.getByText("Sample data only, not real companies")).toBeVisible();
  await noSeriousA11yIssues(page);

  await page.getByLabel(/Trade license/).check();
  await page.getByLabel(/Visa services/).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "A few details to match prices" })).toBeVisible();
  await page.getByLabel("Dubai mainland").check();
  await page.getByRole("spinbutton").fill("2");
  await page.getByLabel("2–4 weeks").check();
  await page.getByRole("button", { name: "Show matching companies" }).click();

  await expect(page.getByRole("heading", { name: "Companies for you" })).toBeVisible();
  await expect(page.getByText("5 companies")).toBeVisible();
  const titles = page.locator(".card-title");
  await expect(titles).toHaveText([
    "Harbor Gate Consultants (sample)",
    "Al Noor Business Services (sample)",
    "Desert Rose PRO (sample)",
    "Falcon Edge Setup (sample)",
    "Blue Palm Services (sample)",
  ]);
  await expect(page.getByText("Renewal cost not stated. Ask before you commit.")).toHaveCount(1);
  await expect(page.getByText("No verified reviews yet")).toHaveCount(2);
  await noSeriousA11yIssues(page);
  await page.screenshot({ path: "test-results/screens/en-results.png", fullPage: true });

  await page.getByRole("switch", { name: "Verified only" }).click();
  await expect(page.getByText("3 companies")).toBeVisible();

  await page.getByText("Al Noor Business Services (sample)").click();
  await expect(page.getByRole("heading", { name: "Al Noor Business Services (sample)" })).toBeVisible();
  await expect(page.getByText("Verified confirms the licence only.")).toBeVisible();
  await expect(page.locator(".breakdown")).toContainText("AED 7,300");
  await expect(page.locator(".breakdown")).toContainText("AED 7,500");
  await expect(page.locator(".breakdown")).toContainText("AED 14,800");
  await noSeriousA11yIssues(page);
  await page.screenshot({ path: "test-results/screens/en-profile.png", fullPage: true });

  expect(problems).toEqual([]);
});

test("Arabic: results are right-to-left and the language switch keeps answers", async ({ page }) => {
  const problems = guard(page);
  await page.goto(`/ar/results?${QUERY}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "شركات مناسبة لك" })).toBeVisible();
  await expect(page.getByText("5 شركات")).toBeVisible();
  await expect(page.getByText("تكلفة التجديد غير مذكورة. اسأل قبل الالتزام.")).toHaveCount(1);

  // In RTL the price sits on the left of the company name.
  const card = page.locator(".result-card").first();
  const name = await card.locator(".card-title").boundingBox();
  const price = await card.locator(".price").boundingBox();
  expect(price!.x).toBeLessThan(name!.x);

  await noSeriousA11yIssues(page);
  await page.screenshot({ path: "test-results/screens/ar-results.png", fullPage: true });

  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/results\?.*loc=DUBAI_MAINLAND/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  expect(problems).toEqual([]);
});

test("Arabic profile page", async ({ page }) => {
  await page.goto(`/ar/companies/falcon-edge-sample?${QUERY}`);
  await expect(page.getByRole("heading", { name: "غير موثّقة" })).toBeVisible();
  await expect(page.getByText("الرسوم الحكومية (تقريبية)")).toBeVisible();
  await noSeriousA11yIssues(page);
  await page.screenshot({ path: "test-results/screens/ar-profile.png", fullPage: true });
});

test("asks to pick a service when none is chosen", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Pick at least one service.");
});

test("rejects tampered answers instead of guessing", async ({ page }) => {
  await page.goto("/en/results?s=TRADE_LICENSE&loc=MARS&visas=999&time=NOW");
  await expect(page).toHaveURL(/\/en\?error=pick/);
  const res = await page.goto("/en/companies/<script>");
  expect(res?.status()).toBe(404);
});

test("security headers are on every page", async ({ request }) => {
  const res = await request.get("/en");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();
});
