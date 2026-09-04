// Logs into footytips (ESPN account) with a headless browser and scrapes your
// private ladder, since there's no public API for it.
//
// IMPORTANT — read this before relying on it:
// footytips is a JS app sitting behind an ESPN account login, and ESPN's login
// screen occasionally shows extra steps (a "continue" button, a cookie banner,
// sometimes a bot check). The selectors below are a best-effort based on how
// ESPN/footytips pages are normally structured. The FIRST time this runs, check
// the workflow run's uploaded screenshot artifacts — if it didn't work, you'll
// need to open the ladder page yourself, inspect the actual element names, and
// adjust the SELECTORS block below to match. This is the one part of the whole
// system that's genuinely fragile — everything else (FPL, the live table) is a
// stable public API.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FOOTYTIPS_EMAIL = process.env.FOOTYTIPS_EMAIL;
const FOOTYTIPS_PASSWORD = process.env.FOOTYTIPS_PASSWORD;
const LADDER_URL = process.env.FOOTYTIPS_LADDER_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FOOTYTIPS_EMAIL || !FOOTYTIPS_PASSWORD || !LADDER_URL) {
  console.error("Missing one of: SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTYTIPS_EMAIL, FOOTYTIPS_PASSWORD, FOOTYTIPS_LADDER_URL env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Adjust these if the real page doesn't match on first run ---
const SELECTORS = {
  loginTrigger: "text=Log In",
  emailInput: "input[type='email'], input[name='email']",
  continueButton: "button:has-text('Continue')",
  passwordInput: "input[type='password'], input[name='password']",
  submitButton: "button[type='submit'], button:has-text('Log In')",
  ladderRow: "[class*='ladder'] tbody tr, table tr", // widened fallback
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(LADDER_URL, { waitUntil: "networkidle" });

    // Dismiss a cookie banner if one shows up — ignore if it's not there.
    await page.locator("button:has-text('Accept')").click({ timeout: 3000 }).catch(() => {});

    // If we're bounced to a login screen, log in.
    const needsLogin = await page.locator(SELECTORS.emailInput).first().isVisible({ timeout: 5000 }).catch(() => false);
    if (needsLogin) {
      await page.locator(SELECTORS.emailInput).first().fill(FOOTYTIPS_EMAIL);
      await page.locator(SELECTORS.continueButton).click({ timeout: 3000 }).catch(() => {});
      await page.locator(SELECTORS.passwordInput).first().fill(FOOTYTIPS_PASSWORD);
      await page.locator(SELECTORS.submitButton).first().click();
      await page.waitForURL(LADDER_URL, { timeout: 15000 }).catch(() => {});
      await page.goto(LADDER_URL, { waitUntil: "networkidle" });
    }

    await page.waitForSelector(SELECTORS.ladderRow, { timeout: 15000 });

    const rows = await page.$$eval(SELECTORS.ladderRow, (trs) =>
      trs
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim());
          return cells;
        })
        .filter((cells) => cells.length >= 3)
    );

    // Expect something like [rank, name, ..., points]. Adjust indices if the
    // real column order differs once you've inspected a live screenshot.
    const parsed = rows.map((cells) => ({
      rank: parseInt(cells[0], 10),
      name: cells[1],
      points: parseFloat(cells[cells.length - 1]),
    })).filter((r) => !Number.isNaN(r.rank) && !Number.isNaN(r.points));

    console.log(`Parsed ${parsed.length} ladder rows.`);
    if (parsed.length === 0) {
      await page.screenshot({ path: "footytips-debug.png", fullPage: true });
      throw new Error("Parsed 0 ladder rows — see footytips-debug.png artifact, selectors need adjusting.");
    }

    const { data: people, error: peopleErr } = await supabase
      .from("people")
      .select("id, name, footytips_name");
    if (peopleErr) throw peopleErr;

    const dbRows = [];
    for (const entry of parsed) {
      const person = people.find(
        (p) => (p.footytips_name || p.name).toLowerCase() === entry.name.toLowerCase()
      );
      if (!person) continue; // ladder includes people outside your group of 5 — expected, not an error
      dbRows.push({
        person_id: person.id,
        points: entry.points,
        rank: entry.rank,
      });
    }

    if (dbRows.length === 0) {
      await page.screenshot({ path: "footytips-debug.png", fullPage: true });
      throw new Error("Parsed ladder rows but matched 0 people — check footytips_name values in the people table.");
    }

    const { error: insertErr } = await supabase.from("footytips_standings").insert(dbRows);
    if (insertErr) throw insertErr;
    console.log(`Inserted ${dbRows.length} footytips_standings rows.`);
  } catch (err) {
    await page.screenshot({ path: "footytips-debug.png", fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
