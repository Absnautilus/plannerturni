import { describe, it, expect } from "vitest";
import { generateSchedule } from "./assignment.js";

const COPERTURA = { C1: 1, C2: 1, A1: 1, A2: 1, N: 1 };
const REGOLE_ATTIVE = {
  sequenzaC2A1Vietata: true,
  prioritaNotturno: true,
  riposoTurnanteDopoNotturno: true,
  direttoreD1D2Auto: true,
  fomF1F2Auto: true,
  ceAutomatico: true,
  sequenzaPreferibileEvitata: true,
  equitaSequenzeScomode: true,
  equilibrioMattinaPomeriggio: true,
  variazioneSettimanale: true,
  preferenzePersonali: true,
};
const ORDINE_REGOLE_PREFERENZA = [
  "equilibrioMattinaPomeriggio",
  "sequenzaPreferibileEvitata",
  "equitaSequenzeScomode",
  "variazioneSettimanale",
  "preferenzePersonali",
];

function dipendentiBase() {
  return [
    { id: 1, tipo: "direttore", riposoTipo: "fisso", riposoFissoGiorno: 5, active: true },
    { id: 2, tipo: "fom", turniExtra: ["C1", "C2", "A1", "A2"], riposoTipo: "fisso", riposoFissoGiorno: 5, active: true },
    { id: 3, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 0, active: true },
    { id: 4, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 1, active: true },
    { id: 5, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 2, active: true },
    { id: 6, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 3, active: true },
    { id: 7, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 4, active: true },
    { id: 8, tipo: "diurno", turniExtra: ["N"], riposoTipo: "rotante", rotationSlot: 5, active: true },
    { id: 9, tipo: "turnante", riposoTipo: "rotante", rotationSlot: 6, active: true },
    { id: 10, tipo: "notturno", riposoTipo: "rotante", rotationSlot: 7, active: true },
  ];
}

function run(overrides = {}) {
  return generateSchedule({
    dipendenti: dipendentiBase(),
    turniEsistenti: {},
    anno: 2026,
    mese: 6,
    numGiorni: 30,
    coperturaRegole: COPERTURA,
    regoleAttive: REGOLE_ATTIVE,
    ordineRegolePreferenza: ORDINE_REGOLE_PREFERENZA,
    preferenze: {},
    statoMese: "bozza",
    random: Math.random,
    ...overrides,
  });
}

describe("FIX #4 — ferie/permessi mai sovrascritti dalla rigenerazione", () => {
  it("un permesso (P) senza DNM sopravvive alla rigenerazione", () => {
    const turniEsistenti = { "3_2026_6_10": { code: "P", dnm: false } };
    const { turni } = run({ turniEsistenti });
    expect(turni["3_2026_6_10"]).toEqual({ code: "P", dnm: false });
  });

  it("una ferie (F) senza DNM sopravvive alla rigenerazione", () => {
    const turniEsistenti = { "4_2026_6_5": { code: "F", dnm: false } };
    const { turni } = run({ turniEsistenti });
    expect(turni["4_2026_6_5"]).toEqual({ code: "F", dnm: false });
  });

  it("un turno normale (non ferie/permesso, non DNM) VIENE rigenerato", () => {
    const turniEsistenti = { "3_2026_6_10": { code: "C1", dnm: false } };
    const { turni } = run({ turniEsistenti });
    // il turno normale non è protetto: la nuova generazione può assegnare qualcos'altro
    // (compreso di nuovo C1, ma non è garantito che rimanga invariato)
    expect(turni["3_2026_6_10"]).toBeDefined();
  });

  it("un turno bloccato con DNM sopravvive comunque, indipendentemente dal codice", () => {
    const turniEsistenti = { "3_2026_6_10": { code: "C2", dnm: true } };
    const { turni } = run({ turniEsistenti });
    expect(turni["3_2026_6_10"]).toEqual({ code: "C2", dnm: true });
  });
});

describe("FIX #6 — generazione bloccata su mese Definitivo", () => {
  it("non modifica nulla e segnala il blocco se statoMese è 'definitivo'", () => {
    const turniEsistenti = { "3_2026_6_1": { code: "C1", dnm: false } };
    const { turni, bloccato, conflitti } = run({ turniEsistenti, statoMese: "definitivo" });
    expect(bloccato).toBe(true);
    expect(turni).toBe(turniEsistenti); // stesso riferimento: nessuna copia/modifica
    expect(conflitti[0].messaggio).toMatch(/definitivo/i);
  });
});

describe("FIX #10 — dipendenti disattivati non vengono toccati", () => {
  it("un dipendente con active:false non riceve nuovi turni e i suoi turni esistenti non cambiano", () => {
    const dipendenti = dipendentiBase();
    dipendenti[2] = { ...dipendenti[2], active: false }; // id 3
    const turniEsistenti = { "3_2026_6_1": { code: "C1", dnm: false } };
    const { turni } = generateSchedule({
      dipendenti,
      turniEsistenti,
      anno: 2026,
      mese: 6,
      numGiorni: 30,
      coperturaRegole: COPERTURA,
      regoleAttive: REGOLE_ATTIVE,
      ordineRegolePreferenza: ORDINE_REGOLE_PREFERENZA,
      preferenze: {},
      statoMese: "bozza",
    });
    // il turno esistente del dipendente disattivato non viene toccato (né cancellato né rigenerato)
    expect(turni["3_2026_6_1"]).toEqual({ code: "C1", dnm: false });
    // non riceve nuovi turni negli altri giorni (nessuna chiave 3_2026_6_X oltre a quella preesistente)
    const chiaviDip3 = Object.keys(turni).filter((k) => k.startsWith("3_2026_6_"));
    expect(chiaviDip3).toEqual(["3_2026_6_1"]);
  });
});

describe("Copertura di base (nessuna regressione dopo l'estrazione)", () => {
  it("genera un planning senza celle vuote per uno scenario semplice", () => {
    const { turni, conflitti } = run();
    const dipendenti = dipendentiBase();
    let vuote = 0;
    for (let g = 1; g <= 30; g++) {
      for (const d of dipendenti) {
        if (!turni[`${d.id}_2026_6_${g}`]) vuote++;
      }
    }
    expect(vuote).toBe(0);
    expect(conflitti.length).toBe(0);
  });

  it("CE viene assegnato come riserva ai diurni/turnanti liberi (FIX #9 integrato)", () => {
    const { turni } = run();
    const presenzaCE = Object.values(turni).some((t) => t.code === "CE");
    expect(presenzaCE).toBe(true);
  });
});
