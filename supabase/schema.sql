-- ============================================================
-- PL Competition Tracker — Supabase schema
-- Run this once in Supabase: Project > SQL Editor > New query > paste > Run
-- ============================================================

-- People taking part. One row per person, shared across all competitions.
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  footytips_name text,        -- name exactly as it appears on the footytips ladder
  fpl_entry_id integer,       -- their FPL "entry"/team ID (from their FPL team URL)
  created_at timestamptz default now()
);

-- Every time the footytips ladder is checked, one row per person is inserted.
-- Keeping history (not just overwriting) means you can see form/trend later if you want.
create table if not exists footytips_standings (
  id bigint generated always as identity primary key,
  person_id uuid references people(id) on delete cascade,
  points numeric not null,
  rank integer,
  round_label text,           -- whatever round/gameweek label footytips shows, for reference
  updated_at timestamptz default now()
);

create table if not exists fpl_classic_standings (
  id bigint generated always as identity primary key,
  person_id uuid references people(id) on delete cascade,
  total_points integer not null,
  gameweek_points integer,
  overall_rank integer,       -- global FPL rank, just for interest
  updated_at timestamptz default now()
);

create table if not exists fpl_h2h_standings (
  id bigint generated always as identity primary key,
  person_id uuid references people(id) on delete cascade,
  league_points integer not null,   -- 3/1/0 per matchup, as FPL H2H scores it
  wins integer,
  draws integer,
  losses integer,
  total_points integer,             -- their normal FPL gameweek points total, for reference
  rank integer,
  updated_at timestamptz default now()
);

-- Enter each person's predicted final table ONCE, at the start of the season.
-- One row per team they predicted a position for (usually 20 rows per person).
create table if not exists season_predictions (
  id bigint generated always as identity primary key,
  person_id uuid references people(id) on delete cascade,
  team_name text not null,
  predicted_position integer not null,
  unique (person_id, team_name)
);

-- The live/current PL table, refreshed weekly. One row per team.
create table if not exists pl_table_live (
  team_name text primary key,
  position integer not null,
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Convenience views: "latest snapshot" per person for each ladder
-- ------------------------------------------------------------

create or replace view footytips_latest as
select distinct on (person_id) person_id, points, rank, round_label, updated_at
from footytips_standings
order by person_id, updated_at desc;

create or replace view fpl_classic_latest as
select distinct on (person_id) person_id, total_points, gameweek_points, overall_rank, updated_at
from fpl_classic_standings
order by person_id, updated_at desc;

create or replace view fpl_h2h_latest as
select distinct on (person_id) person_id, league_points, wins, draws, losses, total_points, rank, updated_at
from fpl_h2h_standings
order by person_id, updated_at desc;

-- Season predictor score per person: sum of |predicted position - actual position|
-- across every team they predicted. Lower = better (golf scoring).
create or replace view season_predictor_scores as
select
  sp.person_id,
  sum(abs(sp.predicted_position - pt.position)) as total_points,
  count(*) as teams_scored
from season_predictions sp
join pl_table_live pt on pt.team_name = sp.team_name
group by sp.person_id;

-- ------------------------------------------------------------
-- Row Level Security: allow public read-only access (dashboard uses the anon key).
-- Writes only happen via the service_role key from the GitHub Actions scripts.
-- ------------------------------------------------------------

alter table people enable row level security;
alter table footytips_standings enable row level security;
alter table fpl_classic_standings enable row level security;
alter table fpl_h2h_standings enable row level security;
alter table season_predictions enable row level security;
alter table pl_table_live enable row level security;

create policy "public read" on people for select using (true);
create policy "public read" on footytips_standings for select using (true);
create policy "public read" on fpl_classic_standings for select using (true);
create policy "public read" on fpl_h2h_standings for select using (true);
create policy "public read" on season_predictions for select using (true);
create policy "public read" on pl_table_live for select using (true);
