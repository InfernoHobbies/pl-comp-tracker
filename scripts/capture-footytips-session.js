// Run this ONCE, locally on your own computer (not in GitHub Actions), to
// capture a logged-in footytips session. It opens a REAL, visible browser
// window — you log in by hand, exactly like you normally would, which
// sidesteps ESPN's bot-detection on automated logins entirely. The resulting
// session gets saved to a file, which then goes into a GitHub secret so the
// weekly automation can reuse it without ever having to log in itself.
//
// Usage:
//   npm install
//   npx playwright install chromium
//   node scripts/capture-footytips-session.js
import { chromium } from "playwright";
import fs from "fs";
import readline from "readline";

const HOMEPAGE_URL = "https://footytips.espn.com.au/";
const LADDER_URL = "https://footytips.espn.com.au/competitions/premierleague/ladder?competitionId=1299999&userloc=4&ladderId=381184635";

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(HOMEPAGE_URL);

  console.log("\nA browser window has opened on the footytips homepage.");
  console.log("Click 'Log In' there and sign in normally with your ESPN account");
  console.log("(the account that's already a member of your competition).");
  console.log("Once logged in, manually go to your ladder URL and confirm you can");
  console.log("see the real ladder with everyone's scores.\n");

  await waitForEnter("Once you can see the ladder, come back here and press Enter... ");

  // Double check we actually ended up logged in and able to see the ladder.
  await page.goto(LADDER_URL, { waitUntil: "networkidle" });
  const stillBlocked = await page.locator("text=You are not a member of this competition").isVisible({ timeout: 3000 }).catch(() => false);
  if (stillBlocked) {
    console.log("\n⚠️  Still seeing 'You are not a member of this competition' on the ladder page.");
    console.log("This means the account you just logged in with isn't a member of this");
    console.log("specific competition — log in with a different account, or double-check");
    console.log("you're actually logged in, then run this script again.\n");
  }

  await context.storageState({ path: "footytips-storage-state.json" });
  console.log("\nSaved to footytips-storage-state.json in this folder.");
  console.log("Next: copy the ENTIRE contents of that file into a new GitHub secret");
  console.log("called FOOTYTIPS_STORAGE_STATE (Settings > Secrets and variables > Actions).\n");

  await browser.close();
}

main();
