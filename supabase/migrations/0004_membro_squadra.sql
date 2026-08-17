-- Distingue "fa parte della squadra operativa" (appare in calendario, turni, cambi
-- turno, ferie/permessi) da "ha permessi di amministratore" (is_admin): finora erano
-- la stessa cosa, ma un account amministratore "puro" (es. il titolare, creato solo
-- per gestire il sistema) non deve comparire come se fosse un dipendente in rotazione.
-- Default true: tutti i dipendenti normali restano come sempre, si spegne solo per
-- account speciali come quello del titolare.

alter table public.profiles
  add column membro_squadra boolean not null default true;

update public.profiles set membro_squadra = false where is_admin and nome = 'Titolare' and cognome = 'Admin';
