-- Motivo del rifiuto (obbligatorio lato UI quando l'admin rifiuta una richiesta): mai
-- migrato finora perché le richieste vivevano solo in localStorage. Necessario ora che
-- richieste_swap/richieste_assenza/richieste_preassegnazione diventano condivise su Supabase.
alter table public.richieste_swap add column motivo_rifiuto text;
alter table public.richieste_assenza add column motivo_rifiuto text;
alter table public.richieste_preassegnazione add column motivo_rifiuto text;
