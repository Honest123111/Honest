import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { signIn } from "./auth";

/** A TTC-style inventory: two title rows, a blank row, header on row 4, one duplicate APN. */
async function ttcWorkbook(apns: string[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PTS INVENTORY");
  ws.addRow(["2025 PTS INVENTORY - TAG ORDER"]);
  ws.addRow(["As of 7/1/2025"]);
  ws.addRow([]);
  ws.addRow(["PIN", "Geocode", "Power to Sell Start Date", "Tag", "Tag Descr", "City", "Advalorem", "Specials",
    "Redemption Amount", "Land Value", "Structure Value", "Situs Address", "Situs City", "Situs State", "Situs Postal Cd",
    "Property Description", "Other Description"]);
  ws.addRow([apns[0], "x", new Date("2019-07-01"), "001-002", "BLYTHE", "BLYTHE", 800, 12, 1450.55, 3000, 0, "", "BLYTHE", "CA", "92225", "VACANT LAND", ""]);
  ws.addRow([apns[1], "x", new Date("2021-07-01"), "001-002", "BLYTHE", "BLYTHE", 900, 0, 2100, 52000, 0, "12 MAIN ST", "BLYTHE", "CA", "92225", "10 AC", ""]);
  ws.addRow([apns[1].replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3"), "x", new Date("2021-07-01"), "", "", "", "", "", "", "", "", "", "", "", "", "", "duplicate row"]);
  ws.addRow(["12-34", "bad apn"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("TTC inventory import: auto-map, preview, commit, re-import without duplicates", async ({ page, context, baseURL }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  test.skip(!email || !password, "E2E credentials not set");
  test.setTimeout(150_000);
  await signIn(context, baseURL!, email!, password!);
  const seed = Date.now().toString().slice(-6);
  const apns = [`88${seed}1`, `88${seed}2`];
  const file = await ttcWorkbook(apns);

  async function upload(name: string) {
    await page.goto("/imports");
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: file });
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}/, { timeout: 30_000 });
  }

  // 1. first import: format + header row detected, APN mapped
  await upload("pts-inventory.xlsx");
  await expect(page.getByLabel("Format")).toHaveValue("tax_default_inventory");
  await expect(page.getByLabel("Header row")).toHaveValue("4");
  await expect(page.getByRole("row", { name: /^PIN/ }).getByRole("combobox")).toHaveValue("apn");
  await page.getByRole("button", { name: "Preview matches" }).click();
  await expect(page.getByText("New parcels").locator("..")).toContainText("2");
  await expect(page.getByText("Errors", { exact: true }).locator("..")).toContainText("1");
  await page.getByRole("link", { name: "Merged dupes" }).click();
  await expect(page.getByText(/Duplicate APN — merged/)).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Commit 2 rows/ }).click();
  await expect(page.getByText(/Committed/)).toBeVisible({ timeout: 60_000 });

  // committed parcels exist once, with tax history and a derived years-in-default
  await page.goto(`/properties?q=${apns[0]}`);
  await page.getByRole("link", { name: `${apns[0].slice(0, 3)}-${apns[0].slice(3, 6)}-${apns[0].slice(6)}` }).first().click();
  await page.getByRole("tab", { name: "Tax" }).click();
  await expect(page.getByText("$1,451")).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  // power to sell 2019 → 6 years at the 2025 snapshot → rule 1 (auction watch) beats low land value
  await expect(page.getByRole("combobox", { name: "Strategy" })).toHaveValue("auction_watch");

  // 2. user edits a field, then the same file is imported again
  await page.goto(`/properties?q=${apns[1]}`);
  await page.getByRole("link", { name: new RegExp(apns[1].slice(0, 3)) }).first().click();
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByRole("textbox", { name: "Situs address" }).fill("12 Main Street (verified)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await upload("pts-inventory-again.xlsx");
  await page.getByRole("button", { name: "Preview matches" }).click();
  await expect(page.getByText("New parcels").locator("..")).toContainText("0");
  await expect(page.getByText("Conflicts", { exact: true }).locator("..")).toContainText("1");
  await expect(page.getByText(/yours 12 Main Street \(verified\) vs file 12 MAIN ST/)).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Commit \d+ rows/ }).click();
  await expect(page.getByText(/Committed/)).toBeVisible({ timeout: 60_000 });

  // still one parcel per APN, and the user's edit was kept
  await page.goto(`/properties?q=${apns[1]}`);
  await expect(page.getByText("1 property", { exact: true })).toBeVisible();
  await expect(page.getByText("12 Main Street (verified)").filter({ visible: true }).first()).toBeVisible();
});
