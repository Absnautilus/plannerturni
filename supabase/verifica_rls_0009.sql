-- Script di verifica per 0009_rafforza_rls_scritture.sql — NON è una migrazione e non
-- cambia lo schema: impersona a turno alcuni dipendenti reali già esistenti (scelti in
-- automatico, non serve indicarli a mano) per controllare che le nuove policy blocchino
-- ciò che devono bloccare e lascino passare ciò che deve continuare a funzionare.
--
-- Sicuro da eseguire su un progetto con dati reali: tutte le righe create dal test usano
-- anno=2099 come marcatore e vengono cancellate alla fine (anche se qualche controllo
-- fallisce a metà). Non tocca turni, richieste o profili esistenti.
--
-- Come si usa: Supabase Dashboard → SQL Editor → incolla tutto → Run, poi guarda i
-- messaggi NOTICE (pannello "Logs"/messaggi sotto il risultato, non la tabella).
-- Richiede almeno 2 dipendenti non-admin e 1 admin già presenti nel database; se
-- mancano lo script lo segnala e si ferma senza toccare nulla.

do $$
declare
  emp_a uuid;
  emp_b uuid;
  emp_c uuid;
  admin_id uuid;
  v_rows int;
  v_exploded boolean;
  v_ok boolean;
  v_falliti int := 0;
  v_totali int := 0;
  swap1 bigint;
  swap2 bigint;
  assenza1 bigint;
begin
  select id into emp_a from public.profiles where is_admin = false order by created_at limit 1;
  select id into emp_b from public.profiles where is_admin = false and id <> emp_a order by created_at limit 1;
  select id into emp_c from public.profiles where is_admin = false and id not in (emp_a, emp_b) order by created_at limit 1;
  select id into admin_id from public.profiles where is_admin = true order by created_at limit 1;

  if emp_a is null or emp_b is null then
    raise notice 'SKIP — servono almeno 2 dipendenti non-admin nel database per eseguire il test.';
    return;
  end if;
  if admin_id is null then
    raise notice 'SKIP — nessun account admin trovato, non posso testare i percorsi admin.';
    return;
  end if;

  -- pulizia di eventuali residui di un run precedente interrotto
  delete from public.turni where anno = 2099;
  delete from public.richieste_swap where anno_da = 2099;
  delete from public.richieste_assenza where anno = 2099;

  -- dati di partenza (scritti come utente privilegiato della SQL Editor, che bypassa RLS)
  insert into public.turni (profile_id, anno, mese, giorno, code, dnm) values (emp_a, 2099, 0, 1, 'M', false);
  insert into public.turni (profile_id, anno, mese, giorno, code, dnm) values (emp_b, 2099, 0, 2, 'P', false);
  insert into public.richieste_swap (da_profile_id, a_profile_id, anno_da, mese_da, giorno_da, anno_a, mese_a, giorno_a, turno_da, turno_a, stato)
    values (emp_a, emp_b, 2099, 0, 1, 2099, 0, 2, 'M', 'P', 'in_attesa_collega')
    returning id into swap1;

  begin
    -- ---------- CHECK 1: un dipendente estraneo non può toccare il turno di un altro ----------
    if emp_c is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', emp_c, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        update public.turni set code = 'X' where profile_id = emp_a and anno = 2099 and mese = 0 and giorno = 1;
        get diagnostics v_rows = row_count;
        v_exploded := false;
      exception when others then
        v_rows := 0; v_exploded := true;
      end;
      execute 'reset role';
      v_totali := v_totali + 1;
      v_ok := (v_rows = 0 or v_exploded);
      if not v_ok then v_falliti := v_falliti + 1; end if;
      raise notice '% — un dipendente estraneo NON deve poter scrivere il turno di un altro (ottenuto: %)',
        case when v_ok then 'OK  ' else 'FAIL' end,
        case when v_exploded then 'bloccato' when v_rows > 0 then 'CONSENTITO (errore!)' else 'bloccato' end;
    else
      raise notice 'SKIP — check 1: serve un terzo dipendente non-admin per testare l''utente estraneo.';
    end if;

    -- ---------- CHECK 2: il collega coinvolto non può ancora scrivere PRIMA di accettare ----------
    perform set_config('request.jwt.claims', json_build_object('sub', emp_b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.turni set code = 'X' where profile_id = emp_a and anno = 2099 and mese = 0 and giorno = 1;
      get diagnostics v_rows = row_count;
      v_exploded := false;
    exception when others then
      v_rows := 0; v_exploded := true;
    end;
    v_totali := v_totali + 1;
    v_ok := (v_rows = 0 or v_exploded);
    if not v_ok then v_falliti := v_falliti + 1; end if;
    raise notice '% — il collega NON deve poter scrivere il turno prima di accettare lo swap (ottenuto: %)',
      case when v_ok then 'OK  ' else 'FAIL' end,
      case when v_exploded then 'bloccato' when v_rows > 0 then 'CONSENTITO (errore!)' else 'bloccato' end;

    -- ---------- CHECK 3: il collega ACCETTA lo swap (deve riuscire) ----------
    begin
      update public.richieste_swap set stato = 'applicata' where id = swap1;
      get diagnostics v_rows = row_count;
      v_exploded := false;
    exception when others then
      v_rows := 0; v_exploded := true;
    end;
    v_totali := v_totali + 1;
    v_ok := (v_rows > 0 and not v_exploded);
    if not v_ok then v_falliti := v_falliti + 1; end if;
    raise notice '% — il collega DEVE poter accettare lo swap a lui indirizzato (ottenuto: %)',
      case when v_ok then 'OK  ' else 'FAIL' end,
      case when v_exploded then 'bloccato (errore!)' when v_rows > 0 then 'consentito' else 'bloccato (errore!)' end;

    -- ---------- CHECK 4: dopo l'accettazione, il collega può applicare lo scambio su ENTRAMBE le celle ----------
    begin
      update public.turni set code = 'P' where profile_id = emp_a and anno = 2099 and mese = 0 and giorno = 1;
      get diagnostics v_rows = row_count;
      v_exploded := false;
    exception when others then
      v_rows := 0; v_exploded := true;
    end;
    v_totali := v_totali + 1;
    v_ok := (v_rows > 0 and not v_exploded);
    if not v_ok then v_falliti := v_falliti + 1; end if;
    raise notice '% — dopo l''accettazione, il collega DEVE poter scrivere la cella dell''altra parte (ottenuto: %)',
      case when v_ok then 'OK  ' else 'FAIL' end,
      case when v_exploded then 'bloccato (errore!)' when v_rows > 0 then 'consentito' else 'bloccato (errore!)' end;

    begin
      update public.turni set code = 'M' where profile_id = emp_b and anno = 2099 and mese = 0 and giorno = 2;
      get diagnostics v_rows = row_count;
      v_exploded := false;
    exception when others then
      v_rows := 0; v_exploded := true;
    end;
    v_totali := v_totali + 1;
    v_ok := (v_rows > 0 and not v_exploded);
    if not v_ok then v_falliti := v_falliti + 1; end if;
    raise notice '% — dopo l''accettazione, il collega DEVE poter scrivere anche la propria cella (ottenuto: %)',
      case when v_ok then 'OK  ' else 'FAIL' end,
      case when v_exploded then 'bloccato (errore!)' when v_rows > 0 then 'consentito' else 'bloccato (errore!)' end;

    execute 'reset role';

    -- ---------- CHECK 5: un dipendente estraneo non può rispondere a uno swap altrui ----------
    if emp_c is not null then
      insert into public.richieste_swap (da_profile_id, a_profile_id, anno_da, mese_da, giorno_da, anno_a, mese_a, giorno_a, turno_da, turno_a, stato)
        values (emp_a, emp_b, 2099, 0, 3, 2099, 0, 4, 'M', 'P', 'in_attesa_collega')
        returning id into swap2;

      perform set_config('request.jwt.claims', json_build_object('sub', emp_c, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        update public.richieste_swap set stato = 'applicata' where id = swap2;
        get diagnostics v_rows = row_count;
        v_exploded := false;
      exception when others then
        v_rows := 0; v_exploded := true;
      end;
      execute 'reset role';
      v_totali := v_totali + 1;
      v_ok := (v_rows = 0 or v_exploded);
      if not v_ok then v_falliti := v_falliti + 1; end if;
      raise notice '% — un dipendente estraneo NON deve poter rispondere a uno swap altrui (ottenuto: %)',
        case when v_ok then 'OK  ' else 'FAIL' end,
        case when v_exploded then 'bloccato' when v_rows > 0 then 'CONSENTITO (errore!)' else 'bloccato' end;
    else
      raise notice 'SKIP — check 5: serve un terzo dipendente non-admin.';
    end if;

    -- ---------- CHECK 6: non si può creare una richiesta di swap "come se fosse" un altro ----------
    perform set_config('request.jwt.claims', json_build_object('sub', emp_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.richieste_swap (da_profile_id, a_profile_id, anno_da, mese_da, giorno_da, anno_a, mese_a, giorno_a, turno_da, turno_a, stato)
        values (emp_b, emp_a, 2099, 0, 5, 2099, 0, 6, 'M', 'P', 'in_attesa_collega');
      get diagnostics v_rows = row_count;
      v_exploded := false;
    exception when others then
      v_rows := 0; v_exploded := true;
    end;
    v_totali := v_totali + 1;
    v_ok := (v_rows = 0 or v_exploded);
    if not v_ok then v_falliti := v_falliti + 1; end if;
    raise notice '% — non si deve poter creare una richiesta di swap a nome di un altro (ottenuto: %)',
      case when v_ok then 'OK  ' else 'FAIL' end,
      case when v_exploded then 'bloccato' when v_rows > 0 then 'CONSENTITO (errore!)' else 'bloccato' end;
    execute 'reset role';

    -- ---------- CHECK 7: un dipendente non può auto-approvare una propria richiesta di assenza ----------
    insert into public.richieste_assenza (profile_id, anno, mese, giorno, tipo, stato)
      values (emp_a, 2099, 0, 10, 'F', 'in sospeso')
      returning id into assenza1;

    perform set_config('request.jwt.claims', json_build_object('sub', emp_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.richieste_assenza set stato = 'approvata' where id = assenza1;
      get diagnostics v_rows = row_count;
      v_exploded := false;
    exception when others then
      v_rows := 0; v_exploded := true;
    end;
    execute 'reset role';
    v_totali := v_totali + 1;
    v_ok := (v_rows = 0 or v_exploded);
    if not v_ok then v_falliti := v_falliti + 1; end if;
    raise notice '% — un dipendente NON deve poter approvare da solo la propria assenza (ottenuto: %)',
      case when v_ok then 'OK  ' else 'FAIL' end,
      case when v_exploded then 'bloccato' when v_rows > 0 then 'CONSENTITO (errore!)' else 'bloccato' end;

    -- ---------- CHECK 8: l'admin PUO' approvare la richiesta di assenza ----------
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.richieste_assenza set stato = 'approvata' where id = assenza1;
      get diagnostics v_rows = row_count;
      v_exploded := false;
    exception when others then
      v_rows := 0; v_exploded := true;
    end;
    execute 'reset role';
    v_totali := v_totali + 1;
    v_ok := (v_rows > 0 and not v_exploded);
    if not v_ok then v_falliti := v_falliti + 1; end if;
    raise notice '% — l''admin DEVE poter approvare la richiesta di assenza (ottenuto: %)',
      case when v_ok then 'OK  ' else 'FAIL' end,
      case when v_exploded then 'bloccato (errore!)' when v_rows > 0 then 'consentito' else 'bloccato (errore!)' end;

    -- ---------- CHECK 9: l'admin PUO' scrivere qualsiasi turno direttamente ----------
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.turni set code = 'R' where profile_id = emp_a and anno = 2099 and mese = 0 and giorno = 1;
      get diagnostics v_rows = row_count;
      v_exploded := false;
    exception when others then
      v_rows := 0; v_exploded := true;
    end;
    execute 'reset role';
    v_totali := v_totali + 1;
    v_ok := (v_rows > 0 and not v_exploded);
    if not v_ok then v_falliti := v_falliti + 1; end if;
    raise notice '% — l''admin DEVE poter scrivere qualsiasi turno direttamente (ottenuto: %)',
      case when v_ok then 'OK  ' else 'FAIL' end,
      case when v_exploded then 'bloccato (errore!)' when v_rows > 0 then 'consentito' else 'bloccato (errore!)' end;

  exception when others then
    execute 'reset role';
    raise notice 'Errore inatteso durante i controlli, interrotto: %', sqlerrm;
  end;

  -- pulizia finale (come utente privilegiato: bypassa RLS, riesce sempre)
  delete from public.turni where anno = 2099;
  delete from public.richieste_swap where anno_da = 2099;
  delete from public.richieste_assenza where anno = 2099;

  raise notice '=== RISULTATO: % / % controlli superati ===', (v_totali - v_falliti), v_totali;
end $$;
