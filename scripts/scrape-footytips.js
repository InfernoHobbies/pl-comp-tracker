// Scrapes your footytips ladder using a SAVED LOGIN SESSION rather than
// automating the login itself — ESPN's login has bot-detection that silently
// blocks headless/automated logins, so instead this loads a session captured
// once by scripts/capture-footytips-session.js (run locally, by hand) and
// stored in the FOOTYTIPS_STORAGE_STATE secret.
//
// If this starts failing again months from now, it likely just means the
// session expired — re-run capture-footytips-session.js locally and update
// the secret with the new contents.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const LADDER_URL = process.env.FOOTYTIPS_LADDER_URL?.trim();
const STORAGE_STATE_JSON = process.env.FOOTYTIPS_STORAGE_STATE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !LADDER_URL || !STORAGE_STATE_JSON) {
  console.error("Missing one of: SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTYTIPS_LADDER_URL, FOOTYTIPS_STORAGE_STATE env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Adjust this if the real ladder table's structure doesn't match ---
const LADDER_ROW_SELECTOR = "[class*='ladder'] tbody tr, table tr"; // widened fallback

async function main() {
  const browser = await chromium.launch();

  let storageState;
  try {
    storageState = JSON.parse(STORAGE_STATE_JSON);
  } catch {
    throw new Error("FOOTYTIPS_STORAGE_STATE isn't valid JSON — make sure the ENTIRE contents of footytips-storage-state.json were pasted into the secret, with nothing added or trimmed.");
  }

  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  try {
    await page.goto(LADDER_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);

    const notAMember = await page.locator("text=You are not a member of this competition").isVisible({ timeout: 3000 }).catch(() => false);
    if (notAMember) {
      await page.screenshot({ path: "footytips-debug.png", fullPage: true });
      throw new Error("Session appears to be logged out or expired — re-run scripts/capture-footytips-session.js locally and update the FOOTYTIPS_STORAGE_STATE secret with the new file contents.");
    }

    await page.waitForSelector(LADDER_ROW_SELECTOR, { timeout: 15000 });

    const rows = await page.$$eval(LADDER_ROW_SELECTOR, (trs) =>
      trs
        .map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.innerText.trim()))
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
