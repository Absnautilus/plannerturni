import { describe, it, expect } from "vitest";
import { STATI_SWAP, accettaDaCollega, rifiutaDaCollega, approvaAdmin, rifiutaAdmin, applicaScambio, eStatoTerminale } from "./swapWorkflow.js";

function kt(empId, anno, mese, giorno) {
  return `${empId}_${anno}_${mese}_${giorno}`;
}

describe("FIX #7 — macchina a stati coerente con mese Bozza/Definitivo", () => {
  it("in Bozza, l'accettazione del collega applica subito lo scambio", () => {
    expect(accettaDaCollega("bozza")).toBe(STATI_SWAP.APPLICATA);
  });

  it("in Definitivo, l'accettazione del collega passa all'approvazione admin, non applica subito", () => {
    expect(accettaDaCollega("definitivo")).toBe(STATI_SWAP.IN_ATTESA_ADMIN);
  });

  it("il rifiuto del collega è uno stato terminale", () => {
    const stato = rifiutaDaCollega();
    expect(stato).toBe(STATI_SWAP.RIFIUTATA_COLLEGA);
    expect(eStatoTerminale(stato)).toBe(true);
  });

  it("l'approvazione admin porta ad applicata; il rifiuto admin è terminale", () => {
    expect(approvaAdmin()).toBe(STATI_SWAP.APPLICATA);
    expect(eStatoTerminale(rifiutaAdmin())).toBe(true);
  });
});

describe("FIX #8 — rivalidazione al momento dell'applicazione effettiva", () => {
  const richiestaBase = {
    daEmpId: 3, aEmpId: 4,
    annoDa: 2026, meseDa: 6, giornoDa: 10,
    annoA: 2026, meseA: 6, giornoA: 12,
    turnoDa: "A1", turnoA: "C1",
  };

  it("applica correttamente lo scambio quando tutto corrisponde ancora", () => {
    const turni = {
      [kt(3, 2026, 6, 10)]: { code: "A1", dnm: false },
      [kt(4, 2026, 6, 12)]: { code: "C1", dnm: false },
    };
    const esito = applicaScambio(turni, richiestaBase, kt);
    expect(esito.ok).toBe(true);
    expect(esito.turni[kt(3, 2026, 6, 10)].code).toBe("C1");
    expect(esito.turni[kt(4, 2026, 6, 12)].code).toBe("A1");
  });

  it("rifiuta lo scambio se uno dei due turni è nel frattempo cambiato (scenario del report)", () => {
    // scenario segnalato: richiesto A1<->C1, ma nel frattempo il turno di destinazione
    // è stato cambiato in C2 (non più C1) prima che lo scambio venisse applicato
    const turni = {
      [kt(3, 2026, 6, 10)]: { code: "A1", dnm: false },
      [kt(4, 2026, 6, 12)]: { code: "C2", dnm: false }, // cambiato da C1 a C2 nel frattempo
    };
    const esito = applicaScambio(turni, richiestaBase, kt);
    expect(esito.ok).toBe(false);
    expect(esito.errore).toMatch(/cambiati/i);
    // il turno NON deve essere stato toccato
    expect(turni[kt(4, 2026, 6, 12)].code).toBe("C2");
  });

  it("rifiuta lo scambio se uno dei due turni è diventato DNM nel frattempo", () => {
    const turni = {
      [kt(3, 2026, 6, 10)]: { code: "A1", dnm: true }, // bloccato dopo la richiesta
      [kt(4, 2026, 6, 12)]: { code: "C1", dnm: false },
    };
    const esito = applicaScambio(turni, richiestaBase, kt);
    expect(esito.ok).toBe(false);
    expect(esito.errore).toMatch(/bloccato/i);
  });

  it("rifiuta lo scambio se uno slot è stato svuotato nel frattempo", () => {
    const turni = {
      [kt(4, 2026, 6, 12)]: { code: "C1", dnm: false },
      // kt(3,...) assente: era stato svuotato dopo la richiesta
    };
    const esito = applicaScambio(turni, richiestaBase, kt);
    expect(esito.ok).toBe(false);
  });
});
