# Planner Turni — Reception

Conversione del prototipo (bozza React a file singolo) in un normale progetto Vite,
più stabilizzazione della logica di dominio prima dell'integrazione Supabase.

## Avvio in locale

```bash
npm install
npm run dev
```

Apri l'indirizzo mostrato in console (di norma `http://localhost:5173`).

## Test

```bash
npm test              # esegue una volta
npm run test:watch    # modalità watch
```

56 test automatici (Vitest) coprono i moduli di dominio in `src/domain/` e
`src/constants/`. Sono stati inoltre eseguiti manualmente 7 test end-to-end
sull'intera app (login, navigazione anno, blocco su Definitivo, protezione DNM,
attiva/disattiva dipendenti, CE in preferenze) — non inclusi nel repository perché
usano `react-test-renderer`, non una dipendenza del progetto.

## Build di produzione

```bash
npm run build
npm run preview
```

## Struttura

```text
src/
├── main.jsx                    entry point React
├── PlannerTurni.jsx             componente principale: stato + UI
├── domain/                      logica pura, senza dipendenze da React
│   ├── dates.js                 navigazione mese/anno, indice mese assoluto
│   ├── restRotation.js          rotazione riposi (rotationSlot stabile)
│   ├── shiftGuards.js           canModifyShift(), protezione ferie/permessi
│   ├── assignment.js            generateSchedule() — motore di assegnazione
│   ├── swapWorkflow.js          macchina a stati dei cambi turno
│   ├── employeeLifecycle.js     attiva/disattiva/elimina dipendente
│   └── *.test.js                test Vitest per ciascun modulo
└── constants/
    ├── shifts.js                TIPI_TURNO, categorie turno
    ├── employeeTypes.js         TIPI_DIPENDENTE, turni ammessi/extra
    └── employeeTypes.test.js
```

## Stato del progetto

- **Fase A** — conversione tecnica a Vite: **completata**
- **Fase A.1** — estrazione della logica di dominio: **completata**
- **Fase A.2** — correzione dei 10 bug funzionali concordati: **completata**
- **Fase A.3** — test automatici sulla logica principale: **completata** (56 test Vitest)
- Fase B: schema Supabase (senza collegarlo ancora al frontend) — da fare
- Fase C: persistenza (employees, planning_periods, shifts, richieste) — da fare
- Fase D: autenticazione Supabase (sostituzione del login a PIN) — da fare
- Fase E: gestione utenti Admin — da fare
- Fase F: notifiche push — da fare

## Correzioni applicate in Fase A.2

1. Navigazione anno nel Calendario principale (dicembre → gennaio anno successivo)
2. Rotazione riposi continua tra anni (indice mese assoluto, non solo 0-11)
3. `rotationSlot` stabile per dipendente (non più dipendente dalla posizione nell'array)
4. Ferie/permessi approvati protetti dalla rigenerazione automatica, a prescindere da DNM
5. DNM centralizzato tramite `canModifyShift()`, applicato ovunque un turno possa essere modificato
6. "Assegna automaticamente" bloccato quando il mese è Definitivo
7. Workflow dei cambi turno con macchina a stati esplicita (Bozza vs Definitivo)
8. Rivalidazione dello swap al momento dell'applicazione effettiva, non solo alla richiesta
9. CE riconosciuto come turno ammesso (extra di ruolo) per diurno/turnante
10. Eliminazione dipendente consentita solo senza turni storici; altrimenti Disattiva

Nessuna modifica a Supabase, login, o funzionalità non richieste in questa fase.

