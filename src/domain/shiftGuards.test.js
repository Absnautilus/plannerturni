import { describe, it, expect } from "vitest";
import { canModifyShift, throwIfNotModifiable, eProtettoDaRigenerazione } from "./shiftGuards.js";

describe("canModifyShift (FIX #5)", () => {
  it("permette la modifica se non c'è alcun turno", () => {
    expect(canModifyShift(undefined)).toEqual({ allowed: true });
  });

  it("permette la modifica se il turno non è bloccato", () => {
    expect(canModifyShift({ code: "C1", dnm: false })).toEqual({ allowed: true });
  });

  it("blocca la modifica se dnm è true, con un motivo leggibile", () => {
    const esito = canModifyShift({ code: "C1", dnm: true });
    expect(esito.allowed).toBe(false);
    expect(esito.reason).toMatch(/bloccato/i);
  });
});

describe("throwIfNotModifiable", () => {
  it("non lancia se il turno è modificabile", () => {
    expect(() => throwIfNotModifiable({ code: "C1", dnm: false })).not.toThrow();
  });

  it("lancia se il turno è bloccato", () => {
    expect(() => throwIfNotModifiable({ code: "C1", dnm: true }, "test scambio")).toThrow(/test scambio/);
  });
});

describe("eProtettoDaRigenerazione (FIX #4)", () => {
  it("un turno normale non protetto non è protetto", () => {
    expect(eProtettoDaRigenerazione({ code: "C1", dnm: false })).toBe(false);
  });

  it("una ferie (F) è protetta anche con dnm:false — non deve mai essere cancellata da 'Assegna automaticamente'", () => {
    expect(eProtettoDaRigenerazione({ code: "F", dnm: false })).toBe(true);
  });

  it("un permesso (P) è protetto anche con dnm:false", () => {
    expect(eProtettoDaRigenerazione({ code: "P", dnm: false })).toBe(true);
  });

  it("qualunque turno con dnm:true è protetto", () => {
    expect(eProtettoDaRigenerazione({ code: "C2", dnm: true })).toBe(true);
  });

  it("nessun turno esistente non è protetto", () => {
    expect(eProtettoDaRigenerazione(undefined)).toBe(false);
  });
});
