import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, webkit, devices } from "playwright";

// Run against a production build, or set CHESSPATH_TEST_URL to a deployment.
// Host-side deadlines still fire when the page's JavaScript thread is frozen.
const url = process.env.CHESSPATH_TEST_URL ?? "http://localhost:3012";
const targets = [
  { name: "iPhone / WebKit", engine: webkit, device: devices["iPhone 13"] },
  { name: "Android / Chromium", engine: chromium, device: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  { name: "Desktop / Chromium", engine: chromium, device: { viewport: { width: 1440, height: 900 } } },
].filter((target) => !process.env.CHESSPATH_TEST_DEVICE || target.name.includes(process.env.CHESSPATH_TEST_DEVICE));

async function deadline(action, label, ms = 10_000) {
  let timer;
  try {
    return await Promise.race([action(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: no response within ${ms}ms`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}

for (const target of targets) {
  const browser = await target.engine.launch();
  const context = await browser.newContext(target.device);
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let step = "load";
  try {
    const mobile = Boolean(target.device.hasTouch);
    const cdp = target.engine === chromium ? await context.newCDPSession(page) : null;
    if (cdp && mobile) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.__testLongTasks = [];
      if (PerformanceObserver.supportedEntryTypes?.includes("longtask"))
        new PerformanceObserver((list) => window.__testLongTasks.push(...list.getEntries().map((entry) => entry.duration)))
          .observe({ entryTypes: ["longtask"] });
    });
    const started = Date.now();
    await page.goto(url, { waitUntil: "commit" });
    await deadline(() => page.getByRole("navigation", { name: "Navigation principale" }).waitFor(), "visible home");

    step = "home scroll";
    await deadline(async () => {
      await page.mouse.move(190, 650);
      if (cdp && mobile) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 10, y: 700 }] });
        for (let y = 650; y >= 200; y -= 50) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 10, y }] });
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else if (target.engine === webkit && mobile) {
        // Playwright WebKit does not implement mobile wheel/swipe injection.
        // Use native scrolling here; taps use WebKit touch input throughout.
        await page.getByRole("button", { name: "Analyser mon jeu", exact: true }).scrollIntoViewIfNeeded();
      } else await page.mouse.wheel(0, 450);
      await page.waitForFunction(() => window.scrollY > 80);
    }, step);

    const activate = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      // Assert the actual hit target; force-clicking would conceal overlays.
      assert.equal(await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      }), true, "Unexpected element intercepts the button");
      if (mobile) await locator.tap(); else await locator.click();
    };
    const navigate = async (name) => {
      step = `navigate ${name}`;
      await deadline(async () => {
        await activate(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("button", { name, exact: true }));
        await page.waitForFunction((label) => document.querySelector(".nav-links .active")?.textContent === label, name);
      }, step);
    };
    await navigate("Analyser");
    const interactiveMs = Date.now() - started;
    step = "analysis input focus";
    await deadline(async () => {
      await activate(page.getByLabel("Pseudo Chess.com", { exact: true }));
      assert.equal(await page.getByLabel("Pseudo Chess.com", { exact: true }).evaluate((element) => document.activeElement === element), true);
      await page.getByLabel("Pseudo Chess.com", { exact: true }).fill("chesspath-interaction-test");
    }, step);
    // Test that a real tap submits the form, without analysing a user's games.
    let submitted = 0;
    await page.route("**/api/analyze", async (route) => {
      submitted++;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test de régression : requête reçue." }) });
    });
    step = "analysis button";
    await deadline(async () => {
      await activate(page.getByRole("button", { name: "Analyser mon jeu", exact: true }));
      await page.getByText("Test de régression : requête reçue.", { exact: true }).waitFor();
      assert.equal(submitted, 1);
    }, step);
    await navigate("Progression");
    await navigate("Profil");
    await navigate("Accueil");
    await navigate("S’entraîner");
    step = "training launch";
    await deadline(async () => {
      await page.getByRole("button", { name: "Commencer mon entraînement" }).waitFor({ timeout: 25_000 });
      await activate(page.getByRole("button", { name: "Commencer mon entraînement" }));
      await page.locator(".board-frame [data-square]").first().waitFor();
    }, step, 30_000);
    step = "training buttons and scroll outside the board";
    await deadline(async () => {
      await activate(page.getByRole("button", { name: "Recommencer", exact: true }));
      // Board gesture handling must not leave a document-wide scroll lock.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      const before = await page.evaluate(() => window.scrollY);
      const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 50);
      await page.mouse.move(5, 600);
      if (target.engine === webkit && mobile) {
        await page.locator(".exercise-footer").scrollIntoViewIfNeeded();
      } else await page.mouse.wheel(0, 350);
      if (mobile || scrollable) await page.waitForFunction((y) => window.scrollY > y + 50, before);
      await activate(page.getByRole("button", { name: "Retour à l’entraînement" }));
      await page.getByRole("button", { name: "Commencer mon entraînement" }).waitFor();
    }, step);
    const diagnostics = await page.evaluate(() => ({
      maxLongTaskMs: PerformanceObserver.supportedEntryTypes?.includes("longtask")
        ? Math.round(Math.max(0, ...window.__testLongTasks)) : null,
      htmlOverflow: getComputedStyle(document.documentElement).overflowY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      fullscreenInterceptors: [...document.querySelectorAll("body *")].filter((element) => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return style.position === "fixed" && style.pointerEvents !== "none" && rect.width >= innerWidth * .95 && rect.height >= innerHeight * .95;
      }).map((element) => element.className),
    }));
    assert.deepEqual(errors, [], "Browser errors");
    assert.deepEqual(diagnostics.fullscreenInterceptors, []);
    assert.ok(!["hidden", "clip"].includes(diagnostics.htmlOverflow));
    assert.ok(!["hidden", "clip"].includes(diagnostics.bodyOverflow));
    mkdirSync("outputs", { recursive: true });
    await page.screenshot({ path: `outputs/mobile-${target.name.split(" /")[0].toLowerCase()}.png` });
    console.log(JSON.stringify({ device: target.name, result: "PASS", interactiveMs, ...diagnostics, checks: "scroll, all navigation tabs, focus, submit, training launch/reset/return" }));
  } catch (error) {
    process.exitCode = 1;
    console.error(JSON.stringify({ device: target.name, result: "FAIL", firstFailure: step, error: error.message, errors }));
  } finally {
    await browser.close();
  }
}
