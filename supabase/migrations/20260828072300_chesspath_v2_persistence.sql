-- ChessPath V2 persistence. Every exposed table is protected by owner-based RLS.
create table public.chess_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  chess_username text,
  display_name text,
  rapid_rating integer,
  blitz_rating integer,
  bullet_rating integer,
  daily_rating integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('chesscom', 'pgn')),
  external_id text not null,
  chess_username text,
  pgn text not null,
  played_at timestamptz,
  time_class text,
  time_control text,
  result text,
  player_color text check (player_color in ('white', 'black')),
  parsed_game jsonb not null,
  imported_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source text not null check (source in ('chesscom', 'pgn', 'saved')),
  requested_games integer not null check (requested_games between 1 and 100),
  cadence text not null,
  game_ids uuid[] not null default '{}',
  metrics jsonb not null,
  exercises jsonb not null default '[]',
  warnings jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.weaknesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme text not null,
  title text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  sample_size integer not null default 0,
  issue_count integer not null default 0,
  status text not null default 'to_work' check (status in ('to_work', 'learning', 'progressing', 'mastered')),
  details jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, theme)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid references public.analyses(id) on delete set null,
  exercise_key text not null,
  theme text not null,
  origin text not null check (origin in ('personal', 'concept')),
  fen text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, exercise_key)
);

create table public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_key text not null,
  theme text not null,
  result text not null check (result in ('success', 'partial', 'failed')),
  loss_cp integer,
  moves jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid references public.analyses(id) on delete cascade,
  metrics jsonb not null,
  created_at timestamptz not null default now()
);

create index games_user_played_idx on public.games (user_id, played_at desc);
create index analyses_user_created_idx on public.analyses (user_id, created_at desc);
create index attempts_user_created_idx on public.exercise_attempts (user_id, created_at desc);
create index progress_user_created_idx on public.progress_snapshots (user_id, created_at desc);
create index exercises_analysis_idx on public.exercises (analysis_id);
create index attempts_exercise_idx on public.exercise_attempts (exercise_id);
create index progress_analysis_idx on public.progress_snapshots (analysis_id);

alter table public.chess_profiles enable row level security;
alter table public.games enable row level security;
alter table public.analyses enable row level security;
alter table public.weaknesses enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.progress_snapshots enable row level security;

create policy "profiles_select_own" on public.chess_profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.chess_profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.chess_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "games_select_own" on public.games for select to authenticated using ((select auth.uid()) = user_id);
create policy "games_insert_own" on public.games for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "games_update_own" on public.games for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "games_delete_own" on public.games for delete to authenticated using ((select auth.uid()) = user_id);
create policy "analyses_select_own" on public.analyses for select to authenticated using ((select auth.uid()) = user_id);
create policy "analyses_insert_own" on public.analyses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "analyses_update_own" on public.analyses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "analyses_delete_own" on public.analyses for delete to authenticated using ((select auth.uid()) = user_id);
create policy "weaknesses_select_own" on public.weaknesses for select to authenticated using ((select auth.uid()) = user_id);
create policy "weaknesses_insert_own" on public.weaknesses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "weaknesses_update_own" on public.weaknesses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "weaknesses_delete_own" on public.weaknesses for delete to authenticated using ((select auth.uid()) = user_id);
create policy "exercises_select_own" on public.exercises for select to authenticated using ((select auth.uid()) = user_id);
create policy "exercises_insert_own" on public.exercises for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "exercises_update_own" on public.exercises for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "exercises_delete_own" on public.exercises for delete to authenticated using ((select auth.uid()) = user_id);
create policy "attempts_select_own" on public.exercise_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "attempts_insert_own" on public.exercise_attempts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "progress_select_own" on public.progress_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy "progress_insert_own" on public.progress_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.chess_profiles, public.games, public.analyses, public.weaknesses, public.exercises, public.exercise_attempts, public.progress_snapshots from anon;
grant select, insert, update on public.chess_profiles to authenticated;
grant select, insert, update, delete on public.games, public.analyses, public.weaknesses, public.exercises to authenticated;
grant select, insert on public.exercise_attempts, public.progress_snapshots to authenticated;
