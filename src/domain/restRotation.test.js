import { describe, it, expect } from "vitest";
import { calcolaOffsetRiposo, calcolaOffsetRiposoPerMese, prossimoRotationSlotLibero } from "./restRotation.js";

describe("calcolaOffsetRiposo — continuità dicembre -> gennaio (FIX #2)", () => {
  it("l'offset di dicembre e quello di gennaio successivo differiscono esattamente di 1 (mod 7)", () => {
    const slot = 3;
    const offsetDic = calcolaOffsetRiposo(slot, 2026, 11);
    const offsetGen = calcolaOffsetRiposo(slot, 2027, 0);
    // la rotazione scala indietro di 1 ogni mese: la differenza deve essere esattamente 1 (mod 7)
    expect(((offsetDic - offsetGen) % 7 + 7) % 7).toBe(1);
  });

  it("la sequenza di offset è continua su 36 mesi consecutivi, qualunque anno", () => {
    const slot = 5;
    let anno = 2025, mese = 0;
    let precedente = calcolaOffsetRiposo(slot, anno, mese);
    for (let i = 1; i < 36; i++) {
      mese++;
      if (mese > 11) { mese = 0; anno++; }
      const attuale = calcolaOffsetRiposo(slot, anno, mese);
      expect(((precedente - attuale) % 7 + 7) % 7).toBe(1);
      precedente = attuale;
    }
  });
});

describe("prossimoRotationSlotLibero (FIX #3)", () => {
  it("assegna 0 se nessuno ha ancora uno slot", () => {
    expect(prossimoRotationSlotLibero([])).toBe(0);
  });

  it("assegna il primo intero libero, non semplicemente max+1", () => {
    const dipendenti = [
      { id: 1, rotationSlot: 0 },
      { id: 2, rotationSlot: 2 },
      { id: 3, rotationSlot: 3 },
    ];
    expect(prossimoRotationSlotLibero(dipendenti)).toBe(1);
  });

  it("il rotationSlot esistente NON cambia se un altro dipendente viene rimosso o riordinato", () => {
    const dipendenti = [
      { id: 1, rotationSlot: 0 },
      { id: 2, rotationSlot: 1 },
      { id: 3, rotationSlot: 2 },
    ];
    const offsetPrimaMese = calcolaOffsetRiposoPerMese(
      dipendenti.map((d) => ({ ...d, tipo: "diurno", riposoTipo: "rotante" })),
      2026, 5
    );
    // rimuovo il dipendente 2 e riordino l'array (simula eliminazione + refresh lista)
    const dipendentiDopo = [
      { id: 3, rotationSlot: 2, tipo: "diurno", riposoTipo: "rotante" },
      { id: 1, rotationSlot: 0, tipo: "diurno", riposoTipo: "rotante" },
    ];
    const offsetDopoMese = calcolaOffsetRiposoPerMese(dipendentiDopo, 2026, 5);
    // il dipendente 1 e il dipendente 3 devono avere lo STESSO offset di riposo di prima:
    // la loro rotazione non deve essere stata alterata dalla rimozione/riordino altrui
    expect(offsetDopoMese[1]).toBe(offsetPrimaMese[1]);
    expect(offsetDopoMese[3]).toBe(offsetPrimaMese[3]);
  });
});

describe("calcolaOffsetRiposoPerMese — riposo fisso non ruota mai", () => {
  it("un dipendente 'fisso' ha sempre lo stesso offset, indipendentemente dal mese", () => {
    const dipendenti = [{ id: 1, tipo: "diurno", riposoTipo: "fisso", riposoFissoGiorno: 5 }];
    const a = calcolaOffsetRiposoPerMese(dipendenti, 2026, 3);
    const b = calcolaOffsetRiposoPerMese(dipendenti, 2027, 8);
    expect(a[1]).toBe(5);
    expect(b[1]).toBe(5);
  });
});

describe("calcolaOffsetRiposoPerMese — turnante agganciato al notturno", () => {
  it("il turnante rotante riposa 2 giorni dopo il notturno rotante", () => {
    const dipendenti = [
      { id: 1, tipo: "notturno", riposoTipo: "rotante", rotationSlot: 0 },
      { id: 2, tipo: "turnante", riposoTipo: "rotante", rotationSlot: 1 },
    ];
    const offset = calcolaOffsetRiposoPerMese(dipendenti, 2026, 6);
    expect(offset[2]).toBe((offset[1] + 2) % 7);
  });

  it("l'aggancio NON si applica se uno dei due è fisso", () => {
    const dipendenti = [
      { id: 1, tipo: "notturno", riposoTipo: "fisso", riposoFissoGiorno: 2 },
      { id: 2, tipo: "turnante", riposoTipo: "rotante", rotationSlot: 1 },
    ];
    const offset = calcolaOffsetRiposoPerMese(dipendenti, 2026, 6);
    expect(offset[2]).not.toBe((offset[1] + 2) % 7);
  });
});
