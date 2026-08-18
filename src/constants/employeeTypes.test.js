import { describe, it, expect } from "vitest";
import { turniBaseDipendente, turniExtraDipendente, turniAmmessiDipendente } from "./employeeTypes.js";

describe("FIX #9 — CE come turno extra di ruolo", () => {
  it("CE è selezionabile per un diurno tramite turniAmmessiDipendente (visibile nelle UI)", () => {
    const diurno = { tipo: "diurno" };
    expect(turniAmmessiDipendente(diurno)).toContain("CE");
  });

  it("CE è selezionabile per un turnante", () => {
    const turnante = { tipo: "turnante" };
    expect(turniAmmessiDipendente(turnante)).toContain("CE");
  });

  it("CE NON fa parte dei turni di base (resta pool di riserva per l'algoritmo)", () => {
    const diurno = { tipo: "diurno" };
    expect(turniBaseDipendente(diurno)).not.toContain("CE");
    expect(turniExtraDipendente(diurno)).toContain("CE");
  });

  it("un dipendente con turniExtra individuale (es. Raoul -> N) li mantiene insieme a CE", () => {
    const raoul = { tipo: "diurno", turniExtra: ["N"] };
    const extra = turniExtraDipendente(raoul);
    expect(extra).toContain("CE");
    expect(extra).toContain("N");
    expect(turniAmmessiDipendente(raoul)).toEqual(expect.arrayContaining(["C1", "C2", "A1", "A2", "CE", "N"]));
  });

  it("notturno/direttore/fom non hanno CE (non è un ruolo pertinente)", () => {
    expect(turniAmmessiDipendente({ tipo: "notturno" })).not.toContain("CE");
    expect(turniAmmessiDipendente({ tipo: "direttore" })).not.toContain("CE");
    expect(turniAmmessiDipendente({ tipo: "fom" })).not.toContain("CE");
  });
});

describe("FOM come riserva su A1/A2/C1/C2", () => {
  it("A1/A2/C1/C2 sono turni extra (riserva) del FOM, non di base", () => {
    const fom = { tipo: "fom" };
    expect(turniBaseDipendente(fom)).toEqual(["F1", "F2"]);
    expect(turniExtraDipendente(fom)).toEqual(expect.arrayContaining(["A1", "A2", "C1", "C2"]));
  });

  it("il FOM non è mai riserva sulla Notte", () => {
    expect(turniExtraDipendente({ tipo: "fom" })).not.toContain("N");
  });

  it("A1/A2/C1/C2 sono selezionabili per il FOM tramite turniAmmessiDipendente", () => {
    expect(turniAmmessiDipendente({ tipo: "fom" })).toEqual(expect.arrayContaining(["F1", "F2", "A1", "A2", "C1", "C2"]));
  });
});
