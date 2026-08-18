-- Copia (denormalizzata) dell'email di auth.users su profiles: il client non può leggere
-- auth.users di altri utenti, ma deve poter mostrare "email da impostare" per i dipendenti
-- creati senza email/PIN (vedi le Edge Function create-employee e
-- update-employee-credentials, che sono le uniche a scrivere questi due campi).
alter table public.profiles add column email text;
alter table public.profiles add column credenziali_da_impostare boolean not null default false;
