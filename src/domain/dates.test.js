import { describe, it, expect } from "vitest";
import {
  giorniDelMese,
  giornoSettimana,
  giornoPrecedente,
  indiceMeseAssoluto,
  daIndiceMeseAssoluto,
  meseSuccessivo,
  mesePrecedente,
  formattaData,
} from "./dates.js";

describe("giorniDelMese", () => {
  it("calcola correttamente i giorni di febbraio in anno bisestile e non", () => {
    expect(giorniDelMese(2024, 1)).toBe(29); // 2024 bisestile
    expect(giorniDelMese(2025, 1)).toBe(28);
  });
});

describe("meseSuccessivo / mesePrecedente — continuità tra anni (FIX #1)", () => {
  it("da dicembre 2026 il mese successivo è gennaio 2027", () => {
    expect(meseSuccessivo(2026, 11)).toEqual({ anno: 2027, mese: 0 });
  });

  it("da gennaio 2027 il mese precedente è dicembre 2026", () => {
    expect(mesePrecedente(2027, 0)).toEqual({ anno: 2026, mese: 11 });
  });

  it("navigazione avanti e indietro è simmetrica attraverso il confine di 3 anni", () => {
    let anno = 2025, mese = 10; // novembre 2025
    for (let i = 0; i < 30; i++) {
      ({ anno, mese } = meseSuccessivo(anno, mese));
    }
    // 30 mesi dopo novembre 2025 = maggio 2028
    expect({ anno, mese }).toEqual({ anno: 2028, mese: 4 });
    for (let i = 0; i < 30; i++) {
      ({ anno, mese } = mesePrecedente(anno, mese));
    }
    expect({ anno, mese }).toEqual({ anno: 2025, mese: 10 });
  });
});

describe("indiceMeseAssoluto / daIndiceMeseAssoluto", () => {
  it("sono l'una l'inversa dell'altra su un range di anni", () => {
    for (let anno = 2024; anno <= 2030; anno++) {
      for (let mese = 0; mese < 12; mese++) {
        const idx = indiceMeseAssoluto(anno, mese);
        expect(daIndiceMeseAssoluto(idx)).toEqual({ anno, mese });
      }
    }
  });

  it("è strettamente crescente di 1 ad ogni mese, senza salti al cambio anno", () => {
    expect(indiceMeseAssoluto(2027, 0) - indiceMeseAssoluto(2026, 11)).toBe(1);
  });
});

describe("giornoPrecedente — cambio mese e anno", () => {
  it("1 gennaio -> 31 dicembre dell'anno precedente", () => {
    expect(giornoPrecedente(2027, 0, 1)).toEqual({ anno: 2026, mese: 11, giorno: 31 });
  });

  it("1 marzo -> ultimo giorno di febbraio (bisestile)", () => {
    expect(giornoPrecedente(2024, 2, 1)).toEqual({ anno: 2024, mese: 1, giorno: 29 });
  });

  it("giorno normale nello stesso mese", () => {
    expect(giornoPrecedente(2026, 5, 15)).toEqual({ anno: 2026, mese: 5, giorno: 14 });
  });
});

describe("giornoSettimana", () => {
  it("1 gennaio 2027 è un venerdì (indice 4)", () => {
    // verifica incrociata con l'oggetto Date nativo
    const d = new Date(2027, 0, 1);
    const atteso = (d.getDay() + 6) % 7;
    expect(giornoSettimana(2027, 0, 1)).toBe(atteso);
  });
});

describe("formattaData", () => {
  it("formatta GG/MM/AA con zero-padding", () => {
    expect(formattaData(5, 0, 2027)).toBe("05/01/27");
  });
});
