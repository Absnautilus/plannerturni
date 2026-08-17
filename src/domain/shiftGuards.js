// FIX #5: prima la regola "DNM blocca la modifica" era duplicata (male) o assente in punti
// diversi del codice: impostaTurno() la ignorava sul codice, correggiSequenza() controllava
// il DNM del collega nello scambio ma MAI quello del proprio slot, applicaPreassegnazioneTurno()
// non la controllava affatto. Ora ogni funzione che modifica un turno deve passare da qui prima.
//
// canModifyShift(shift) -> { allowed: boolean, reason?: string }
export function canModifyShift(shift) {
  if (shift && shift.dnm === true) {
    return { allowed: false, reason: "Turno bloccato (Do Not Move): sblocca il turno prima di modificarlo." };
  }
  return { allowed: true };
}

// Comodo per i call-site che vogliono lanciare invece di controllare un booleano:
// throwIfNotModifiable(shift) — usato nei punti "amministrativi" dove una modifica bloccata
// è un errore di programmazione (non dovrebbe mai capitare se la UI rispetta canModifyShift),
// mentre i punti UI-facing usano canModifyShift() direttamente per mostrare un messaggio.
export function throwIfNotModifiable(shift, context = "") {
  const esito = canModifyShift(shift);
  if (!esito.allowed) {
    throw new Error(`${esito.reason}${context ? ` (${context})` : ""}`);
  }
}

// FIX #4: un'assenza approvata (Ferie/Permesso) va protetta dalla rigenerazione automatica
// del planning A PRESCINDERE dal flag DNM — altrimenti "Assegna automaticamente" la cancella
// silenziosamente ogni volta che non è stata anche bloccata manualmente.
export function eProtettoDaRigenerazione(shift) {
  if (!shift) return false;
  if (shift.dnm === true) return true;
  return shift.code === "F" || shift.code === "P";
}
