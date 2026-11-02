-- Conexa Live · schema Supabase (v2)
-- Esegui in Supabase > SQL Editor. Lo script è rieseguibile: va bene sia su un
-- progetto nuovo sia su un database dove avevi già eseguito la versione precedente.
-- Nessun dato esistente (sessioni, voti, modelli) viene cancellato.
--
-- Il database conserva le sessioni chiuse e non consente di modificare o
-- cancellare un voto già inviato. Le risposte grezze non sono leggibili dal browser.

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------

create table if not exists public.poll_catalog (
  slug text primary key,
  option_counts integer[] not null check (cardinality(option_counts) = 3),
  title text,
  questions jsonb,
  archived boolean not null default false
);

alter table public.poll_catalog add column if not exists title text;
alter table public.poll_catalog add column if not exists questions jsonb;
alter table public.poll_catalog add column if not exists archived boolean not null default false;

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

-- Amministratori: solo gli account elencati qui possono gestire sessioni e modelli.
-- Un account creato con la registrazione pubblica di Supabase NON diventa admin.
create table if not exists public.poll_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

-- Gli account già presenti in Authentication al momento dell'esecuzione diventano admin.
-- Per aggiungerne uno in seguito:
--   insert into public.poll_admins(user_id) select id from auth.users where email = 'nome@dominio.it';
insert into public.poll_admins(user_id) select id from auth.users on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Funzioni di supporto
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.poll_admins a where a.user_id = auth.uid());
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Controllo lato server di un modello personalizzato:
-- 3 domande, testo 1–220 caratteri, 2–10 opzioni di 1–120 caratteri,
-- option_counts coerente con il numero di opzioni.
create or replace function public.valid_poll_model(p_questions jsonb, p_counts integer[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  q jsonb;
  o jsonb;
  i integer := 0;
  n integer;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) <> 3 then
    return false;
  end if;
  if p_counts is null or cardinality(p_counts) <> 3 then return false; end if;
  for q in select value from jsonb_array_elements(p_questions) loop
    i := i + 1;
    if jsonb_typeof(q) <> 'object' then return false; end if;
    if jsonb_typeof(q->'text') <> 'string' then return false; end if;
    if char_length(btrim(q->>'text')) not between 1 and 220 then return false; end if;
    if jsonb_typeof(q->'options') <> 'array' then return false; end if;
    n := jsonb_array_length(q->'options');
    if n not between 2 and 10 or p_counts[i] is distinct from n then return false; end if;
    for o in select value from jsonb_array_elements(q->'options') loop
      if jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 120 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

grant execute on function public.valid_poll_model(jsonb, integer[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.poll_catalog enable row level security;
alter table public.poll_sessions enable row level security;
alter table public.vote_receipts enable row level security;
alter table public.response_counts enable row level security;
alter table public.poll_admins enable row level security;

drop policy if exists "catalog is readable" on public.poll_catalog;
create policy "catalog is readable" on public.poll_catalog
  for select to anon, authenticated using (true);

drop policy if exists "admins create poll models" on public.poll_catalog;
create policy "admins create poll models" on public.poll_catalog
  for insert to authenticated
  with check (
    public.is_admin()
    and slug like 'custom-%'
    and char_length(btrim(coalesce(title, ''))) between 1 and 80
    and archived = false
    and public.valid_poll_model(questions, option_counts)
  );

drop policy if exists "admins archive poll models" on public.poll_catalog;
create policy "admins archive poll models" on public.poll_catalog
  for update to authenticated
  using (public.is_admin() and slug like 'custom-%')
  with check (public.is_admin() and slug like 'custom-%');

drop policy if exists "sessions are readable" on public.poll_sessions;
create policy "sessions are readable" on public.poll_sessions
  for select to anon, authenticated using (true);

drop policy if exists "admins create sessions" on public.poll_sessions;
create policy "admins create sessions" on public.poll_sessions
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins close sessions" on public.poll_sessions;
create policy "admins close sessions" on public.poll_sessions
  for update to authenticated
  using (public.is_admin() and status = 'open')
  with check (public.is_admin() and status = 'closed');

drop policy if exists "aggregates are readable" on public.response_counts;
create policy "aggregates are readable" on public.response_counts
  for select to anon, authenticated using (true);

drop policy if exists "admins see own row" on public.poll_admins;
create policy "admins see own row" on public.poll_admins
  for select to authenticated using (user_id = auth.uid());

-- Permessi a livello di colonna
revoke all on public.poll_catalog from anon, authenticated;
grant select on public.poll_catalog to anon, authenticated;
grant insert (slug, option_counts, title, questions) on public.poll_catalog to authenticated;
grant update (archived) on public.poll_catalog to authenticated;

revoke all on public.poll_sessions from anon, authenticated;
grant select on public.poll_sessions to anon, authenticated;
grant insert (poll_slug) on public.poll_sessions to authenticated;
grant update (status, closed_at) on public.poll_sessions to authenticated;

revoke all on public.vote_receipts from anon, authenticated;
revoke all on public.response_counts from anon, authenticated;
grant select on public.response_counts to anon, authenticated;

revoke all on public.poll_admins from anon, authenticated;
grant select on public.poll_admins to authenticated;

-- ---------------------------------------------------------------------------
-- Invio del voto (unica via di scrittura per il pubblico)
-- ---------------------------------------------------------------------------

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
    if p_answers[q] is null or p_answers[q] < 0 or p_answers[q] >= allowed_counts[q] then
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

-- ---------------------------------------------------------------------------
-- Realtime: i totali aggregati alimentano i grafici live,
-- lo stato sessione segnala la chiusura al pubblico.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.response_counts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.poll_sessions;
exception when duplicate_object then null;
end $$;
