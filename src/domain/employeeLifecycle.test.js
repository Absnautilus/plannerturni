import { describe, it, expect } from "vitest";
import {
  haStoricoTurni,
  puoEliminareDefinitivamente,
  disattivaDipendente,
  attivaDipendente,
  eliminaDipendente,
} from "./employeeLifecycle.js";

describe("FIX #10 — eliminazione consentita solo senza storico", () => {
  it("un dipendente senza alcun turno può essere eliminato", () => {
    const dipendenti = [{ id: 11, cognome: "Nuovo" }];
    const turni = {};
    const esito = eliminaDipendente(dipendenti, turni, 11);
    expect(esito.ok).toBe(true);
    expect(esito.dipendenti.find((d) => d.id === 11)).toBeUndefined();
  });

  it("un dipendente con almeno un turno storico NON può essere eliminato", () => {
    const dipendenti = [{ id: 3, cognome: "Simone" }];
    const turni = { "3_2026_5_10": { code: "C1", dnm: false } };
    const esito = eliminaDipendente(dipendenti, turni, 3);
    expect(esito.ok).toBe(false);
    expect(esito.errore).toMatch(/disattiva/i);
    // il dipendente deve restare nell'array, invariato
  });

  it("haStoricoTurni non ha falsi positivi tra id che si somigliano (1 vs 10)", () => {
    const turni = { "10_2026_5_1": { code: "C1" } };
    expect(haStoricoTurni(turni, 1)).toBe(false);
    expect(haStoricoTurni(turni, 10)).toBe(true);
  });

  it("puoEliminareDefinitivamente riflette haStoricoTurni", () => {
    const turni = { "5_2026_5_1": { code: "R" } };
    expect(puoEliminareDefinitivamente(turni, 5)).toBe(false);
    expect(puoEliminareDefinitivamente(turni, 6)).toBe(true);
  });
});

describe("disattiva/attiva dipendente", () => {
  it("disattivaDipendente imposta active:false solo sul dipendente indicato", () => {
    const dipendenti = [{ id: 1, active: true }, { id: 2, active: true }];
    const risultato = disattivaDipendente(dipendenti, 1);
    expect(risultato.find((d) => d.id === 1).active).toBe(false);
    expect(risultato.find((d) => d.id === 2).active).toBe(true);
  });

  it("attivaDipendente riporta active:true", () => {
    const dipendenti = [{ id: 1, active: false }];
    const risultato = attivaDipendente(dipendenti, 1);
    expect(risultato.find((d) => d.id === 1).active).toBe(true);
  });
});
