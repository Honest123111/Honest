import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

/**
 * Phase 1 acceptance: on a phone, open an APN, change its status, leave a
 * note that @mentions a teammate, add a task, upload a PDF, and see all of it
 * in the timeline and the audit log. Uses a throwaway parcel (county Other).
 */
const APN = `99${Date.now().toString().slice(-7)}`; // 9 digits, unique per run
const TINY_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

test("phase 1 done-when path on a phone", async ({ page, context, baseURL }) => {
  const email = process.env.E2E_EMAIL!;
  const mentionEmail = process.env.E2E_MENTION_EMAIL!;
  const password = process.env.E2E_PASSWORD!;
  test.skip(!email || !mentionEmail || !password, "E2E credentials not set");

  await signIn(context, baseURL!, email, password);

  // Home renders for a signed-in member
  await page.goto("/");
  await expect(page.getByRole("button", { name: /quick add/i })).toBeVisible();

  // Create the test parcel through Quick add → Property
  await page.getByRole("button", { name: /quick add/i }).click();
  await page.getByRole("menuitem", { name: "Property", exact: true }).click();
  await page.getByLabel("County").selectOption("other");
  await page.getByLabel("APN").fill(APN);
  await page.getByLabel("Situs address").fill("1 E2E Test Rd");
  await page.getByRole("button", { name: "Add property" }).click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}/);
  const propertyUrl = page.url();

  // Open it again by APN through global search
  await page.goto("/properties");
  await page.getByLabel("Search").fill(APN);
  await page.getByRole("button", { name: new RegExp(APN) }).first().click();
  await expect(page).toHaveURL(propertyUrl);
  await expect(page.getByRole("heading", { name: APN })).toBeVisible();

  // Change status
  await page.getByLabel("Lead status").first().selectOption("owner_found");
  await expect(page.getByText("Moved to Owner found")).toBeVisible();

  // Note with an @mention
  await page.getByRole("tab", { name: "Activity" }).click();
  await page.getByText("Write a note…").click();
  const box = page.getByPlaceholder(/Write a note/);
  await box.fill("Owner's daughter says they'd sell. Looping in @E2E");
  await page.getByRole("button", { name: /E2E Analyst/ }).click();
  await box.pressSequentially("please pull the title report.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText(/notified 1/)).toBeVisible();

  // Task
  await page.getByRole("button", { name: "Add task" }).first().click();
  await page.getByRole("textbox", { name: "Task", exact: true }).fill("Order preliminary title report");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Task added")).toBeVisible();

  // PDF upload
  await page.getByRole("button", { name: "Upload doc" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "title-report.pdf", mimeType: "application/pdf", buffer: TINY_PDF });
  await page.getByRole("button", { name: /^Upload$/ }).click();
  await expect(page.getByText("Uploaded 1 file")).toBeVisible();

  // Timeline shows note, status change, document
  await page.reload();
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText("please pull the title report")).toBeVisible();
  await expect(page.getByText(/new → owner_found/)).toBeVisible();
  await expect(page.getByText("Uploaded title-report.pdf")).toBeVisible();

  // Audit log shows the field-level status change
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText(/lead_status/).first()).toBeVisible();
  await expect(page.getByText("owner_found").first()).toBeVisible();

  // Documents tab lists the PDF
  await page.getByRole("tab", { name: /Documents/ }).click();
  await expect(page.getByRole("button", { name: "title-report.pdf" })).toBeVisible();

  // The teammate sees the @mention in their notifications
  await signIn(context, baseURL!, mentionEmail, password);
  await page.goto("/");
  await page.getByRole("button", { name: /Notifications \(\d+ unread\)/ }).click();
  await expect(page.getByText(new RegExp(`mentioned you on ${APN}`))).toBeVisible();
});
