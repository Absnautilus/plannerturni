// Funzioni data pure, senza dipendenze da React o dallo stato dell'app.
// GIORNI_SETTIMANA: 0=Lun ... 6=Dom (convenzione usata in tutto il progetto).

export const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function giorniDelMese(anno, mese) {
  return new Date(anno, mese + 1, 0).getDate();
}

export function giornoSettimana(anno, mese, giorno) {
  const d = new Date(anno, mese, giorno);
  return (d.getDay() + 6) % 7; // 0 = Lun ... 6 = Dom
}

export function nomeGiorno(anno, mese, giorno) {
  return GIORNI_SETTIMANA[giornoSettimana(anno, mese, giorno)];
}

export function eWeekend(anno, mese, giorno) {
  const gs = giornoSettimana(anno, mese, giorno);
  return gs === 5 || gs === 6;
}

// Formatta un giorno del mese/anno indicati come GG/MM/AA
export function formattaData(giorno, mese, anno) {
  const gg = String(giorno).padStart(2, "0");
  const mm = String(mese + 1).padStart(2, "0");
  const aa = String(anno).slice(-2);
  return `${gg}/${mm}/${aa}`;
}

// Restituisce anno/mese/giorno del giorno precedente a quello indicato,
// gestendo correttamente il cambio mese ED eventualmente anno (1 gennaio -> 31 dicembre anno prima).
export function giornoPrecedente(anno, mese, giorno) {
  if (giorno > 1) return { anno, mese, giorno: giorno - 1 };
  const mesePrec = mese === 0 ? 11 : mese - 1;
  const annoPrec = mese === 0 ? anno - 1 : anno;
  return { anno: annoPrec, mese: mesePrec, giorno: giorniDelMese(annoPrec, mesePrec) };
}

// FIX #1: indice mese assoluto (continuo su tutti gli anni), usato per la navigazione
// e per la rotazione dei riposi (vedi restRotation.js) — mai un semplice "mese 0-11" isolato,
// altrimenti dicembre e gennaio si comportano come se fossero anni diversi ma mese uguale.
export function indiceMeseAssoluto(anno, mese) {
  return anno * 12 + mese;
}

export function daIndiceMeseAssoluto(indice) {
  return { anno: Math.floor(indice / 12), mese: ((indice % 12) + 12) % 12 };
}

// Mese successivo/precedente, con cambio anno corretto (FIX #1: le frecce del Calendario
// principale oggi non aggiornano mai l'anno, restando bloccate sullo stesso anno all'infinito).
export function meseSuccessivo(anno, mese) {
  return daIndiceMeseAssoluto(indiceMeseAssoluto(anno, mese) + 1);
}

export function mesePrecedente(anno, mese) {
  return daIndiceMeseAssoluto(indiceMeseAssoluto(anno, mese) - 1);
}
