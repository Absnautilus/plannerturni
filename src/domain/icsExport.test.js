import { describe, it, expect } from "vitest";
import { generaICS } from "./icsExport.js";

const dipendente = { id: 3 };

describe("generaICS", () => {
  it("genera un VEVENT con orario corretto per un turno normale", () => {
    const ics = generaICS(dipendente, [{ anno: 2026, mese: 7, giorno: 3, code: "A1" }]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20260803T070000");
    expect(ics).toContain("DTEND:20260803T150000");
    expect(ics).toContain("SUMMARY:A1 — Apertura 1");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("il turno Notte attraversa la mezzanotte: DTEND è il giorno successivo", () => {
    const ics = generaICS(dipendente, [{ anno: 2026, mese: 7, giorno: 3, code: "N" }]);
    expect(ics).toContain("DTSTART:20260803T230000");
    expect(ics).toContain("DTEND:20260804T070000");
  });

  it("Ferie e Permesso diventano eventi giornata intera con DTEND al giorno dopo", () => {
    const ics = generaICS(dipendente, [{ anno: 2026, mese: 7, giorno: 3, code: "F" }]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260803");
    expect(ics).toContain("DTEND;VALUE=DATE:20260804");
    expect(ics).toContain("SUMMARY:Ferie");
  });

  it("il Riposo non genera nessun evento", () => {
    const ics = generaICS(dipendente, [{ anno: 2026, mese: 7, giorno: 3, code: "R" }]);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("un codice sconosciuto viene ignorato senza errori", () => {
    const ics = generaICS(dipendente, [{ anno: 2026, mese: 7, giorno: 3, code: "XX" }]);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("il cambio mese/anno a fine dicembre è gestito correttamente nel turno Notte", () => {
    const ics = generaICS(dipendente, [{ anno: 2026, mese: 11, giorno: 31, code: "N" }]);
    expect(ics).toContain("DTSTART:20261231T230000");
    expect(ics).toContain("DTEND:20270101T070000");
  });
});
