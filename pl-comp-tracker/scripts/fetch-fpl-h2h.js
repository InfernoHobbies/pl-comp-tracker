// Pulls your FPL head-to-head mini-league standings (public, no login needed)
// and writes one row per matched person into fpl_h2h_standings.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FPL_H2H_LEAGUE_ID = process.env.FPL_H2H_LEAGUE_ID; // e.g. 1292335

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FPL_H2H_LEAGUE_ID) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_KEY or FPL_H2H_LEAGUE_ID env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fetchAllPages() {
  let page = 1;
  let hasNext = true;
  const results = [];

  while (hasNext) {
    const url = `https://fantasy.premierleague.com/api/leagues-h2h/${FPL_H2H_LEAGUE_ID}/standings/?page_standings=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`FPL H2H API returned ${res.status}`);
    const data = await res.json();
    results.push(...data.standings.results);
    hasNext = data.standings.has_next;
    page += 1;
  }
  return results;
}

async function main() {
  const standings = await fetchAllPages();
  console.log(`Fetched ${standings.length} H2H league entries.`);

  const { data: people, error: peopleErr } = await supabase
    .from("people")
    .select("id, name, fpl_entry_id");
  if (peopleErr) throw peopleErr;

  const rows = [];
  for (const entry of standings) {
    const person = people.find((p) => p.fpl_entry_id === entry.entry);
    if (!person) {
      console.warn(`No matching person for FPL entry ${entry.entry} (${entry.entry_name}) — skipping.`);
      continue;
    }
    rows.push({
      person_id: person.id,
      league_points: entry.total,       // H2H league points (3/1/0 per matchup)
      wins: entry.matches_won,
      draws: entry.matches_drawn,
      losses: entry.matches_lost,
      total_points: entry.points_for,   // their raw FPL points total, for reference
      rank: entry.rank,
    });
  }

  if (rows.length === 0) {
    console.log("No matched rows to insert.");
    return;
  }

  const { error: insertErr } = await supabase.from("fpl_h2h_standings").insert(rows);
  if (insertErr) throw insertErr;
  console.log(`Inserted ${rows.length} fpl_h2h_standings rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
