// Pulls the current live Premier League table from football-data.org
// and writes it into pl_table_live (used to score the season predictor comp).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FOOTBALL_DATA_API_KEY) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_KEY or FOOTBALL_DATA_API_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// football-data.org competition code for the Premier League is "PL"
const STANDINGS_URL = "https://api.football-data.org/v4/competitions/PL/standings";

async function main() {
  const res = await fetch(STANDINGS_URL, {
    headers: { "X-Auth-Token": FOOTBALL_DATA_API_KEY },
  });
  if (!res.ok) throw new Error(`football-data.org returned ${res.status}: ${await res.text()}`);
  const data = await res.json();

  // "TOTAL" is the overall table (as opposed to home/away splits)
  const table = data.standings.find((s) => s.type === "TOTAL")?.table;
  if (!table) throw new Error("Could not find TOTAL standings table in response.");

  const rows = table.map((row) => ({
    team_name: row.team.name,
    position: row.position,
    updated_at: new Date().toISOString(),
  }));

  // Upsert so re-running mid-week just refreshes positions rather than duplicating.
  const { error } = await supabase.from("pl_table_live").upsert(rows, { onConflict: "team_name" });
  if (error) throw error;

  console.log(`Updated pl_table_live with ${rows.length} teams.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
