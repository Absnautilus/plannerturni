import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Chiave (fuori da qualunque namespace Supabase) dove ricordiamo la scelta "Resta
// connesso" spuntata al login: letta da restaConnessoStorage per decidere se la
// sessione va in localStorage (sopravvive alla chiusura del browser) o in
// sessionStorage (sparisce chiudendo la scheda/il browser).
export const RESTA_CONNESSO_KEY = "ptn_resta_connesso";

// Timestamp (epoch ms) dell'ultima volta che l'app è stata effettivamente usata: con "Resta
// connesso" attivo, Supabase da solo terrebbe la sessione viva a tempo indeterminato (il
// refresh token non scade da solo). Questo timestamp è quello che permette a PlannerTurni.jsx
// di forzare il logout se sono passate più di 24 ore da un uso reale, come richiesto — "resta
// connesso" finché lo usi, non per sempre.
export const ULTIMA_ATTIVITA_KEY = "ptn_ultima_attivita";

// Adapter di storage "smart": se l'ultima preferenza salvata è "resta connesso",
// scrive in localStorage; altrimenti in sessionStorage. La lettura controlla
// entrambi, così una sessione già aperta si ritrova indipendentemente da dove è
// stata salvata.
const restaConnessoStorage = {
  getItem: (chiave) => localStorage.getItem(chiave) ?? sessionStorage.getItem(chiave),
  setItem: (chiave, valore) => {
    const resta = localStorage.getItem(RESTA_CONNESSO_KEY) !== "false";
    if (resta) {
      localStorage.setItem(chiave, valore);
      sessionStorage.removeItem(chiave);
    } else {
      sessionStorage.setItem(chiave, valore);
      localStorage.removeItem(chiave);
    }
  },
  removeItem: (chiave) => {
    localStorage.removeItem(chiave);
    sessionStorage.removeItem(chiave);
  },
};

// Finché le variabili d'ambiente non sono impostate (fase di transizione dalla demo
// solo-localStorage al backend reale) l'app deve continuare a funzionare: supabase
// resta null e chi lo usa deve prevedere il fallback.
export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { storage: restaConnessoStorage } })
  : null;
