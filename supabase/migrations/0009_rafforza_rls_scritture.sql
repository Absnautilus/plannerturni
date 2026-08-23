-- Fase 1.5 — chiude il buco di sicurezza lasciato apertamente in Fase 1 (vedi commento
-- in 0001_init.sql): su turni/richieste_swap/richieste_assenza/richieste_preassegnazione
-- la policy di scrittura era "using (true)" per chiunque fosse autenticato, quindi un
-- qualsiasi dipendente poteva, chiamando direttamente le API Supabase (non solo dalla UI),
-- modificare i turni di un collega, approvare da solo una propria richiesta, o cancellare
-- le richieste altrui. Le regole restano quelle già implementate lato client in
-- src/domain/*.js (questa non è ancora la Fase 2 promessa, che sposterà la validazione
-- completa dentro funzioni Postgres): qui si vincola solo CHI può scrivere COSA, replicando
-- in RLS i percorsi che il client usa davvero, non l'intera macchina a stati.

-- ---------- richieste_swap ----------
-- Percorsi reali (src/PlannerTurni.jsx):
--  - richiediSwap(): chi la crea è sempre il richiedente (da_profile_id = auth.uid()).
--  - rispondiSwapCollega(): risponde solo il collega destinatario (a_profile_id).
--  - rispondiSwapAdmin(): risponde solo l'admin.
-- Nessun percorso client cancella righe: la delete resta riservata all'admin.

drop policy if exists "richieste swap gestibili da chiunque sia autenticato (Fase 1)" on public.richieste_swap;

create policy "un dipendente crea richieste di swap solo come richiedente"
  on public.richieste_swap for insert
  to authenticated
  with check (auth.uid() = da_profile_id);

create policy "solo le due parti coinvolte o l'admin rispondono a uno swap"
  on public.richieste_swap for update
  to authenticated
  using (auth.uid() in (da_profile_id, a_profile_id) or public.is_admin())
  with check (auth.uid() in (da_profile_id, a_profile_id) or public.is_admin());

create policy "solo l'admin elimina richieste di swap"
  on public.richieste_swap for delete
  to authenticated
  using (public.is_admin());

-- ---------- richieste_assenza ----------
-- richiediAssenza() è sempre self-service (nessuna richiesta per conto di altri); solo
-- l'admin la approva/rifiuta (gestisciAssenza(), gate isAdmin lato UI).

drop policy if exists "richieste assenza gestibili da chiunque sia autenticato (Fase 1)" on public.richieste_assenza;

create policy "un dipendente crea richieste di assenza solo per sé"
  on public.richieste_assenza for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "solo l'admin decide sulle richieste di assenza"
  on public.richieste_assenza for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- richieste_preassegnazione ----------
-- richiediPreassegnazione() può essere creata dall'admin anche per un altro dipendente
-- (RichiediPreassegnazioneForm, quando isAdmin sceglie empTarget); un dipendente normale
-- può crearla solo per sé. Solo l'admin approva/rifiuta (gestisciPreassegnazione()).

drop policy if exists "pre-assegnazioni gestibili da chiunque sia autenticato (Fase 1)" on public.richieste_preassegnazione;

create policy "un dipendente crea pre-assegnazioni per sé, l'admin anche per altri"
  on public.richieste_preassegnazione for insert
  to authenticated
  with check (auth.uid() = profile_id or public.is_admin());

create policy "solo l'admin decide sulle pre-assegnazioni"
  on public.richieste_preassegnazione for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- turni ----------
-- L'unico percorso in cui un NON admin scrive turni() è l'applicazione di uno scambio già
-- concordato in mese Bozza (applicaSwapEffettivo(), chiamata da rispondiSwapCollega()): tocca
-- sempre e solo le due celle (profile_id, data) della richiesta appena diventata "applicata",
-- e solo per le due parti coinvolte. Tutto il resto (salvaTurni, approvazione assenze,
-- pre-assegnazioni) è admin-only lato client: qui lo rendiamo vincolante lato DB.
--
-- updated_at + trigger servono a delimitare nel tempo il permesso: senza un limite, una
-- richiesta rimasta "applicata" per sempre darebbe alle due ex-parti un accesso permanente
-- a quella singola cella, anche mesi dopo. 10 minuti bastano ampiamente al giro sincrono
-- update-stato -> sincronizzaTurnoSingolo() che fa già il client.

alter table public.richieste_swap add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists richieste_swap_set_updated_at on public.richieste_swap;
create trigger richieste_swap_set_updated_at
  before update on public.richieste_swap
  for each row execute function public.set_updated_at();

create or replace function public.turno_swap_consentito(p_profile_id uuid, p_anno smallint, p_mese smallint, p_giorno smallint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.richieste_swap r
    where r.stato = 'applicata'
      and r.updated_at > now() - interval '10 minutes'
      and (auth.uid() = r.da_profile_id or auth.uid() = r.a_profile_id)
      and (
        (r.da_profile_id = p_profile_id and r.anno_da = p_anno and r.mese_da = p_mese and r.giorno_da = p_giorno)
        or
        (r.a_profile_id = p_profile_id and r.anno_a = p_anno and r.mese_a = p_mese and r.giorno_a = p_giorno)
      )
  );
$$;

drop policy if exists "turni scrivibili da chiunque sia autenticato (Fase 1)" on public.turni;

create policy "l'admin scrive qualsiasi turno"
  on public.turni for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "un dipendente applica solo lo scambio turno appena concordato"
  on public.turni for all
  to authenticated
  using (public.turno_swap_consentito(profile_id, anno, mese, giorno))
  with check (public.turno_swap_consentito(profile_id, anno, mese, giorno));

NOTIFY pgrst, 'reload schema';
