import { canModifyShift } from "./shiftGuards.js";

// FIX #7: la UI prometteva "soggetto a conferma del collega e, a mese Definitivo, dell'Admin",
// ma il codice applicava lo scambio subito dopo l'accettazione del collega, senza distinguere
// Bozza da Definitivo né introdurre mai uno stato admin intermedio. Macchina a stati confermata:
//
//   in_attesa_collega -> accettata_collega -> in_attesa_admin -> approvata_admin -> applicata
//                     \-> rifiutata_collega                   \-> rifiutata_admin
//
// In Bozza, "accettata_collega" porta direttamente ad "applicata" (salta i due stati admin).
export const STATI_SWAP = {
  IN_ATTESA_COLLEGA: "in_attesa_collega",
  ACCETTATA_COLLEGA: "accettata_collega",
  IN_ATTESA_ADMIN: "in_attesa_admin",
  APPROVATA_ADMIN: "approvata_admin",
  APPLICATA: "applicata",
  RIFIUTATA_COLLEGA: "rifiutata_collega",
  RIFIUTATA_ADMIN: "rifiutata_admin",
};

const STATI_TERMINALI = new Set([STATI_SWAP.APPLICATA, STATI_SWAP.RIFIUTATA_COLLEGA, STATI_SWAP.RIFIUTATA_ADMIN]);
export function eStatoTerminale(stato) {
  return STATI_TERMINALI.has(stato);
}

// Il collega destinatario accetta: in Bozza si applica subito, in Definitivo passa all'admin.
export function accettaDaCollega(statoMese) {
  return statoMese === "definitivo" ? STATI_SWAP.IN_ATTESA_ADMIN : STATI_SWAP.APPLICATA;
}

export function rifiutaDaCollega() {
  return STATI_SWAP.RIFIUTATA_COLLEGA;
}

export function approvaAdmin() {
  return STATI_SWAP.APPLICATA;
}

export function rifiutaAdmin() {
  return STATI_SWAP.RIFIUTATA_ADMIN;
}

// FIX #8: rivalidazione al momento dell'APPLICAZIONE effettiva (non solo alla richiesta):
//   1) nessuno dei due slot è nel frattempo diventato bloccato (DNM);
//   2) il codice attuale di entrambi gli slot corrisponde ancora a quanto risultava quando la
//      richiesta è stata creata (turnoDa/turnoA) — se qualcosa è cambiato nel frattempo (es. un
//      admin ha modificato uno dei due turni), lo scambio viene rifiutato invece di scambiare
//      silenziosamente dati diversi da quelli che le due persone hanno concordato.
export function applicaScambio(turni, richiesta, keyTurnoFn) {
  const kDa = keyTurnoFn(richiesta.daEmpId, richiesta.annoDa, richiesta.meseDa, richiesta.giornoDa);
  const kA = keyTurnoFn(richiesta.aEmpId, richiesta.annoA, richiesta.meseA, richiesta.giornoA);
  const attualeDa = turni[kDa];
  const attualeA = turni[kA];

  const guardDa = canModifyShift(attualeDa);
  if (!guardDa.allowed) {
    return { ok: false, errore: `Il turno di origine è bloccato: ${guardDa.reason}` };
  }
  const guardA = canModifyShift(attualeA);
  if (!guardA.allowed) {
    return { ok: false, errore: `Il turno di destinazione è bloccato: ${guardA.reason}` };
  }

  const codiceAttualeDa = attualeDa?.code ?? null;
  const codiceAttualeA = attualeA?.code ?? null;
  if (codiceAttualeDa !== richiesta.turnoDa || codiceAttualeA !== richiesta.turnoA) {
    return {
      ok: false,
      errore: "I turni coinvolti sono cambiati da quando la richiesta è stata creata: scambio annullato per sicurezza. Richiedi di nuovo lo scambio con i turni attuali.",
    };
  }

  const next = { ...turni };
  const temp = next[kDa];
  if (next[kA]) next[kDa] = next[kA]; else delete next[kDa];
  if (temp) next[kA] = temp; else delete next[kA];
  return { ok: true, turni: next };
}
