-- Planner Turni — schema iniziale.
--
-- Tutti i dipendenti vedono il calendario di tutta la squadra (è così anche oggi,
-- lato client): le policy SELECT sono aperte a chiunque sia autenticato. Le scritture
-- su turni/richieste sono per ora permissive tra colleghi autenticati (squadra fidata,
-- team interno) — è una scelta intenzionale per la Fase 1: la Fase 2 porterà la logica
-- di validazione già scritta in src/domain/*.js dentro funzioni Postgres (RPC
-- SECURITY DEFINER), così le regole (es. "solo l'admin approva", "un turno bloccato
-- non si tocca") diventano vincoli reali del database e non solo della UI.

create extension if not exists pgcrypto;

-- ---------- Profili (1:1 con auth.users) ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  cognome text not null,
  nome text not null,
  tipo text not null check (tipo in ('diurno','turnante','notturno','direttore','fom')),
  riposo_tipo text not null default 'rotante' check (riposo_tipo in ('rotante','fisso')),
  riposo_fisso_giorno smallint,
  rotation_slot smallint,
  active boolean not null default true,
  colore text not null,
  turni_extra text[] not null default '{}',
  quota_ferie_annua smallint not null default 26,
  quota_permessi_ore_annue smallint not null default 88,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profili visibili a chiunque sia autenticato"
  on public.profiles for select
  to authenticated
  using (true);

create policy "un dipendente modifica solo il proprio profilo"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "l'admin gestisce tutti i profili"
  on public.profiles for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- Turni assegnati ----------

create table public.turni (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  anno smallint not null,
  mese smallint not null check (mese between 0 and 11),
  giorno smallint not null check (giorno between 1 and 31),
  code text not null,
  dnm boolean not null default false,
  unique (profile_id, anno, mese, giorno)
);

alter table public.turni enable row level security;

create policy "turni visibili a chiunque sia autenticato"
  on public.turni for select
  to authenticated
  using (true);

create policy "turni scrivibili da chiunque sia autenticato (Fase 1)"
  on public.turni for all
  to authenticated
  using (true)
  with check (true);

-- ---------- Richieste di cambio turno ----------

create table public.richieste_swap (
  id bigint generated always as identity primary key,
  da_profile_id uuid not null references public.profiles(id) on delete cascade,
  a_profile_id uuid not null references public.profiles(id) on delete cascade,
  anno_da smallint not null,
  mese_da smallint not null,
  giorno_da smallint not null,
  anno_a smallint not null,
  mese_a smallint not null,
  giorno_a smallint not null,
  turno_da text,
  turno_a text,
  stato text not null default 'in_attesa_collega',
  nota_sistema text,
  created_at timestamptz not null default now()
);

alter table public.richieste_swap enable row level security;

create policy "richieste swap visibili a chiunque sia autenticato"
  on public.richieste_swap for select
  to authenticated
  using (true);

create policy "richieste swap gestibili da chiunque sia autenticato (Fase 1)"
  on public.richieste_swap for all
  to authenticated
  using (true)
  with check (true);

-- ---------- Richieste ferie/permessi ----------

create table public.richieste_assenza (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  anno smallint not null,
  mese smallint not null,
  giorno smallint not null,
  tipo text not null check (tipo in ('F','P')),
  turno_interessato text,
  nota text,
  ore numeric,
  ora_inizio text,
  ora_fine text,
  stato text not null default 'in sospeso',
  created_at timestamptz not null default now()
);

alter table public.richieste_assenza enable row level security;

create policy "richieste assenza visibili a chiunque sia autenticato"
  on public.richieste_assenza for select
  to authenticated
  using (true);

create policy "richieste assenza gestibili da chiunque sia autenticato (Fase 1)"
  on public.richieste_assenza for all
  to authenticated
  using (true)
  with check (true);

-- ---------- Richieste di pre-assegnazione ----------

create table public.richieste_preassegnazione (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  anno smallint not null,
  mese smallint not null,
  giorno smallint not null,
  turno text not null,
  nota text,
  stato text not null default 'in sospeso',
  created_at timestamptz not null default now()
);

alter table public.richieste_preassegnazione enable row level security;

create policy "pre-assegnazioni visibili a chiunque sia autenticato"
  on public.richieste_preassegnazione for select
  to authenticated
  using (true);

create policy "pre-assegnazioni gestibili da chiunque sia autenticato (Fase 1)"
  on public.richieste_preassegnazione for all
  to authenticated
  using (true)
  with check (true);

-- ---------- Stato bozza/definitivo per mese ----------

create table public.stato_mese (
  anno smallint not null,
  mese smallint not null,
  stato text not null default 'bozza' check (stato in ('bozza','definitivo')),
  primary key (anno, mese)
);

alter table public.stato_mese enable row level security;

create policy "stato mese visibile a chiunque sia autenticato"
  on public.stato_mese for select
  to authenticated
  using (true);

create policy "solo l'admin cambia lo stato del mese"
  on public.stato_mese for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- Impostazioni (copertura, regole attive, ordine preferenze) ----------
-- Poche righe, valore libero: più semplice di una tabella per ciascun tipo di regola.

create table public.impostazioni (
  chiave text primary key,
  valore jsonb not null
);

alter table public.impostazioni enable row level security;

create policy "impostazioni visibili a chiunque sia autenticato"
  on public.impostazioni for select
  to authenticated
  using (true);

create policy "solo l'admin cambia le impostazioni"
  on public.impostazioni for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- Preferenze turni per dipendente ----------

create table public.preferenze (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  ordine_preferenza text[] not null default '{}',
  evita_sequenze_scomode boolean not null default true,
  preferenze_giorno jsonb not null default '{}'::jsonb
);

alter table public.preferenze enable row level security;

create policy "preferenze visibili a chiunque sia autenticato"
  on public.preferenze for select
  to authenticated
  using (true);

create policy "un dipendente modifica solo le proprie preferenze"
  on public.preferenze for all
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- ---------- Notifiche lette (per dipendente) ----------

create table public.notifiche_lette (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  notifica_id text not null,
  letta_il timestamptz not null default now(),
  primary key (profile_id, notifica_id)
);

alter table public.notifiche_lette enable row level security;

create policy "un dipendente vede e segna solo le proprie notifiche"
  on public.notifiche_lette for all
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);
