import { expect, test } from "@playwright/test";

const QUERY = "s=TRADE_LICENSE&s=VISA&loc=DUBAI_MAINLAND&visas=2&time=WEEKS_2_4";
// Keep total submissions in this file under the 5-per-10-minutes limit.
test.describe.configure({ mode: "serial" });

test("English: request a quote from one company", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).hostname !== "localhost") external.push(r.url());
  });

  await page.goto(`/en/companies/al-noor-sample?${QUERY}`);
  await page.getByRole("link", { name: "Request a quote" }).click();
  await expect(page.getByRole("heading", { name: "Request a quote" })).toBeVisible();
  await expect(page.getByText("Trade license + Visa services")).toBeVisible();
  await expect(page.getByText("We never ask for your passport, Emirates ID or bank details here.")).toBeVisible();

  await page.getByLabel("Your name").fill("Test Person (sample)");
  await page.getByLabel("Phone or email (one is enough)").fill("person@example.com");
  await page.getByLabel(/I agree to share these details with Al Noor Business Services \(sample\) only/).check();
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await expect(page.getByText("Al Noor Business Services (sample) will contact you")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/en-quote-sent.png", fullPage: true });
  expect(external).toEqual([]);
});

test("shows clear errors and keeps what was typed", async ({ page }) => {
  await page.goto(`/en/companies/harbor-gate-sample?${QUERY}`);
  await page.getByRole("link", { name: "Request a quote" }).click();
  await page.getByLabel("Your name").fill("Test Person (sample)");
  await page.getByLabel("Phone or email (one is enough)").fill("not a contact");
  await page.getByRole("button", { name: "Send request" }).click();

  const alert = page.locator("div.alert[role=alert]");
  await expect(alert).toContainText("Please enter one phone number or one email address.");
  await expect(alert).toContainText("Please tick the box to agree before sending.");
  await expect(page.getByLabel("Your name")).toHaveValue("Test Person (sample)");
});

test("Arabic: request a quote right-to-left", async ({ page }) => {
  await page.goto(`/ar/companies/desert-rose-sample?${QUERY}`);
  await page.getByRole("link", { name: "طلب عرض سعر" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("اسمك").fill("شخص تجريبي");
  await page.getByLabel("رقم الهاتف أو البريد الإلكتروني (يكفي واحد)").fill("+971 50 000 0000");
  await page.getByLabel(/أوافق على مشاركة هذه البيانات مع Desert Rose PRO \(sample\) فقط/).check();
  await page.screenshot({ path: "test-results/screens/ar-quote-form.png", fullPage: true });
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByRole("heading", { name: "تم إرسال الطلب" })).toBeVisible();
});

test("a bot filling the hidden field gets no request stored", async ({ page }) => {
  await page.goto(`/en/companies/blue-palm-sample?${QUERY}`);
  await page.getByRole("link", { name: "Request a quote" }).click();
  await page.getByLabel("Your name").fill("Bot");
  await page.getByLabel("Phone or email (one is enough)").fill("bot@example.com");
  await page.locator("input[name=website]").fill("http://spam.example", { force: true });
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Send request" }).click();
  // Same page as a real send, so the bot learns nothing.
  await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await expect(page.getByText("will contact you")).toHaveCount(0);
});
