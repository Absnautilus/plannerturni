-- Da eseguire UNA VOLTA, dopo aver creato il tuo utente da
-- Authentication → Users → Add user (con "Auto Confirm User" spuntato).
-- Sostituisci l'email qui sotto con quella che hai usato per crearlo.

insert into public.profiles (id, cognome, nome, tipo, colore, is_admin, active)
select
  id,
  'Admin',
  'Titolare',
  'direttore',
  '#8A6A3A',
  true,
  true
from auth.users
where email = 'SOSTITUISCI@conlatuaemail.it';
