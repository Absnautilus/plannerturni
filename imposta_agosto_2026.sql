-- Imposta i turni di Agosto 2026 esattamente come da PDF caricato
-- ("pvv_turni_reception_2026 - AGOSTO.pdf"), per i 10 dipendenti in squadra.
--
-- USO: esegui prima la STEP 1 (verifica) da sola e controlla che tutti e 10 i
-- dipendenti risultino con un profile_id valido e distinto. Solo dopo esegui
-- la STEP 2 (che cancella eventuali turni di agosto 2026 già presenti per
-- questi dipendenti e li rimpiazza con quelli del PDF).

-- ============ STEP 1: verifica corrispondenza nomi (SOLO LETTURA) ============
with mappa(chiave, cognome_like, nome_like) as (
  values
    ('VISONA DALLA POZZA MATTEO', 'vison%', 'matteo'),
    ('PUGNALIN CHIARA',           'pugnalin', 'chiara'),
    ('DE ROSSI RIMA',             '%rossi%', 'rima'),
    ('SIMONE ANA BEATRICE',       'simone', '%beatrice%'),
    ('KOVTSUNYAK ROMANA',         'kovtzunyak', 'romana'),
    ('ANOE OMAR',                 'ano%', 'omar'),
    ('BREDA FRANCESCO',           'breda', 'francesco'),
    ('CAMPINI RAOUL',             'campini', 'raoul'),
    ('CHENG KEVIN TENG',          '%cheng%', 'kevin'),
    ('DOMINGUEZ FRANCISCO JOAQUIN','domingues%', '%joaquin%')
)
select m.chiave, p.id as profile_id, p.cognome, p.nome
from mappa m
left join public.profiles p
  on lower(p.cognome) like lower(m.cognome_like)
 and lower(p.nome) like lower(m.nome_like)
order by m.chiave;

-- Controlla che: (a) ogni riga abbia un profile_id NON NULL, (b) nessun profile_id
-- si ripeta su due righe diverse. Se qualcosa non torna, FERMATI e dimmelo prima
-- di eseguire la STEP 2 qui sotto.


-- ============ STEP 2: cancella e reimposta agosto 2026 (SCRITTURA) ============
with mappa(chiave, cognome_like, nome_like) as (
  values
    ('VISONA DALLA POZZA MATTEO', 'vison%', 'matteo'),
    ('PUGNALIN CHIARA',           'pugnalin', 'chiara'),
    ('DE ROSSI RIMA',             '%rossi%', 'rima'),
    ('SIMONE ANA BEATRICE',       'simone', '%beatrice%'),
    ('KOVTSUNYAK ROMANA',         'kovtzunyak', 'romana'),
    ('ANOE OMAR',                 'ano%', 'omar'),
    ('BREDA FRANCESCO',           'breda', 'francesco'),
    ('CAMPINI RAOUL',             'campini', 'raoul'),
    ('CHENG KEVIN TENG',          '%cheng%', 'kevin'),
    ('DOMINGUEZ FRANCISCO JOAQUIN','domingues%', '%joaquin%')
),
profili_coinvolti as (
  select p.id
  from mappa m
  join public.profiles p
    on lower(p.cognome) like lower(m.cognome_like)
   and lower(p.nome) like lower(m.nome_like)
)
delete from public.turni
where anno = 2026 and mese = 7
  and profile_id in (select id from profili_coinvolti);

with mappa(chiave, cognome_like, nome_like) as (
  values
    ('VISONA DALLA POZZA MATTEO', 'vison%', 'matteo'),
    ('PUGNALIN CHIARA',           'pugnalin', 'chiara'),
    ('DE ROSSI RIMA',             '%rossi%', 'rima'),
    ('SIMONE ANA BEATRICE',       'simone', '%beatrice%'),
    ('KOVTSUNYAK ROMANA',         'kovtzunyak', 'romana'),
    ('ANOE OMAR',                 'ano%', 'omar'),
    ('BREDA FRANCESCO',           'breda', 'francesco'),
    ('CAMPINI RAOUL',             'campini', 'raoul'),
    ('CHENG KEVIN TENG',          '%cheng%', 'kevin'),
    ('DOMINGUEZ FRANCISCO JOAQUIN','domingues%', '%joaquin%')
),
turni_agosto(chiave, giorno, code, dnm) as (
  values
    -- VISONÀ DALLA POZZA MATTEO
    ('VISONA DALLA POZZA MATTEO',1,'D1',false),('VISONA DALLA POZZA MATTEO',2,'R',false),
    ('VISONA DALLA POZZA MATTEO',3,'R',false),('VISONA DALLA POZZA MATTEO',4,'F',false),
    ('VISONA DALLA POZZA MATTEO',5,'F',false),('VISONA DALLA POZZA MATTEO',6,'F',false),
    ('VISONA DALLA POZZA MATTEO',7,'F',false),('VISONA DALLA POZZA MATTEO',8,'F',false),
    ('VISONA DALLA POZZA MATTEO',9,'R',false),('VISONA DALLA POZZA MATTEO',10,'R',false),
    ('VISONA DALLA POZZA MATTEO',11,'D1',false),('VISONA DALLA POZZA MATTEO',12,'D2',false),
    ('VISONA DALLA POZZA MATTEO',13,'D2',false),('VISONA DALLA POZZA MATTEO',14,'D1',false),
    ('VISONA DALLA POZZA MATTEO',15,'FG',false),('VISONA DALLA POZZA MATTEO',16,'R',false),
    ('VISONA DALLA POZZA MATTEO',17,'R',false),('VISONA DALLA POZZA MATTEO',18,'P3',false),
    ('VISONA DALLA POZZA MATTEO',19,'D1',false),('VISONA DALLA POZZA MATTEO',20,'D1',false),
    ('VISONA DALLA POZZA MATTEO',21,'F',false),('VISONA DALLA POZZA MATTEO',22,'R',false),
    ('VISONA DALLA POZZA MATTEO',23,'R',false),('VISONA DALLA POZZA MATTEO',24,'R',false),
    ('VISONA DALLA POZZA MATTEO',25,'D1',false),('VISONA DALLA POZZA MATTEO',26,'D2',false),
    ('VISONA DALLA POZZA MATTEO',27,'D1',false),('VISONA DALLA POZZA MATTEO',28,'D1',false),
    ('VISONA DALLA POZZA MATTEO',29,'D1',false),('VISONA DALLA POZZA MATTEO',30,'R',false),
    ('VISONA DALLA POZZA MATTEO',31,'R',false),

    -- PUGNALIN CHIARA  (giorno 1: nota "DNM"; giorni 27 e 29 ricostruiti con margine di
    -- incertezza dalle celle impilate del PDF: ricontrolla questi due giorni in app)
    ('PUGNALIN CHIARA',1,'R',true),('PUGNALIN CHIARA',2,'RR',false),
    ('PUGNALIN CHIARA',3,'F2',false),('PUGNALIN CHIARA',4,'F1',false),
    ('PUGNALIN CHIARA',5,'C1',false),('PUGNALIN CHIARA',6,'A2',false),
    ('PUGNALIN CHIARA',7,'R',false),('PUGNALIN CHIARA',8,'R',false),
    ('PUGNALIN CHIARA',9,'F1',false),('PUGNALIN CHIARA',10,'F1',false),
    ('PUGNALIN CHIARA',11,'C1',false),('PUGNALIN CHIARA',12,'A2',false),
    ('PUGNALIN CHIARA',13,'A1',false),('PUGNALIN CHIARA',14,'R',false),
    ('PUGNALIN CHIARA',15,'R',false),('PUGNALIN CHIARA',16,'F1',false),
    ('PUGNALIN CHIARA',17,'P1',false),('PUGNALIN CHIARA',18,'C1',false),
    ('PUGNALIN CHIARA',19,'A1',false),('PUGNALIN CHIARA',20,'A2',false),
    ('PUGNALIN CHIARA',21,'R',false),('PUGNALIN CHIARA',22,'R',false),
    ('PUGNALIN CHIARA',23,'F1',false),('PUGNALIN CHIARA',24,'F1',false),
    ('PUGNALIN CHIARA',25,'F2',false),('PUGNALIN CHIARA',26,'A1',false),
    ('PUGNALIN CHIARA',27,'R',false),('PUGNALIN CHIARA',28,'F1',false),
    ('PUGNALIN CHIARA',29,'RS',false),('PUGNALIN CHIARA',30,'F1',false),
    ('PUGNALIN CHIARA',31,'F1',false),

    -- DE ROSSI RIMA
    ('DE ROSSI RIMA',1,'C2',false),('DE ROSSI RIMA',2,'C1',false),
    ('DE ROSSI RIMA',3,'C1',false),('DE ROSSI RIMA',4,'A1',false),
    ('DE ROSSI RIMA',5,'R',false),('DE ROSSI RIMA',6,'R',false),
    ('DE ROSSI RIMA',7,'C2',false),('DE ROSSI RIMA',8,'C2',false),
    ('DE ROSSI RIMA',9,'C2',false),('DE ROSSI RIMA',10,'C1',false),
    ('DE ROSSI RIMA',11,'A1',false),('DE ROSSI RIMA',12,'R',false),
    ('DE ROSSI RIMA',13,'R',false),('DE ROSSI RIMA',14,'F',false),
    ('DE ROSSI RIMA',15,'F',false),('DE ROSSI RIMA',16,'F',false),
    ('DE ROSSI RIMA',17,'F',false),('DE ROSSI RIMA',18,'R',false),
    ('DE ROSSI RIMA',19,'R',false),('DE ROSSI RIMA',20,'R',false),
    ('DE ROSSI RIMA',21,'C2',false),('DE ROSSI RIMA',22,'C2',false),
    ('DE ROSSI RIMA',23,'C1',false),('DE ROSSI RIMA',24,'A1',false),
    ('DE ROSSI RIMA',25,'C1',false),('DE ROSSI RIMA',26,'R',false),
    ('DE ROSSI RIMA',27,'C2',false),('DE ROSSI RIMA',28,'C2',false),
    ('DE ROSSI RIMA',29,'A2',false),('DE ROSSI RIMA',30,'C2',false),
    ('DE ROSSI RIMA',31,'A2',false),

    -- SIMONE ANA BEATRICE (giorni 1-5 e 28-31: nota "DNM" / "NIDO D'AMORE")
    ('SIMONE ANA BEATRICE',1,'A1',true),('SIMONE ANA BEATRICE',2,'F',true),
    ('SIMONE ANA BEATRICE',3,'R',true),('SIMONE ANA BEATRICE',4,'R',true),
    ('SIMONE ANA BEATRICE',5,'RR',true),('SIMONE ANA BEATRICE',6,'C1',false),
    ('SIMONE ANA BEATRICE',7,'A2',false),('SIMONE ANA BEATRICE',8,'C1',false),
    ('SIMONE ANA BEATRICE',9,'A2',false),('SIMONE ANA BEATRICE',10,'R',false),
    ('SIMONE ANA BEATRICE',11,'R',false),('SIMONE ANA BEATRICE',12,'C2',false),
    ('SIMONE ANA BEATRICE',13,'C1',false),('SIMONE ANA BEATRICE',14,'A2',false),
    ('SIMONE ANA BEATRICE',15,'C1',false),('SIMONE ANA BEATRICE',16,'C1',false),
    ('SIMONE ANA BEATRICE',17,'R',false),('SIMONE ANA BEATRICE',18,'A2',false),
    ('SIMONE ANA BEATRICE',19,'C2',false),('SIMONE ANA BEATRICE',20,'C2',false),
    ('SIMONE ANA BEATRICE',21,'A2',false),('SIMONE ANA BEATRICE',22,'A1',false),
    ('SIMONE ANA BEATRICE',23,'C2',false),('SIMONE ANA BEATRICE',24,'R',false),
    ('SIMONE ANA BEATRICE',25,'C2',false),('SIMONE ANA BEATRICE',26,'C1',false),
    ('SIMONE ANA BEATRICE',27,'A2',false),('SIMONE ANA BEATRICE',28,'A1',true),
    ('SIMONE ANA BEATRICE',29,'F',true),('SIMONE ANA BEATRICE',30,'R',true),
    ('SIMONE ANA BEATRICE',31,'R',true),

    -- KOVTSUNYAK ROMANA
    ('KOVTSUNYAK ROMANA',1,'R',false),('KOVTSUNYAK ROMANA',2,'R',false),
    ('KOVTSUNYAK ROMANA',3,'F',false),('KOVTSUNYAK ROMANA',4,'F',false),
    ('KOVTSUNYAK ROMANA',5,'F',false),('KOVTSUNYAK ROMANA',6,'F',false),
    ('KOVTSUNYAK ROMANA',7,'F',false),('KOVTSUNYAK ROMANA',8,'R',false),
    ('KOVTSUNYAK ROMANA',9,'R',false),('KOVTSUNYAK ROMANA',10,'P8',false),
    ('KOVTSUNYAK ROMANA',11,'P8',false),('KOVTSUNYAK ROMANA',12,'P8',false),
    ('KOVTSUNYAK ROMANA',13,'P8',false),('KOVTSUNYAK ROMANA',14,'P8',false),
    ('KOVTSUNYAK ROMANA',15,'R',false),('KOVTSUNYAK ROMANA',16,'R',false),
    ('KOVTSUNYAK ROMANA',17,'R8',false),('KOVTSUNYAK ROMANA',18,'R8',false),
    ('KOVTSUNYAK ROMANA',19,'R8',false),('KOVTSUNYAK ROMANA',20,'R8',false),
    ('KOVTSUNYAK ROMANA',21,'R8',false),('KOVTSUNYAK ROMANA',22,'R',false),
    ('KOVTSUNYAK ROMANA',23,'R8',false),('KOVTSUNYAK ROMANA',24,'F',false),
    ('KOVTSUNYAK ROMANA',25,'F',false),('KOVTSUNYAK ROMANA',26,'F',false),
    ('KOVTSUNYAK ROMANA',27,'F',false),('KOVTSUNYAK ROMANA',28,'R',false),
    ('KOVTSUNYAK ROMANA',29,'R',false),('KOVTSUNYAK ROMANA',30,'F',false),
    ('KOVTSUNYAK ROMANA',31,'F',false),

    -- ANOÈ OMAR
    ('ANOE OMAR',1,'C1',false),('ANOE OMAR',2,'A2',false),
    ('ANOE OMAR',3,'C2',false),('ANOE OMAR',4,'A2',false),
    ('ANOE OMAR',5,'A1',false),('ANOE OMAR',6,'R',false),
    ('ANOE OMAR',7,'R',false),('ANOE OMAR',8,'RR',false),
    ('ANOE OMAR',9,'C1',false),('ANOE OMAR',10,'A2',false),
    ('ANOE OMAR',11,'A2',false),('ANOE OMAR',12,'A1',false),
    ('ANOE OMAR',13,'R',false),('ANOE OMAR',14,'C2',false),
    ('ANOE OMAR',15,'P2',false),('ANOE OMAR',16,'A1',false),
    ('ANOE OMAR',17,'C1',false),('ANOE OMAR',18,'A1',false),
    ('ANOE OMAR',19,'R',false),('ANOE OMAR',20,'R',false),
    ('ANOE OMAR',21,'C1',false),('ANOE OMAR',22,'A2',false),
    ('ANOE OMAR',23,'A1',false),('ANOE OMAR',24,'A2',false),
    ('ANOE OMAR',25,'A1',false),('ANOE OMAR',26,'R',false),
    ('ANOE OMAR',27,'R',false),('ANOE OMAR',28,'RR',false),
    ('ANOE OMAR',29,'C2',false),('ANOE OMAR',30,'C1',false),
    ('ANOE OMAR',31,'A1',false),

    -- BREDA FRANCESCO
    ('BREDA FRANCESCO',1,'A2',false),('BREDA FRANCESCO',2,'A1',false),
    ('BREDA FRANCESCO',3,'A1',false),('BREDA FRANCESCO',4,'R',false),
    ('BREDA FRANCESCO',5,'C2',false),('BREDA FRANCESCO',6,'C2',false),
    ('BREDA FRANCESCO',7,'A1',false),('BREDA FRANCESCO',8,'A2',false),
    ('BREDA FRANCESCO',9,'A1',false),('BREDA FRANCESCO',10,'A1',false),
    ('BREDA FRANCESCO',11,'R',false),('BREDA FRANCESCO',12,'R',false),
    ('BREDA FRANCESCO',13,'C2',false),('BREDA FRANCESCO',14,'C1',false),
    ('BREDA FRANCESCO',15,'C2',false),('BREDA FRANCESCO',16,'A2',false),
    ('BREDA FRANCESCO',17,'A1',false),('BREDA FRANCESCO',18,'R',false),
    ('BREDA FRANCESCO',19,'C1',false),('BREDA FRANCESCO',20,'C1',false),
    ('BREDA FRANCESCO',21,'A1',false),('BREDA FRANCESCO',22,'C1',false),
    ('BREDA FRANCESCO',23,'A2',false),('BREDA FRANCESCO',24,'R',false),
    ('BREDA FRANCESCO',25,'R',false),('BREDA FRANCESCO',26,'C2',false),
    ('BREDA FRANCESCO',27,'C1',false),('BREDA FRANCESCO',28,'A2',false),
    ('BREDA FRANCESCO',29,'A1',false),('BREDA FRANCESCO',30,'A1',false),
    ('BREDA FRANCESCO',31,'R',false),

    -- CAMPINI RAOUL (giorni 20 e 21: nota "DNM COMPLEANNO")
    ('CAMPINI RAOUL',1,'F',false),('CAMPINI RAOUL',2,'R',false),
    ('CAMPINI RAOUL',3,'R',false),('CAMPINI RAOUL',4,'C1',false),
    ('CAMPINI RAOUL',5,'A2',false),('CAMPINI RAOUL',6,'A1',false),
    ('CAMPINI RAOUL',7,'C1',false),('CAMPINI RAOUL',8,'A1',false),
    ('CAMPINI RAOUL',9,'R',false),('CAMPINI RAOUL',10,'R',false),
    ('CAMPINI RAOUL',11,'C2',false),('CAMPINI RAOUL',12,'C1',false),
    ('CAMPINI RAOUL',13,'A2',false),('CAMPINI RAOUL',14,'A1',false),
    ('CAMPINI RAOUL',15,'A1',false),('CAMPINI RAOUL',16,'R',false),
    ('CAMPINI RAOUL',17,'C2',false),('CAMPINI RAOUL',18,'C2',false),
    ('CAMPINI RAOUL',19,'A2',false),('CAMPINI RAOUL',20,'A1',true),
    ('CAMPINI RAOUL',21,'RR',true),('CAMPINI RAOUL',22,'R',false),
    ('CAMPINI RAOUL',23,'R',false),('CAMPINI RAOUL',24,'C2',false),
    ('CAMPINI RAOUL',25,'A2',false),('CAMPINI RAOUL',26,'A2',false),
    ('CAMPINI RAOUL',27,'A1',false),('CAMPINI RAOUL',28,'C1',false),
    ('CAMPINI RAOUL',29,'R',false),('CAMPINI RAOUL',30,'R',false),
    ('CAMPINI RAOUL',31,'C2',false),

    -- CHENG KEVIN TENG (giorni 22 e 23: nota "DNM")
    ('CHENG KEVIN TENG',1,'R',false),('CHENG KEVIN TENG',2,'C2',false),
    ('CHENG KEVIN TENG',3,'A2',false),('CHENG KEVIN TENG',4,'C2',false),
    ('CHENG KEVIN TENG',5,'N',false),('CHENG KEVIN TENG',6,'N',false),
    ('CHENG KEVIN TENG',7,'R',false),('CHENG KEVIN TENG',8,'R',false),
    ('CHENG KEVIN TENG',9,'F',false),('CHENG KEVIN TENG',10,'C2',false),
    ('CHENG KEVIN TENG',11,'N',false),('CHENG KEVIN TENG',12,'N',false),
    ('CHENG KEVIN TENG',13,'N',false),('CHENG KEVIN TENG',14,'R',false),
    ('CHENG KEVIN TENG',15,'R',false),('CHENG KEVIN TENG',16,'C2',false),
    ('CHENG KEVIN TENG',17,'A2',false),('CHENG KEVIN TENG',18,'N',false),
    ('CHENG KEVIN TENG',19,'N',false),('CHENG KEVIN TENG',20,'R',false),
    ('CHENG KEVIN TENG',21,'R',false),('CHENG KEVIN TENG',22,'F',true),
    ('CHENG KEVIN TENG',23,'F',true),('CHENG KEVIN TENG',24,'C1',false),
    ('CHENG KEVIN TENG',25,'N',false),('CHENG KEVIN TENG',26,'N',false),
    ('CHENG KEVIN TENG',27,'R',false),('CHENG KEVIN TENG',28,'R',false),
    ('CHENG KEVIN TENG',29,'C1',false),('CHENG KEVIN TENG',30,'A2',false),
    ('CHENG KEVIN TENG',31,'C1',false),

    -- DOMINGUEZ FRANCISCO JOAQUIN
    ('DOMINGUEZ FRANCISCO JOAQUIN',1,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',2,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',3,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',4,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',5,'R',false),('DOMINGUEZ FRANCISCO JOAQUIN',6,'R',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',7,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',8,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',9,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',10,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',11,'F',false),('DOMINGUEZ FRANCISCO JOAQUIN',12,'R',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',13,'R',false),('DOMINGUEZ FRANCISCO JOAQUIN',14,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',15,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',16,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',17,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',18,'R',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',19,'R',false),('DOMINGUEZ FRANCISCO JOAQUIN',20,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',21,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',22,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',23,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',24,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',25,'R',false),('DOMINGUEZ FRANCISCO JOAQUIN',26,'R',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',27,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',28,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',29,'N',false),('DOMINGUEZ FRANCISCO JOAQUIN',30,'N',false),
    ('DOMINGUEZ FRANCISCO JOAQUIN',31,'N',false)
)
insert into public.turni (profile_id, anno, mese, giorno, code, dnm)
select p.id, 2026, 7, t.giorno, t.code, t.dnm
from turni_agosto t
join mappa m on m.chiave = t.chiave
join public.profiles p
  on lower(p.cognome) like lower(m.cognome_like)
 and lower(p.nome) like lower(m.nome_like);

-- Se vuoi anche marcare agosto 2026 come "definitivo" invece di "bozza":
-- insert into public.stato_mese (anno, mese, stato) values (2026, 7, 'definitivo')
-- on conflict (anno, mese) do update set stato = excluded.stato;
