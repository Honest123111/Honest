import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

/** Every main screen fits a phone without sideways scrolling. */
test("no horizontal overflow on a phone", async ({ page, context, baseURL }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  test.skip(!email || !password, "E2E credentials not set");
  await signIn(context, baseURL!, email!, password!);
  await page.goto("/properties");
  const detail = await page.locator('a[href^="/properties/"]:not([href*="export"])').first().getAttribute("href");
  const paths = ["/", "/properties", "/pipeline", "/tasks", "/imports"];
  if (detail) paths.push(detail, `${detail}?tab=owners`, `${detail}?tab=activity`, `${detail}?tab=documents`, `${detail}?tab=history`);
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll, `${path} is ${scroll}px wide on a ${inner}px screen`).toBeLessThanOrEqual(inner);
  }
});
