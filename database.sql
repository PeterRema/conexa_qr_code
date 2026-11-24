-- Conexa Live · schema Supabase (v3)
-- Esegui tutto in Supabase > SQL Editor. Lo script è rieseguibile e aggiorna anche
-- un database creato con le versioni precedenti (v1, v2) senza perdere sessioni,
-- voti o modelli già salvati.
--
-- Novità v3: numero di domande libero, scelta singola o multipla per domanda,
-- nessun limite di lunghezza sui testi, link fisso per ogni sondaggio,
-- azzeramento ed eliminazione di sessioni e modelli dal pannello.

begin;

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------

create table if not exists public.poll_catalog (
  slug text primary key,
  title text,
  questions jsonb,
  archived boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.poll_catalog add column if not exists title text;
alter table public.poll_catalog add column if not exists questions jsonb;
alter table public.poll_catalog add column if not exists archived boolean not null default false;
alter table public.poll_catalog add column if not exists position integer not null default 0;
alter table public.poll_catalog add column if not exists created_at timestamptz not null default now();

-- option_counts (v1/v2) non serve più: il numero di opzioni si legge da questions.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'poll_catalog' and column_name = 'option_counts') then
    alter table public.poll_catalog drop constraint if exists poll_catalog_option_counts_check;
    alter table public.poll_catalog alter column option_counts drop not null;
  end if;
end $$;

-- I 7 sondaggi della presentazione (prima in polls.js). Vengono inseriti solo se
-- mancano o se non hanno ancora testo: le modifiche fatte dal pannello restano.
insert into public.poll_catalog (slug, title, questions, position) values
  ('inizio', 'Apertura · Da dove partiamo?', '[{"text":"Hotel nuovo da 30 camere con SPA, piscina e palestra: da quale impianto partiamo?","multiple":false,"max":null,"options":["Termica","Domotica","Networking","Sicurezza"]},{"text":"Chi siete?","multiple":false,"max":null,"options":["Progettista o ingegnere","Installatore","System integrator","Committente o gestore","Altro"]},{"text":"Nel vostro ultimo progetto alberghiero, quanti impianti dialogavano davvero con la supervisione?","multiple":false,"max":null,"options":["Nessuno","1–2","3–4","Tutti"]}]'::jsonb, 1),
  ('comfort-abb', 'Comfort termico · ABB', '[{"text":"Qual è la criticità termica più difficile in un hotel con SPA e piscina?","multiple":false,"max":null,"options":["Deumidificazione piscina","Camere non occupate","Picchi ACS di SPA e palestra","Bilanciamento aree comuni"]},{"text":"Regolazione in camera: cosa preferite?","multiple":false,"max":null,"options":["Termostato autonomo","Controller di camera integrato nel BMS","Gestione dalla reception o dal PMS"]},{"text":"Un BACS in classe B (UNI EN ISO 52120-1) per un hotel nuovo è…","multiple":false,"max":null,"options":["Un obbligo da rispettare","Un investimento che si ripaga","Un costo difficile da far accettare"]}]'::jsonb, 2),
  ('gestione-mdt', 'Controllo e gestione · MDT Italia', '[{"text":"Rilevazione presenza in camera: quale soluzione vi convince di più?","multiple":false,"max":null,"options":["Tasca porta o keycard","Sensore radar o PIR","Keycard + sensore","Stato check-in dal PMS"]},{"text":"Quanto risparmio energetico vi aspettate dalla gestione camera basata sulla presenza?","multiple":false,"max":null,"options":["Meno del 10%","10–20%","20–30%","Oltre il 30%"]},{"text":"AI nel building: cosa vi serve di più?","multiple":false,"max":null,"options":["Manutenzione predittiva","Ottimizzazione energetica","Analisi abitudini ospiti","Non mi fido ancora"]}]'::jsonb, 3),
  ('connettivita-qubix', 'Connettività · Qubix', '[{"text":"Rete impianti e rete ospiti: come le realizzate?","multiple":false,"max":null,"options":["Reti fisicamente separate","Stessa infrastruttura con VLAN","Dipende dal budget"]},{"text":"Per un hotel da 30 camere: GPON o rame?","multiple":false,"max":null,"options":["GPON","Rame Cat6A","Soluzione ibrida","Non ho esperienza GPON"]},{"text":"Dopo la consegna, chi è responsabile della cybersecurity della rete impianti?","multiple":false,"max":null,"options":["Installatore o integratore","IT del cliente","Fornitore esterno","Nessuno di preciso"]}]'::jsonb, 4),
  ('emergenza-linergy', 'Luci di emergenza · Linergy', '[{"text":"Illuminazione di emergenza: autonoma o centralizzata?","multiple":false,"max":null,"options":["Apparecchi autonomi","Sistema centralizzato","Dipende dall’edificio"]},{"text":"Come gestite le verifiche periodiche (UNI 11222)?","multiple":false,"max":null,"options":["A mano con registro","Autodiagnosi locale","Supervisione centralizzata con report"]},{"text":"Segnaletica di esodo dinamica, che cambia direzione in base all’incendio: l’avete mai installata?","multiple":false,"max":null,"options":["Sì","No, ma la valuterei","No, troppo complessa"]}]'::jsonb, 5),
  ('termocamere-dahua', 'Termocamere AI · Dahua', '[{"text":"Termocamera AI per la prevenzione incendi: dove la mettete per prima?","multiple":false,"max":null,"options":["Centrale termica e locali tecnici","Cucina e lavanderia","Sauna e SPA","Parcheggio e ricarica auto"]},{"text":"Chi deve ricevere l’allarme della termocamera?","multiple":false,"max":null,"options":["Centrale rivelazione incendio","Supervisione o BMS","Reception via app","Tutti"]},{"text":"Una termocamera può sostituire la rivelazione incendio tradizionale?","multiple":false,"max":null,"options":["Sì","No, è complementare","Solo in alcuni ambienti"]}]'::jsonb, 6),
  ('vvf', 'Vigili del Fuoco', '[{"text":"Un hotel da 30 camere è attività soggetta ai controlli VVF?","multiple":false,"max":null,"options":["Sì","No","Dipende dai posti letto"]},{"text":"Le strutture ricettive si progettano più spesso con…","multiple":false,"max":null,"options":["Codice di prevenzione incendi (RTV V.5)","Regola tecnica tradizionale","Dipende dal progetto"]},{"text":"Il punto più critico tra impianti di sicurezza e building automation?","multiple":false,"max":null,"options":["Responsabilità","Certificazione","Manutenzione","Interfacciamento tecnico"]}]'::jsonb, 7)

on conflict (slug) do update
  set title = excluded.title, questions = excluded.questions, position = excluded.position
  where public.poll_catalog.title is null or public.poll_catalog.questions is null;

-- Modelli personalizzati v2 senza posizione: in coda, in ordine di titolo.
with ranked as (
  select slug, row_number() over (order by title) + 100 as pos
  from public.poll_catalog where position = 0
)
update public.poll_catalog c set position = r.pos from ranked r where c.slug = r.slug;

create table if not exists public.poll_sessions (
  id uuid primary key default gen_random_uuid(),
  poll_slug text not null references public.poll_catalog(slug),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  round integer not null default 0,
  participants integer not null default 0,
  reset_at timestamptz
);
alter table public.poll_sessions add column if not exists round integer not null default 0;
alter table public.poll_sessions add column if not exists participants integer not null default 0;
alter table public.poll_sessions add column if not exists reset_at timestamptz;

create table if not exists public.vote_receipts (
  session_id uuid not null references public.poll_sessions(id),
  participant_id uuid not null,
  submitted_at timestamptz not null default now(),
  answers jsonb not null,
  primary key (session_id, participant_id)
);

-- v1/v2 salvavano le risposte come integer[3]: conversione in [[a],[b],[c]].
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'vote_receipts'
               and column_name = 'answers' and data_type = 'ARRAY') then
    alter table public.vote_receipts drop constraint if exists vote_receipts_answers_check;
    alter table public.vote_receipts add column answers_v3 jsonb;
    update public.vote_receipts r set answers_v3 = (
      select coalesce(jsonb_agg(jsonb_build_array(u.x) order by u.o), '[]'::jsonb)
      from unnest(r.answers) with ordinality as u(x, o));
    alter table public.vote_receipts drop column answers;
    alter table public.vote_receipts rename column answers_v3 to answers;
    alter table public.vote_receipts alter column answers set not null;
  end if;
end $$;

create table if not exists public.response_counts (
  session_id uuid not null references public.poll_sessions(id),
  question_index smallint not null,
  option_index smallint not null,
  vote_count bigint not null default 0 check (vote_count >= 0),
  primary key (session_id, question_index, option_index)
);
-- Toglie i limiti v1/v2 (massimo 3 domande e 10 opzioni).
alter table public.response_counts drop constraint if exists response_counts_question_index_check;
alter table public.response_counts drop constraint if exists response_counts_option_index_check;
alter table public.response_counts drop constraint if exists response_counts_indexes_check;
alter table public.response_counts add constraint response_counts_indexes_check
  check (question_index >= 0 and option_index >= 0);

-- Numero di partecipanti per le sessioni già esistenti.
update public.poll_sessions s set participants = c.n
from (select session_id, count(*)::int as n from public.vote_receipts group by session_id) c
where c.session_id = s.id and s.participants = 0;

create index if not exists poll_sessions_slug_created on public.poll_sessions (poll_slug, created_at desc);

-- Amministratori: solo gli account elencati qui gestiscono sessioni e modelli.
create table if not exists public.poll_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
-- Gli account già presenti in Authentication diventano admin. Per aggiungerne uno dopo:
--   insert into public.poll_admins(user_id) select id from auth.users where email = 'nome@dominio.it';
insert into public.poll_admins(user_id) select id from auth.users on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Funzioni di controllo
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.poll_admins a where a.user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Modello valido: 1–100 domande; testo non vuoto (nessun limite di lunghezza);
-- 2–50 opzioni non vuote e non ripetute; scelta multipla con limite facoltativo.
-- Le policy di scrittura v2 non servono più (le scritture passano dalle funzioni)
-- e vanno tolte prima della vecchia funzione di controllo da cui dipendono.
drop policy if exists "admins create poll models" on public.poll_catalog;
drop policy if exists "admins archive poll models" on public.poll_catalog;
drop policy if exists "admins create sessions" on public.poll_sessions;
drop policy if exists "admins close sessions" on public.poll_sessions;
drop function if exists public.valid_poll_model(jsonb, integer[]);
create or replace function public.valid_poll_model(p_questions jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare q jsonb; o jsonb; n integer;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) not between 1 and 100 then return false; end if;
  for q in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(q) <> 'object' or jsonb_typeof(q->'text') is distinct from 'string'
       or btrim(q->>'text') = '' then return false; end if;
    if jsonb_typeof(q->'options') is distinct from 'array' then return false; end if;
    n := jsonb_array_length(q->'options');
    if n not between 2 and 50 then return false; end if;
    for o in select value from jsonb_array_elements(q->'options') loop
      if jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' then return false; end if;
    end loop;
    if (select count(distinct lower(btrim(value #>> '{}'))) from jsonb_array_elements(q->'options')) <> n then
      return false;
    end if;
    if q ? 'multiple' and jsonb_typeof(q->'multiple') not in ('boolean','null') then return false; end if;
    if q ? 'max' and jsonb_typeof(q->'max') <> 'null' then
      if jsonb_typeof(q->'max') <> 'number' or (q->>'max')::numeric <> trunc((q->>'max')::numeric)
         or (q->>'max')::numeric not between 1 and n then return false; end if;
    end if;
  end loop;
  return true;
end $$;

-- Struttura che determina il significato dei voti (numero domande/opzioni, tipo).
create or replace function public.poll_structure(p_questions jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
           jsonb_array_length(q.value->'options'),
           coalesce((q.value->>'multiple')::boolean, false),
           case when coalesce((q.value->>'multiple')::boolean, false) then q.value->'max' else 'null'::jsonb end)
         order by q.ordinality), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) with ordinality q;
$$;

-- Svuota i voti di una sessione (usata da azzeramento e modifica modello).
create or replace function public.clear_session_votes(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.vote_receipts where session_id = p_session_id;
  delete from public.response_counts where session_id = p_session_id;
  update public.poll_sessions
     set participants = 0, round = round + 1, reset_at = now()
   where id = p_session_id;
end $$;
revoke execute on function public.clear_session_votes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funzioni per il pannello di gestione (solo amministratori)
-- ---------------------------------------------------------------------------

create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN' using errcode = '42501'; end if;
end $$;
revoke execute on function public.require_admin() from public, anon;
grant execute on function public.require_admin() to authenticated;

-- Crea o aggiorna un modello. Lo slug è il link fisso e non cambia più.
-- Se cambia la struttura e ci sono voti, serve p_force: i voti vengono azzerati.
create or replace function public.save_poll_model(p_slug text, p_title text, p_questions jsonb, p_force boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare existing record; has_votes boolean; s record;
begin
  perform public.require_admin();
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 60 then
    raise exception 'INVALID_SLUG';
  end if;
  if p_title is null or btrim(p_title) = '' then raise exception 'INVALID_TITLE'; end if;
  if not public.valid_poll_model(p_questions) then raise exception 'INVALID_MODEL'; end if;

  select * into existing from public.poll_catalog where slug = p_slug for update;
  if not found then
    insert into public.poll_catalog (slug, title, questions, position)
    values (p_slug, btrim(p_title), p_questions,
            coalesce((select max(position) from public.poll_catalog), 0) + 1);
    return p_slug;
  end if;

  if public.poll_structure(existing.questions) is distinct from public.poll_structure(p_questions) then
    select exists (select 1 from public.vote_receipts r join public.poll_sessions ps on ps.id = r.session_id
                   where ps.poll_slug = p_slug) into has_votes;
    if has_votes and not coalesce(p_force, false) then raise exception 'MODEL_HAS_VOTES'; end if;
    for s in select id from public.poll_sessions where poll_slug = p_slug loop
      perform public.clear_session_votes(s.id);
    end loop;
  end if;

  update public.poll_catalog set title = btrim(p_title), questions = p_questions where slug = p_slug;
  return p_slug;
end $$;

create or replace function public.set_poll_archived(p_slug text, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.poll_catalog set archived = coalesce(p_archived, false) where slug = p_slug;
end $$;

-- Avvia una sessione; le altre sessioni aperte dello stesso sondaggio vengono chiuse,
-- così il link fisso porta sempre a una sola votazione.
create or replace function public.start_session(p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform public.require_admin();
  if not exists (select 1 from public.poll_catalog where slug = p_slug and questions is not null) then
    raise exception 'POLL_NOT_FOUND';
  end if;
  update public.poll_sessions set status = 'closed', closed_at = now()
   where poll_slug = p_slug and status = 'open';
  insert into public.poll_sessions (poll_slug) values (p_slug) returning id into new_id;
  return new_id;
end $$;

create or replace function public.close_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.poll_sessions set status = 'closed', closed_at = now()
   where id = p_session_id and status = 'open';
end $$;

-- Azzera i voti e riapre la sessione (chiudendo le altre aperte dello stesso sondaggio).
create or replace function public.reset_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare slug text;
begin
  perform public.require_admin();
  select poll_slug into slug from public.poll_sessions where id = p_session_id for update;
  if slug is null then raise exception 'SESSION_NOT_FOUND'; end if;
  update public.poll_sessions set status = 'closed', closed_at = now()
   where poll_slug = slug and status = 'open' and id <> p_session_id;
  perform public.clear_session_votes(p_session_id);
  update public.poll_sessions set status = 'open', closed_at = null where id = p_session_id;
end $$;

create or replace function public.delete_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  delete from public.vote_receipts where session_id = p_session_id;
  delete from public.response_counts where session_id = p_session_id;
  delete from public.poll_sessions where id = p_session_id;
end $$;

-- Elimina il modello con tutte le sue sessioni e i voti.
create or replace function public.delete_poll_model(p_slug text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  delete from public.vote_receipts where session_id in (select id from public.poll_sessions where poll_slug = p_slug);
  delete from public.response_counts where session_id in (select id from public.poll_sessions where poll_slug = p_slug);
  delete from public.poll_sessions where poll_slug = p_slug;
  delete from public.poll_catalog where slug = p_slug;
end $$;

revoke execute on function public.save_poll_model(text, text, jsonb, boolean) from public, anon;
revoke execute on function public.set_poll_archived(text, boolean) from public, anon;
revoke execute on function public.start_session(text) from public, anon;
revoke execute on function public.close_session(uuid) from public, anon;
revoke execute on function public.reset_session(uuid) from public, anon;
revoke execute on function public.delete_session(uuid) from public, anon;
revoke execute on function public.delete_poll_model(text) from public, anon;
grant execute on function public.save_poll_model(text, text, jsonb, boolean) to authenticated;
grant execute on function public.set_poll_archived(text, boolean) to authenticated;
grant execute on function public.start_session(text) to authenticated;
grant execute on function public.close_session(uuid) to authenticated;
grant execute on function public.reset_session(uuid) to authenticated;
grant execute on function public.delete_session(uuid) to authenticated;
grant execute on function public.delete_poll_model(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Invio del voto (unica scrittura consentita al pubblico)
-- p_answers: una lista per domanda con gli indici scelti, es. [[0],[1,3],[2]]
-- ---------------------------------------------------------------------------

drop function if exists public.submit_vote(uuid, uuid, integer[]);
create or replace function public.submit_vote(p_session_id uuid, p_participant_id uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  qs jsonb; current_status text; n integer; i integer; a jsonb; q jsonb; k integer; nopt integer;
  is_multi boolean; e jsonb; v numeric;
begin
  if p_participant_id is null or p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Invalid vote';
  end if;

  select s.status, c.questions into current_status, qs
  from public.poll_sessions s join public.poll_catalog c on c.slug = s.poll_slug
  where s.id = p_session_id
  for update of s;

  if current_status is null then raise exception 'Session not found'; end if;
  if current_status <> 'open' then raise exception 'Session is closed'; end if;
  n := jsonb_array_length(qs);
  if jsonb_array_length(p_answers) <> n then raise exception 'Invalid answer'; end if;

  for i in 0 .. n - 1 loop
    a := p_answers -> i; q := qs -> i;
    if jsonb_typeof(a) <> 'array' then raise exception 'Invalid answer'; end if;
    k := jsonb_array_length(a);
    nopt := jsonb_array_length(q -> 'options');
    is_multi := coalesce((q ->> 'multiple')::boolean, false);
    if k < 1 or (not is_multi and k <> 1) then raise exception 'Invalid answer'; end if;
    if is_multi and jsonb_typeof(q -> 'max') = 'number' and k > (q ->> 'max')::int then
      raise exception 'Invalid answer';
    end if;
    for e in select value from jsonb_array_elements(a) loop
      if jsonb_typeof(e) <> 'number' then raise exception 'Invalid answer'; end if;
      v := (e #>> '{}')::numeric;
      if v <> trunc(v) or v < 0 or v >= nopt then raise exception 'Invalid answer'; end if;
    end loop;
    if (select count(distinct value) from jsonb_array_elements(a)) <> k then raise exception 'Invalid answer'; end if;
  end loop;

  insert into public.vote_receipts(session_id, participant_id, answers)
  values (p_session_id, p_participant_id, p_answers);

  for i in 0 .. n - 1 loop
    for e in select value from jsonb_array_elements(p_answers -> i) loop
      insert into public.response_counts(session_id, question_index, option_index, vote_count)
      values (p_session_id, i, (e #>> '{}')::int, 1)
      on conflict (session_id, question_index, option_index)
      do update set vote_count = public.response_counts.vote_count + 1;
    end loop;
  end loop;

  update public.poll_sessions set participants = participants + 1 where id = p_session_id;
end $$;

revoke execute on function public.submit_vote(uuid, uuid, jsonb) from public;
grant execute on function public.submit_vote(uuid, uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: il pubblico legge modelli, sessioni e totali aggregati.
-- Tutte le scritture passano dalle funzioni sopra.
-- ---------------------------------------------------------------------------

alter table public.poll_catalog enable row level security;
alter table public.poll_sessions enable row level security;
alter table public.vote_receipts enable row level security;
alter table public.response_counts enable row level security;
alter table public.poll_admins enable row level security;

drop policy if exists "catalog is readable" on public.poll_catalog;
create policy "catalog is readable" on public.poll_catalog for select to anon, authenticated using (true);
drop policy if exists "sessions are readable" on public.poll_sessions;
create policy "sessions are readable" on public.poll_sessions for select to anon, authenticated using (true);
drop policy if exists "aggregates are readable" on public.response_counts;
create policy "aggregates are readable" on public.response_counts for select to anon, authenticated using (true);
drop policy if exists "admins see own row" on public.poll_admins;
create policy "admins see own row" on public.poll_admins for select to authenticated using (user_id = auth.uid());

revoke all on public.poll_catalog, public.poll_sessions, public.vote_receipts,
              public.response_counts, public.poll_admins from anon, authenticated;
grant select on public.poll_catalog, public.poll_sessions, public.response_counts to anon, authenticated;
grant select on public.poll_admins to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: totali, stato sessioni e modifiche ai modelli arrivano subito ai telefoni.
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.response_counts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.poll_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.poll_catalog; exception when duplicate_object then null; end $$;

commit;
