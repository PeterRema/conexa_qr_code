-- Esegui una sola volta in Supabase > SQL Editor.
-- Il database conserva le sessioni chiuse e non consente di modificare o
-- cancellare un voto già inviato. Le risposte grezze non sono leggibili dal browser.

create table if not exists public.poll_catalog (
  slug text primary key,
  option_counts integer[] not null check (cardinality(option_counts) = 3)
);

insert into public.poll_catalog (slug, option_counts) values
  ('inizio', array[4,5,4]),
  ('comfort-abb', array[4,3,3]),
  ('gestione-mdt', array[4,4,4]),
  ('connettivita-qubix', array[3,4,4]),
  ('emergenza-linergy', array[3,3,3]),
  ('termocamere-dahua', array[4,4,3]),
  ('vvf', array[3,3,4])
on conflict (slug) do update set option_counts = excluded.option_counts;

create table if not exists public.poll_sessions (
  id uuid primary key default gen_random_uuid(),
  poll_slug text not null references public.poll_catalog(slug),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.vote_receipts (
  session_id uuid not null references public.poll_sessions(id),
  participant_id uuid not null,
  submitted_at timestamptz not null default now(),
  answers integer[] not null check (cardinality(answers) = 3),
  primary key (session_id, participant_id)
);

create table if not exists public.response_counts (
  session_id uuid not null references public.poll_sessions(id),
  question_index smallint not null check (question_index between 0 and 2),
  option_index smallint not null check (option_index between 0 and 9),
  vote_count bigint not null default 0 check (vote_count >= 0),
  primary key (session_id, question_index, option_index)
);

alter table public.poll_catalog enable row level security;
alter table public.poll_sessions enable row level security;
alter table public.vote_receipts enable row level security;
alter table public.response_counts enable row level security;

drop policy if exists "catalog is readable" on public.poll_catalog;
create policy "catalog is readable" on public.poll_catalog for select to anon, authenticated using (true);
drop policy if exists "sessions are readable" on public.poll_sessions;
create policy "sessions are readable" on public.poll_sessions for select to anon, authenticated using (true);
drop policy if exists "admins create sessions" on public.poll_sessions;
create policy "admins create sessions" on public.poll_sessions for insert to authenticated with check (true);
drop policy if exists "admins close sessions" on public.poll_sessions;
create policy "admins close sessions" on public.poll_sessions for update to authenticated using (status = 'open') with check (status = 'closed');
drop policy if exists "aggregates are readable" on public.response_counts;
create policy "aggregates are readable" on public.response_counts for select to anon, authenticated using (true);

revoke all on public.poll_catalog from anon, authenticated;
grant select on public.poll_catalog to anon, authenticated;
revoke all on public.poll_sessions from anon, authenticated;
grant select on public.poll_sessions to anon, authenticated;
grant insert (poll_slug) on public.poll_sessions to authenticated;
grant update (status, closed_at) on public.poll_sessions to authenticated;
revoke all on public.vote_receipts from anon, authenticated;
revoke all on public.response_counts from anon, authenticated;
grant select on public.response_counts to anon, authenticated;

create or replace function public.submit_vote(p_session_id uuid, p_participant_id uuid, p_answers integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_counts integer[];
  current_status text;
  q integer;
begin
  if p_participant_id is null or p_answers is null or cardinality(p_answers) <> 3 then
    raise exception 'Invalid vote';
  end if;

  select s.status, c.option_counts into current_status, allowed_counts
  from public.poll_sessions s
  join public.poll_catalog c on c.slug = s.poll_slug
  where s.id = p_session_id
  for update of s;

  if current_status is null then raise exception 'Session not found'; end if;
  if current_status <> 'open' then raise exception 'Session is closed'; end if;
  for q in 1..3 loop
    if p_answers[q] < 0 or p_answers[q] >= allowed_counts[q] then
      raise exception 'Invalid answer';
    end if;
  end loop;

  insert into public.vote_receipts(session_id, participant_id, answers)
  values (p_session_id, p_participant_id, p_answers);

  for q in 1..3 loop
    insert into public.response_counts(session_id, question_index, option_index, vote_count)
    values (p_session_id, q - 1, p_answers[q], 1)
    on conflict (session_id, question_index, option_index)
    do update set vote_count = public.response_counts.vote_count + 1;
  end loop;
end;
$$;

revoke execute on function public.submit_vote(uuid, uuid, integer[]) from public;
grant execute on function public.submit_vote(uuid, uuid, integer[]) to anon, authenticated;

-- I totali aggregati alimentano i grafici live; lo stato sessione segnala la chiusura al pubblico.
do $$ begin
  alter publication supabase_realtime add table public.response_counts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.poll_sessions;
exception when duplicate_object then null;
end $$;
