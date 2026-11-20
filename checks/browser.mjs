import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createLocalServer } from "../src/server.ts";

const canary = "SYNTHETIC_CANARY_AF_V01";
const server = createLocalServer().listen(0, "127.0.0.1");
let browser;

try {
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.text().includes(canary)) errors.push(message.text());
  });
  page.on("requestfailed", (request) => errors.push(request.failure()?.errorText));

  function nextReport() {
    return page.waitForResponse(`${origin}/api/replays`);
  }

  async function verifyReport(response, scenario, metrics) {
    assert.equal(response.status(), 200);
    const api = await response.json();
    assert.equal(api.scenarioId, scenario);
    await page.getByText(new RegExp(`^${scenario} replay complete$`, "i")).waitFor();
    assert.equal(await page.locator("#run-id").textContent(), api.runId);
    assert.deepEqual(await page.locator(".metric strong").allTextContents(), metrics);
    assert.deepEqual(await page.locator("#evidence strong").allTextContents(),
      api.invariants.map(({ observed, expected }) => `${observed} / ${expected}`));
    assert.equal(await page.locator("#invariants").textContent(), "4 of 4 checks passed");

    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const download = await pendingDownload;
    const raw = await readFile(await download.path(), "utf8");
    assert.deepEqual(JSON.parse(raw), api);
    assert.ok(!raw.includes(canary));
    assert.ok(!(await page.content()).includes(canary));
  }

  const first = nextReport();
  await page.goto(origin);
  await verifyReport(await first, "suspicious", ["3", "2", "1", "0"]);
  assert.equal(await page.locator("mark").textContent(), "[Fixture marker: suspected instruction injection]");
  assert.equal(await page.getByText("Never dispatched", { exact: true }).count(), 2);
  assert.ok(await page.getByText("FIXTURE_INJECTION_SIGNAL").isVisible());

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByText("Benign document", { exact: true }).click();
  const second = nextReport();
  await page.getByRole("button", { name: "Run replay" }).click();
  await verifyReport(await second, "benign", ["2", "0", "2", "1"]);
  assert.equal(await page.locator("mark").count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth));
  assert.deepEqual(errors, []);
  console.log("Browser checks passed for both replays, report downloads, and mobile layout.");
} finally {
  await browser?.close();
  server.close();
}
