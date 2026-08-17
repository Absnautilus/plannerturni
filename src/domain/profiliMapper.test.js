import { describe, it, expect } from "vitest";
import { profiloDaRiga, rigaDaProfiloParziale } from "./profiliMapper.js";

describe("profiloDaRiga", () => {
  it("converte le colonne snake_case della riga in camelCase", () => {
    const riga = {
      id: "abc-123",
      cognome: "Rossi",
      nome: "Mario",
      tipo: "diurno",
      riposo_tipo: "rotante",
      riposo_fisso_giorno: null,
      rotation_slot: 2,
      active: true,
      colore: "#123456",
      turni_extra: ["N"],
      quota_ferie_annua: 26,
      quota_permessi_ore_annue: 88,
      is_admin: false,
    };
    expect(profiloDaRiga(riga)).toEqual({
      id: "abc-123",
      cognome: "Rossi",
      nome: "Mario",
      tipo: "diurno",
      riposoTipo: "rotante",
      riposoFissoGiorno: null,
      rotationSlot: 2,
      active: true,
      colore: "#123456",
      turniExtra: ["N"],
      quotaFerieAnnua: 26,
      quotaPermessiOreAnnue: 88,
      isAdmin: false,
    });
  });

  it("turni_extra mancante diventa array vuoto, non undefined", () => {
    expect(profiloDaRiga({ id: "1", turni_extra: null }).turniExtra).toEqual([]);
  });
});

describe("rigaDaProfiloParziale", () => {
  it("converte solo i campi presenti nel patch", () => {
    expect(rigaDaProfiloParziale({ tipo: "fom", active: false })).toEqual({
      tipo: "fom",
      active: false,
    });
  });

  it("ignora chiavi non mappate", () => {
    expect(rigaDaProfiloParziale({ pin: "1234" })).toEqual({});
  });
});
