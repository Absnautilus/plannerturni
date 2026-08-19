import { giornoSettimana } from "./dates.js";
import { TIPI_TURNO } from "../constants/shifts.js";

function keyTurno(empId, anno, mese, giorno) {
  return `${empId}_${anno}_${mese}_${giorno}`;
}

// Un turno "di copertura" (A1/A2/C1/C2/N/D1/D2/F1/F2/CE) ha sempre un orario; riposo, ferie,
// permesso e le etichette di assenza (P1-8, R1-8, RS, RR, AS, M, FG) no — su questi ultimi non
// ha senso valutare una "preferenza rispettata".
function eTurnoDiCopertura(codice) {
  return !!TIPI_TURNO[codice]?.orario;
}

// La preferenza più alta di un dipendente per un giorno della settimana: prima quella
// specifica per quel giorno (preferenzeGiorno), se impostata; altrimenti quella generale
// (ordinePreferenza). Nessuna delle due impostata → null, nessuna preferenza da rispettare.
function preferenzaPrincipale(preferenzeEmp, indiceGiornoSettimana) {
  const specifica = preferenzeEmp?.preferenzeGiorno?.[indiceGiornoSettimana];
  if (specifica && specifica.length > 0) return specifica[0];
  const generale = preferenzeEmp?.ordinePreferenza;
  if (generale && generale.length > 0) return generale[0];
  return null;
}

// Percentuale di giorni del mese, tra quelli con un turno di copertura assegnato, in cui il
// turno coincide con la preferenza più alta del dipendente per quel giorno. null se il
// dipendente non ha nessun turno di copertura nel mese (percentuale non significativa, non 0%).
export function percentualeSoddisfazionePreferenze({ turni, preferenzeEmp, empId, anno, mese, numGiorni }) {
  let assegnati = 0;
  let soddisfatti = 0;
  for (let giorno = 1; giorno <= numGiorni; giorno++) {
    const t = turni[keyTurno(empId, anno, mese, giorno)];
    if (!t || !eTurnoDiCopertura(t.code)) continue;
    assegnati += 1;
    const preferita = preferenzaPrincipale(preferenzeEmp, giornoSettimana(anno, mese, giorno));
    if (preferita && preferita === t.code) soddisfatti += 1;
  }
  if (assegnati === 0) return null;
  return Math.round((soddisfatti / assegnati) * 100);
}
