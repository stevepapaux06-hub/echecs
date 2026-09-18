-- Final pedagogical evidence is the durable source of truth for recurring
-- weaknesses. Raw Pattern Engine detections never enter this table.
create table public.pedagogical_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  moment_id text not null,
  position_ply integer,
  concept_slug text not null,
  reason text not null check (reason in ('ERROR', 'OPPORTUNITY')),
  confidence numeric(4, 3) not null check (confidence between 0.800 and 1.000),
  played_at timestamptz,
  analyzed_at timestamptz not null default now(),
  source_exercise_id text not null,
  validation_fingerprint text not null,
  is_active boolean not null default true,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id, moment_id, concept_slug),
  check ((is_active and invalidated_at is null) or (not is_active and invalidated_at is not null))
);

create index pedagogical_evidence_user_active_concept_idx
  on public.pedagogical_evidence (user_id, concept_slug, played_at desc)
  where is_active;

create index pedagogical_evidence_user_game_idx
  on public.pedagogical_evidence (user_id, game_id);

alter table public.pedagogical_evidence enable row level security;

create policy "pedagogical_evidence_select_own"
  on public.pedagogical_evidence for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "pedagogical_evidence_insert_own"
  on public.pedagogical_evidence for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "pedagogical_evidence_update_own"
  on public.pedagogical_evidence for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "pedagogical_evidence_delete_own"
  on public.pedagogical_evidence for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.pedagogical_evidence from anon;
grant select, insert, update, delete on public.pedagogical_evidence to authenticated;
