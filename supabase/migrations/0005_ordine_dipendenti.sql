-- Ordine di visualizzazione scelto dall'admin (calendario, elenco dipendenti, liste
-- colleghi) invece del solo ordine di creazione. Null = non ancora riordinato
-- manualmente: in quel caso si torna all'ordine di creazione (vedi query nell'app).

alter table public.profiles
  add column if not exists ordine integer;

update public.profiles set ordine = sub.rn
from (select id, row_number() over (order by created_at) as rn from public.profiles) sub
where public.profiles.id = sub.id and public.profiles.ordine is null;

NOTIFY pgrst, 'reload schema';
