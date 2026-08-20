-- Ricalibra rotation_slot per allineare l'algoritmo di rotazione riposi al
-- pattern reale osservato ad agosto 2026 (vedi imposta_agosto_2026.sql).
--
-- NOTA: Breda e Simone risultano entrambi sul weekday 5 (stesso rotation_slot,
-- 6), e De Rossi/Domingues entrambi sul weekday 0 (stesso rotation_slot, 0) —
-- il fit su un solo mese non basta a escludere che riposino davvero negli
-- stessi giorni. Teng Cheng (turnante) non viene toccato: il suo weekday è
-- sempre derivato automaticamente da quello di Domingues (notturno) + 2,
-- indipendentemente dal suo rotation_slot salvato.
--
-- Esegui prima la SELECT di verifica, poi l'UPDATE.

-- ============ verifica (SOLO LETTURA) ============
select cognome, nome, rotation_slot as slot_attuale,
  case
    when lower(cognome) like lower('%rossi%') then 0
    when lower(cognome) like lower('kovtzunyak') then 5
    when lower(cognome) = lower('simone') then 6
    when lower(cognome) = lower('breda') then 6
    when lower(cognome) like lower('domingues%') then 0
    when lower(cognome) = lower('campini') then 2
    when lower(cognome) like lower('ano%') then 4
  end as slot_nuovo
from public.profiles
where lower(cognome) like lower('%rossi%')
   or lower(cognome) = lower('kovtzunyak')
   or lower(cognome) = lower('simone')
   or lower(cognome) = lower('breda')
   or lower(cognome) like lower('domingues%')
   or lower(cognome) = lower('campini')
   or lower(cognome) like lower('ano%')
order by cognome;

-- ============ update (SCRITTURA) ============
update public.profiles set rotation_slot = 0 where lower(cognome) like lower('%rossi%');
update public.profiles set rotation_slot = 5 where lower(cognome) = lower('kovtzunyak');
update public.profiles set rotation_slot = 6 where lower(cognome) = lower('simone');
update public.profiles set rotation_slot = 6 where lower(cognome) = lower('breda');
update public.profiles set rotation_slot = 0 where lower(cognome) like lower('domingues%');
update public.profiles set rotation_slot = 2 where lower(cognome) = lower('campini');
update public.profiles set rotation_slot = 4 where lower(cognome) like lower('ano%');
