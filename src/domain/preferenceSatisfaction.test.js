import { describe, it, expect } from "vitest";
import { percentualeSoddisfazionePreferenze } from "./preferenceSatisfaction.js";

// Agosto 2026: 1 ago = sabato (indice 5), quindi 3/4/5 ago = lun/mar/mer (indici 0/1/2).
describe("percentualeSoddisfazionePreferenze", () => {
  it("null se nessun turno di copertura nel mese", () => {
    const risultato = percentualeSoddisfazionePreferenze({
      turni: {},
      preferenzeEmp: { ordinePreferenza: ["A1", "C1"] },
      empId: "e1",
      anno: 2026,
      mese: 7,
      numGiorni: 31,
    });
    expect(risultato).toBeNull();
  });

  it("riposo/ferie/permesso non contano nel denominatore", () => {
    const turni = {
      "e1_2026_7_3": { code: "R" },
      "e1_2026_7_4": { code: "F" },
    };
    const risultato = percentualeSoddisfazionePreferenze({
      turni,
      preferenzeEmp: { ordinePreferenza: ["A1"] },
      empId: "e1",
      anno: 2026,
      mese: 7,
      numGiorni: 31,
    });
    expect(risultato).toBeNull();
  });

  it("100% quando ogni turno di copertura coincide con la preferenza generale", () => {
    const turni = {
      "e1_2026_7_3": { code: "A1" },
      "e1_2026_7_4": { code: "A1" },
    };
    const risultato = percentualeSoddisfazionePreferenze({
      turni,
      preferenzeEmp: { ordinePreferenza: ["A1", "C1"] },
      empId: "e1",
      anno: 2026,
      mese: 7,
      numGiorni: 31,
    });
    expect(risultato).toBe(100);
  });

  it("calcola correttamente una percentuale parziale", () => {
    const turni = {
      "e1_2026_7_3": { code: "A1" }, // preferenza rispettata
      "e1_2026_7_4": { code: "C1" }, // NON è la preferenza principale (A1 lo è)
    };
    const risultato = percentualeSoddisfazionePreferenze({
      turni,
      preferenzeEmp: { ordinePreferenza: ["A1", "C1"] },
      empId: "e1",
      anno: 2026,
      mese: 7,
      numGiorni: 31,
    });
    expect(risultato).toBe(50);
  });

  it("la preferenza specifica del giorno della settimana ha precedenza su quella generale", () => {
    // 3 agosto 2026 è lunedì (indice giorno settimana 0)
    const turni = { "e1_2026_7_3": { code: "C1" } };
    const risultato = percentualeSoddisfazionePreferenze({
      turni,
      preferenzeEmp: {
        ordinePreferenza: ["A1"],
        preferenzeGiorno: { 0: ["C1", "A1"] },
      },
      empId: "e1",
      anno: 2026,
      mese: 7,
      numGiorni: 31,
    });
    expect(risultato).toBe(100);
  });

  it("nessuna preferenza impostata: i turni di copertura contano nel denominatore ma mai come soddisfatti", () => {
    const turni = { "e1_2026_7_3": { code: "A1" } };
    const risultato = percentualeSoddisfazionePreferenze({
      turni,
      preferenzeEmp: {},
      empId: "e1",
      anno: 2026,
      mese: 7,
      numGiorni: 31,
    });
    expect(risultato).toBe(0);
  });

  it("ignora i turni di altri dipendenti o di altri mesi", () => {
    const turni = {
      "e1_2026_7_3": { code: "A1" },
      "e2_2026_7_3": { code: "C1" },
      "e1_2026_6_3": { code: "C1" },
    };
    const risultato = percentualeSoddisfazionePreferenze({
      turni,
      preferenzeEmp: { ordinePreferenza: ["A1"] },
      empId: "e1",
      anno: 2026,
      mese: 7,
      numGiorni: 31,
    });
    expect(risultato).toBe(100);
  });
});
