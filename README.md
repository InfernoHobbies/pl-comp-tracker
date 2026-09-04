# PL Competition Tracker

Tracks four competitions for your group — weekly footytips ladder, FPL classic,
FPL head-to-head, and the season table predictor — and combines them into one
overall leaderboard. Updates automatically every Tuesday morning (AEST).

Everything below can be done from a phone browser — Supabase and GitHub's
websites both work fine on mobile, no laptop needed.

## How it works

- **Supabase** (Postgres) holds all the data.
- **GitHub Actions**, on a Tuesday-morning schedule, runs three small scripts
  that pull FPL classic standings, FPL H2H standings, and the live PL table
  (all public data, no login needed), plus a fourth script that logs into
  footytips with a headless browser to read your private ladder (the one part
  with no public API).
- **A single HTML dashboard** reads the Supabase data and shows the combined
  leaderboard. Host it free on GitHub Pages so anyone in the group can open it.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → sign up → **New project**.
2. Once it's ready, open **SQL Editor** → **New query**, paste the entire
   contents of `supabase/schema.sql`, and run it. This creates all the tables
   and views.
3. Go to **Project Settings → API**. You'll need three values later:
   - **Project URL**
   - **anon public key**
   - **service_role key** (keep this one secret — it can write data)

## 2. Add your people

In Supabase → **Table Editor → people**, add one row per person:
- `name` — how you want them shown on the dashboard
- `footytips_name` — exactly how their name appears on the footytips ladder
- `fpl_entry_id` — their FPL team ID (the number in their FPL team URL, e.g.
  `fantasy.premierleague.com/entry/1234567/...` → `1234567`)

## 3. Add season predictions

In **Table Editor → season_predictions**, add one row per person per team
they predicted, e.g. `person_id | team_name | predicted_position`. Team names
need to match exactly what football-data.org calls them (e.g. "Arsenal FC",
"Manchester City FC") — once the live table's populated (step 6) you can copy
the exact names from the `pl_table_live` table.

## 4. Get a football-data.org API key

Sign up free at [football-data.org/client/register](https://www.football-data.org/client/register).
The free tier easily covers one request a week.

## 5. Put the code on GitHub

1. Create a new repository on [github.com](https://github.com) (e.g.
   `pl-comp-tracker`).
2. Upload all the files from this project into it — on mobile, GitHub's
   "Add file → Upload files" on the repo page works for this.

## 6. Add your secrets

In the repo → **Settings → Secrets and variables → Actions → New repository
secret**, add each of these:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |
| `FPL_CLASSIC_LEAGUE_ID` | `1763` |
| `FPL_H2H_LEAGUE_ID` | `1292335` |
| `FOOTBALL_DATA_API_KEY` | Your football-data.org key |
| `FOOTYTIPS_EMAIL` | Your footytips/ESPN login email |
| `FOOTYTIPS_PASSWORD` | Your footytips/ESPN login password |
| `FOOTYTIPS_LADDER_URL` | Your ladder URL (the one you gave me) |

## 7. Set up the dashboard

Edit `dashboard/index.html` directly on github.com (open the file → pencil
icon to edit), and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` near the top
of the `<script>` — use the **anon** key here, never the service_role key
(this file is public).

Then: repo **Settings → Pages** → Source: **Deploy from a branch** → Branch:
`main`, folder: `/dashboard`. GitHub gives you a public URL a minute later —
that's the link to share with the group.

## 8. Test it

Repo → **Actions** tab → **Weekly competition update** → **Run workflow**.
This runs everything immediately instead of waiting for Tuesday.

The footytips step is the one likely to need a tweak — it's a private page
with no public API, so the script drives a real browser through the login
and reads the table. If that step fails, open the run, download the
`footytips-debug` screenshot artifact it leaves behind, and send it over —
happy to adjust the selectors in `scripts/scrape-footytips.js` once I can see
what the real page looks like when logged in.

## Extending it later

If there's a second, locked-in-at-the-start fantasy team you want tracked
too, the same pattern applies: another `fpl_classic_standings`-style table,
another fetch script, one more row on the dashboard.
