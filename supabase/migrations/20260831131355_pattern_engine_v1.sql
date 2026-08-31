-- Pattern Engine V1: additive concept performance only. Existing analyses and
-- exercises keep their JSON payloads and remain backward compatible.
create table public.concept_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_slug text not null,
  opportunities integer not null default 0 check (opportunities >= 0),
  successes integer not null default 0 check (successes >= 0),
  failures integer not null default 0 check (failures >= 0),
  training_attempts integer not null default 0 check (training_attempts >= 0),
  training_successes integer not null default 0 check (training_successes >= 0),
  game_opportunities integer not null default 0 check (game_opportunities >= 0),
  game_successes integer not null default 0 check (game_successes >= 0),
  mastery_score numeric(5, 2) check (mastery_score between 0 and 100),
  last_seen_at timestamptz,
  last_trained_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, concept_slug),
  check (successes <= opportunities),
  check (game_successes <= game_opportunities),
  check (training_successes <= training_attempts)
);

create index concept_stats_user_priority_idx
  on public.concept_stats (user_id, mastery_score asc nulls first, last_seen_at desc);

alter table public.concept_stats enable row level security;

create policy "concept_stats_select_own"
  on public.concept_stats for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "concept_stats_insert_own"
  on public.concept_stats for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "concept_stats_update_own"
  on public.concept_stats for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.concept_stats from anon;
grant select, insert, update on public.concept_stats to authenticated;
