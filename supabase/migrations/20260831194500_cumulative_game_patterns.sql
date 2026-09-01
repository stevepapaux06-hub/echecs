-- Store one deterministic Pattern Engine summary per unique game. Re-analysis
-- updates that game's summary instead of incrementing counters a second time.
alter table public.games
  add column if not exists analysis_summary jsonb,
  add column if not exists analyzed_at timestamptz;

alter table public.concept_stats
  add column if not exists baseline_game_opportunities integer not null default 0,
  add column if not exists baseline_game_successes integer not null default 0;

-- Freeze the already accumulated V1 counters once. New per-game summaries are
-- added on top, so deploying this migration never makes prior observations
-- disappear from an existing profile.
update public.concept_stats
set baseline_game_opportunities = game_opportunities,
    baseline_game_successes = game_successes
where baseline_game_opportunities = 0
  and baseline_game_successes = 0;

-- Games already referenced by a historical analysis are marked as part of the
-- frozen baseline. Re-analyzing one of them must not count it a second time.
update public.games as game
set analysis_summary = jsonb_build_object(
      'version', 0,
      'gameKey', game.source || ':' || game.external_id
    ),
    analyzed_at = coalesce(game.analyzed_at, now())
where game.analysis_summary is null
  and exists (
    select 1
    from public.analyses as analysis
    where game.id = any(analysis.game_ids)
  );

create index if not exists games_user_analyzed_idx
  on public.games (user_id, analyzed_at desc)
  where analyzed_at is not null;
