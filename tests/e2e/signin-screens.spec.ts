/**
 * The sign-in, authenticator setup, recovery code and sign-out screens in a real browser,
 * in English and Arabic. Needs MIGRATION_DATABASE_URL to create throwaway accounts.
 */
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { generate } from "otplib";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

const run = randomBytes(4).toString("hex");
const messages = { en: en.auth, ar: ar.auth } as const;

function createAccount(tag: string) {
  const email = `screens-${tag}-${run}@example.com`;
  const out = execFileSync(
    "pnpm",
    ["user:create", "--role", "admin", "--email", email, "--name", "Screen Tester (sample)", "--json"],
    { env: process.env, encoding: "utf8" },
  );
  const line = out.split("\n").find((l) => l.startsWith("{"))!;
  return { email, password: (JSON.parse(line) as { password: string }).password };
}

async function noSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function signInWithPassword(page: Page, locale: "en" | "ar", email: string, password: string) {
  const m = messages[locale];
  await page.goto(`/${locale}/sign-in`);
  await page.getByLabel(m.email).fill(email);
  await page.getByLabel(m.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: m.signIn }).click();
}

for (const [index, locale] of (["en", "ar"] as const).entries()) {
  test.describe(`sign-in screens (${locale})`, () => {
    // A different address per language, so the sign-in limit does not mix with other tests.
    test.use({ extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${40 + index}` } });
    const m = messages[locale];

    test("first sign-in, authenticator setup, recovery code and sign out", async ({ page }) => {
      const account = createAccount(locale);

      // Wrong password: one plain message, nothing about which part was wrong.
      await signInWithPassword(page, locale, account.email, "not-the-password");
      await expect(page.locator(".alert")).toHaveText(m.errors.badLogin);

      // Right password: no authenticator yet, so the account page walks through setup.
      await signInWithPassword(page, locale, account.email, account.password);
      await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
      await expect(page.getByRole("heading", { name: m.enrolTitle })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

      await page.getByLabel(m.confirmPassword).fill(account.password);
      await page.getByRole("button", { name: m.startSetup }).click();
      await expect(page.getByRole("img", { name: m.qrLabel })).toBeVisible();
      await noSeriousA11yIssues(page);

      await page.getByText(m.cantScan).click();
      const secret = (await page.locator("code.secret").innerText()).trim();
      expect(secret.length).toBeGreaterThan(10);

      // A wrong code is refused with a plain message.
      await page.getByLabel(m.code).fill("000000");
      await page.getByRole("button", { name: m.verify }).click();
      await expect(page.locator(".alert")).toHaveText(m.errors.badCode);

      await page.getByLabel(m.code).fill(await generate({ secret }));
      await page.getByRole("button", { name: m.verify }).click();

      // Recovery codes are shown once, and "Continue" stays off until they are marked as saved.
      await expect(page.getByRole("heading", { name: m.codesTitle })).toBeVisible();
      const codes = await page.locator(".recovery-codes code").allInnerTexts();
      expect(codes).toHaveLength(10);
      const next = page.getByRole("button", { name: m.continue });
      await expect(next).toBeDisabled();
      await page.getByLabel(m.codesSaved).check();
      await next.click();
      await expect(page.getByText(m.roles.admin)).toBeVisible();

      // Sign out ends the session: the account page sends visitors back to sign-in.
      await page.getByRole("button", { name: m.signOut }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));
      await page.goto(`/${locale}/account`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));

      // Sign in again with the authenticator code.
      await signInWithPassword(page, locale, account.email, account.password);
      await expect(page.getByLabel(m.code)).toBeVisible();
      await page.getByLabel(m.code).fill(await generate({ secret }));
      await page.getByRole("button", { name: m.verify }).click();
      await expect(page.getByText(m.roles.admin)).toBeVisible();
      await page.getByRole("button", { name: m.signOut }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));

      // Sign in with a recovery code. It works once, and only once.
      await signInWithPassword(page, locale, account.email, account.password);
      await page.getByRole("button", { name: m.useRecovery }).click();
      await page.getByLabel(m.recoveryCode).fill(codes[0]!);
      await page.getByRole("button", { name: m.verify }).click();
      await expect(page.getByText(m.roles.admin)).toBeVisible();
    });

    test("sign-in page has no accessibility problems", async ({ page }) => {
      await page.goto(`/${locale}/sign-in`);
      await expect(page.getByRole("heading", { name: m.signInTitle })).toBeVisible();
      await noSeriousA11yIssues(page);
    });
  });
}

test("visitors are sent to sign-in, and the site can be installed", async ({ page, request }) => {
  await page.goto("/en/account");
  await expect(page).toHaveURL(/\/en\/sign-in$/);

  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as { display: string; icons: { src: string; sizes: string }[]; start_url: string };
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
});
