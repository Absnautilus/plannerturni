// FIX #10: prima "Elimina" faceva un filter() incondizionato sull'array dipendenti, senza
// alcun controllo sui turni storici collegati. Confermato: manteniamo la possibilità di
// eliminazione fisica SOLO per correggere errori (dipendente aggiunto per sbaglio, zero turni
// storici) — se esiste anche un solo turno storico collegato, l'eliminazione è vietata e va
// usata la disattivazione (active:false), che preserva lo storico.

export function haStoricoTurni(turni, empId) {
  const prefisso = `${empId}_`;
  return Object.keys(turni).some((k) => k.startsWith(prefisso));
}

export function puoEliminareDefinitivamente(turni, empId) {
  return !haStoricoTurni(turni, empId);
}

export function disattivaDipendente(dipendenti, empId) {
  return dipendenti.map((d) => (d.id === empId ? { ...d, active: false } : d));
}

export function attivaDipendente(dipendenti, empId) {
  return dipendenti.map((d) => (d.id === empId ? { ...d, active: true } : d));
}

// Restituisce { ok: true, dipendenti } se l'eliminazione è avvenuta, oppure
// { ok: false, errore } se è stata rifiutata perché esistono turni storici.
export function eliminaDipendente(dipendenti, turni, empId) {
  if (!puoEliminareDefinitivamente(turni, empId)) {
    return {
      ok: false,
      errore: "Questo dipendente ha turni storici collegati: non può essere eliminato definitivamente. Usa 'Disattiva' per rimuoverlo dalla rotazione mantenendo lo storico.",
    };
  }
  return { ok: true, dipendenti: dipendenti.filter((d) => d.id !== empId) };
}
