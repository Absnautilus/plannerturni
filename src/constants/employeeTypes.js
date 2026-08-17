// FIX #9: CE veniva assegnato dall'algoritmo (Passo 4) ma non compariva mai in
// turniAmmessiDipendente(), quindi non era selezionabile nelle Preferenze, nella richiesta
// Ferie/Permessi ("turno interessato") né nelle Pre-assegnazioni per diurno/turnante.
//
// Scelta confermata: CE resta un turno "extra" (non promosso a turno di base/proprio del
// ruolo) — semanticamente è un ripiego quando la copertura richiesta è già soddisfatta, non
// un turno che qualcuno debba mai essere "candidato primario" per fare. Lo aggiungiamo quindi
// come turniExtraRuolo, non in turniAmmessi.
export const TIPI_DIPENDENTE = {
  diurno: { label: "Diurno", turniAmmessi: ["C1", "C2", "A1", "A2"], turniExtraRuolo: ["CE"] },
  turnante: { label: "Turnante", turniAmmessi: ["C1", "C2", "A1", "A2", "N"], turniExtraRuolo: ["CE"] },
  notturno: { label: "Notturno", turniAmmessi: ["N"], turniExtraRuolo: [] },
  direttore: { label: "Direttore", turniAmmessi: ["D1", "D2"], turniExtraRuolo: [] },
  fom: { label: "Front Office Manager", turniAmmessi: ["F1", "F2"], turniExtraRuolo: [] },
};

// Turni "propri" del ruolo — pool primario (candidatiBase) nell'assegnazione automatica.
export function turniBaseDipendente(d) {
  return TIPI_DIPENDENTE[d.tipo]?.turniAmmessi || [];
}

// Turni extra: di ruolo (es. CE per diurno/turnante) + individuali (es. Raoul -> N).
// Pool di riserva (candidatiRiserva) nell'assegnazione automatica.
export function turniExtraDipendente(d) {
  const extraRuolo = TIPI_DIPENDENTE[d.tipo]?.turniExtraRuolo || [];
  const extraIndividuale = d.turniExtra || [];
  return [...new Set([...extraRuolo, ...extraIndividuale])];
}

// Tutti i turni che un dipendente può fare (base + extra), usato dalle UI (Preferenze,
// Ferie/Permessi, Pre-assegnazioni) dove non serve distinguere base da riserva.
export function turniAmmessiDipendente(d) {
  return [...new Set([...turniBaseDipendente(d), ...turniExtraDipendente(d)])];
}
