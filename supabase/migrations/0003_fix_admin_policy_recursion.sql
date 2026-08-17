-- Le policy "solo l'admin può..." controllavano is_admin con una sotto-query su
-- public.profiles DENTRO una policy DI public.profiles stessa: ogni riga letta
-- ri-attivava la RLS sulla stessa tabella, causando "infinite recursion detected in
-- policy for relation profiles" — che Postgres restituisce come errore secco sulla
-- query, azzerando anche il semplice "select * from profiles" per l'utente loggato.
--
-- Fix standard: una funzione SECURITY DEFINER che legge is_admin bypassando la RLS
-- (gira con i permessi di chi l'ha creata, non di chi la chiama), spezzando il ciclo.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "l'admin gestisce tutti i profili" on public.profiles;
create policy "l'admin gestisce tutti i profili"
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "solo l'admin cambia lo stato del mese" on public.stato_mese;
create policy "solo l'admin cambia lo stato del mese"
  on public.stato_mese for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "solo l'admin cambia le impostazioni" on public.impostazioni;
create policy "solo l'admin cambia le impostazioni"
  on public.impostazioni for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
