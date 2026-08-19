import { describe, it, expect } from "vitest";
import { eRiposoPerGiorno, prossimoRotationSlotLibero } from "./restRotation.js";

// Cammina giorno per giorno su un intervallo continuo (attraversando mesi e anni) e raggruppa
// i giorni di riposo consecutivi di un dipendente.
function gruppiDiRiposoContinui(dipendente, dataInizio, dataFine, agganciaTurnanteANotturno = true, altriDipendenti = []) {
  const gruppi = [];
  let corrente = null;
  const d = new Date(dataInizio);
  while (d < dataFine) {
    const anno = d.getUTCFullYear(), mese = d.getUTCMonth(), giorno = d.getUTCDate();
    const risultato = eRiposoPerGiorno([dipendente, ...altriDipendenti], anno, mese, giorno, agganciaTurnanteANotturno);
    const idx = Math.round((d - dataInizio) / 86400000);
    if (risultato[dipendente.id]) {
      if (corrente && corrente[corrente.length - 1] === idx - 1) corrente.push(idx);
      else { if (corrente) gruppi.push(corrente); corrente = [idx]; }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (corrente) gruppi.push(corrente);
  return gruppi;
}

describe("regola confermata: coppia, coppia, coppia, singolo (poi ruota e ricomincia)", () => {
  // Nota: l'inizio/fine della finestra di simulazione cade in un punto arbitrario del ciclo
  // reale (che parte dall'epoch, gennaio 2020), quindi la FASE del pattern osservato nella
  // finestra è imprevedibile (può iniziare da una coppia o direttamente da un singolo). Per
  // questo le asserzioni sotto non assumono una fase fissa: verificano solo che (a) ogni
  // gruppo sia lungo 1 o 2, (b) i singoli siano sempre separati da esattamente 3 coppie.
  it("su un intervallo lungo, ogni gruppo di riposo è una coppia o un singolo, e i singoli sono separati da esattamente 3 coppie", () => {
    const inizio = new Date(Date.UTC(2026, 6, 1));
    const fine = new Date(Date.UTC(2028, 6, 1));
    for (let slot = 0; slot < 8; slot++) {
      const dipendente = { id: "x", tipo: "diurno", riposoTipo: "rotante", rotationSlot: slot };
      const gruppi = gruppiDiRiposoContinui(dipendente, inizio, fine);
      // scarta il primo/ultimo gruppo: la finestra può tagliarli a metà (es. mostrare solo il
      // secondo giorno di una coppia che inizia prima della finestra), quindi non sono
      // affidabili — tutti i gruppi INTERNI invece sono sempre completi e genuini.
      const lunghezze = gruppi.slice(1, -1).map((g) => g.length);
      lunghezze.forEach((lung, i) => {
        expect([1, 2], `slot ${slot}, evento ${i}: lunghezza ${lung} non valida`).toContain(lung);
      });
      const indiciSingoli = lunghezze.map((l, i) => (l === 1 ? i : -1)).filter((i) => i !== -1);
      expect(indiciSingoli.length, `slot ${slot}: nessun singolo trovato nella finestra`).toBeGreaterThan(1);
      for (let k = 1; k < indiciSingoli.length; k++) {
        const distanza = indiciSingoli[k] - indiciSingoli[k - 1];
        expect(distanza, `slot ${slot}: due singoli consecutivi a distanza ${distanza} invece di 4 (3 coppie)`).toBe(4);
      }
      expect(lunghezze.length).toBeGreaterThan(8);
    }
  });

  it("tra la fine di una coppia e il riposo singolo successivo (o la coppia successiva) ci sono sempre esattamente 5 giorni lavorativi", () => {
    const dipendente = { id: "x", tipo: "diurno", riposoTipo: "rotante", rotationSlot: 2 };
    const inizio = new Date(Date.UTC(2026, 6, 1));
    const fine = new Date(Date.UTC(2027, 6, 1));
    const gruppi = gruppiDiRiposoContinui(dipendente, inizio, fine).slice(1, -1);
    for (let i = 1; i < gruppi.length; i++) {
      const fineGruppoPrecedente = gruppi[i - 1][gruppi[i - 1].length - 1];
      const inizioGruppoCorrente = gruppi[i][0];
      const giorniLavorativi = inizioGruppoCorrente - fineGruppoPrecedente - 1;
      expect(giorniLavorativi, `tra il gruppo ${i - 1} e il gruppo ${i}`).toBe(5);
    }
  });
});

describe("riposo fisso", () => {
  it("un dipendente 'fisso' ha sempre la stessa coppia di riposo, indipendentemente da mese/anno", () => {
    const dipendenti = [{ id: 1, tipo: "diurno", riposoTipo: "fisso", riposoFissoGiorno: 5 }];
    const a = eRiposoPerGiorno(dipendenti, 2026, 3, 4); // sabato 4 aprile 2026
    const b = eRiposoPerGiorno(dipendenti, 2027, 8, 4); // sabato 4 settembre 2027
    expect(a[1]).toBe(true);
    expect(b[1]).toBe(true);
  });

  it("un dipendente 'fisso' non è mai in riposo nei giorni fuori dalla sua coppia", () => {
    const dipendenti = [{ id: 1, tipo: "diurno", riposoTipo: "fisso", riposoFissoGiorno: 5 }]; // Sab+Dom
    const mercoledi = eRiposoPerGiorno(dipendenti, 2026, 3, 1); // mercoledì 1 aprile 2026
    expect(mercoledi[1]).toBe(false);
  });
});

describe("turnante agganciato al notturno", () => {
  it("il turnante rotante riposa 2 giorni della settimana dopo il notturno rotante", () => {
    const dipendenti = [
      { id: 1, tipo: "notturno", riposoTipo: "rotante", rotationSlot: 0 },
      { id: 2, tipo: "turnante", riposoTipo: "rotante", rotationSlot: 1 },
    ];
    // trova un giorno in cui il notturno è in riposo, e verifica che 2 giorni dopo lo sia il turnante
    for (let giorno = 1; giorno <= 20; giorno++) {
      const oggi = eRiposoPerGiorno(dipendenti, 2026, 6, giorno);
      if (oggi[1]) {
        const dueDopo = eRiposoPerGiorno(dipendenti, 2026, 6, giorno + 2);
        expect(dueDopo[2]).toBe(true);
        return;
      }
    }
    throw new Error("nessun giorno di riposo trovato nella finestra di test");
  });

  it("l'aggancio NON si applica se uno dei due è fisso", () => {
    const dipendenti = [
      { id: 1, tipo: "notturno", riposoTipo: "fisso", riposoFissoGiorno: 2 },
      { id: 2, tipo: "turnante", riposoTipo: "rotante", rotationSlot: 1 },
    ];
    // il turnante deve seguire il proprio rotationSlot, non il fisso del notturno
    const conAggancio = eRiposoPerGiorno(dipendenti, 2026, 6, 10, true);
    const senzaAggancio = eRiposoPerGiorno(dipendenti, 2026, 6, 10, false);
    expect(conAggancio[2]).toBe(senzaAggancio[2]);
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
      { id: 1, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 0 },
      { id: 2, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 1 },
      { id: 3, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 2 },
    ];
    const prima = eRiposoPerGiorno(dipendenti, 2026, 5, 10);
    // rimuovo il dipendente 2 e riordino l'array (simula eliminazione + refresh lista)
    const dipendentiDopo = [
      { id: 3, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 2 },
      { id: 1, tipo: "diurno", riposoTipo: "rotante", rotationSlot: 0 },
    ];
    const dopo = eRiposoPerGiorno(dipendentiDopo, 2026, 5, 10);
    // il dipendente 1 e il dipendente 3 devono avere lo STESSO riposo di prima: la loro
    // rotazione non deve essere stata alterata dalla rimozione/riordino altrui
    expect(dopo[1]).toBe(prima[1]);
    expect(dopo[3]).toBe(prima[3]);
  });
});
