import { describe, it, expect } from "vitest";
import {
  swapDaRiga,
  rigaDaSwap,
  assenzaDaRiga,
  rigaDaAssenza,
  preassegnazioneDaRiga,
  rigaDaPreassegnazione,
} from "./richiesteMapper.js";

describe("swap", () => {
  it("converte le colonne snake_case della riga in camelCase", () => {
    const riga = {
      id: 7,
      da_profile_id: "emp-1",
      a_profile_id: "emp-2",
      anno_da: 2026,
      mese_da: 3,
      giorno_da: 10,
      anno_a: 2026,
      mese_a: 3,
      giorno_a: 12,
      turno_da: "A1",
      turno_a: "C1",
      stato: "in_attesa_collega",
      nota_sistema: null,
      motivo_rifiuto: null,
    };
    expect(swapDaRiga(riga)).toEqual({
      id: 7,
      daEmpId: "emp-1",
      aEmpId: "emp-2",
      annoDa: 2026,
      meseDa: 3,
      giornoDa: 10,
      annoA: 2026,
      meseA: 3,
      giornoA: 12,
      turnoDa: "A1",
      turnoA: "C1",
      stato: "in_attesa_collega",
      notaSistema: null,
      motivoRifiuto: null,
    });
  });

  it("rigaDaSwap converte solo i campi presenti e ignora id", () => {
    expect(rigaDaSwap({ id: 7, stato: "applicata", motivoRifiuto: null })).toEqual({
      stato: "applicata",
      motivo_rifiuto: null,
    });
  });
});

describe("assenza", () => {
  it("converte le colonne snake_case della riga in camelCase", () => {
    const riga = {
      id: 3,
      profile_id: "emp-1",
      giorno: 15,
      anno: 2026,
      mese: 4,
      tipo: "F",
      turno_interessato: null,
      nota: "vacanza",
      ore: null,
      ora_inizio: "",
      ora_fine: "",
      stato: "in sospeso",
      motivo_rifiuto: null,
    };
    expect(assenzaDaRiga(riga)).toEqual({
      id: 3,
      empId: "emp-1",
      giorno: 15,
      anno: 2026,
      mese: 4,
      tipo: "F",
      turnoInteressato: null,
      nota: "vacanza",
      ore: null,
      oraInizio: "",
      oraFine: "",
      stato: "in sospeso",
      motivoRifiuto: null,
    });
  });

  it("rigaDaAssenza converte solo i campi presenti", () => {
    expect(rigaDaAssenza({ stato: "rifiutata", motivoRifiuto: "coperture insufficienti" })).toEqual({
      stato: "rifiutata",
      motivo_rifiuto: "coperture insufficienti",
    });
  });
});

describe("preassegnazione", () => {
  it("converte le colonne snake_case della riga in camelCase", () => {
    const riga = {
      id: 9,
      profile_id: "emp-1",
      giorno: 2,
      anno: 2026,
      mese: 4,
      turno: "N",
      nota: "",
      stato: "approvata",
      motivo_rifiuto: null,
    };
    expect(preassegnazioneDaRiga(riga)).toEqual({
      id: 9,
      empId: "emp-1",
      giorno: 2,
      anno: 2026,
      mese: 4,
      turno: "N",
      nota: "",
      stato: "approvata",
      motivoRifiuto: null,
    });
  });

  it("rigaDaPreassegnazione converte solo i campi presenti", () => {
    expect(rigaDaPreassegnazione({ turno: "R", stato: "in sospeso" })).toEqual({
      turno: "R",
      stato: "in sospeso",
    });
  });
});
