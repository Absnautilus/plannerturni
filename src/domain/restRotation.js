import { indiceMeseAssoluto } from "./dates.js";

// FIX #2 + #3: la vecchia calcolaOffsetRiposo(indice, mese) aveva due problemi:
//   1) usava "mese" (0-11) da solo, quindi a ogni gennaio la rotazione "ripartiva" invece
//      di continuare in modo prevedibile da dicembre — niente continuità tra anni.
//   2) "indice" era la posizione del dipendente nell'array corrente (ricalcolata ogni volta
//      con poolRotante.findIndex), quindi aggiungere/rimuovere/riordinare qualcuno cambiava
//      la rotazione di TUTTI gli altri, non solo della persona toccata.
//
// Qui: offsetBase deriva da un "rotationSlot" stabile assegnato UNA VOLTA al dipendente
// (mai ricalcolato dalla posizione nell'array), e la rotazione avanza sull'indice di mese
// assoluto (anno*12+mese), continuo su qualunque numero di anni.
//
// NOTA: questo cambia i valori di offset restituiti rispetto alla vecchia formula (anche per
// il mese corrente), perché la vecchia formula era di fatto ancorata a un "anno 0" implicito.
// È il fix intenzionale del bug #2, non una regressione: il giorno di riposo di ciascuno si
// sposta di una posizione fissa rispetto a prima, ma la rotazione torna coerente nel tempo.
export function calcolaOffsetRiposo(rotationSlot, anno, mese) {
  const indiceAssoluto = indiceMeseAssoluto(anno, mese);
  const offsetBase = (rotationSlot * 2) % 7;
  return (((offsetBase - indiceAssoluto) % 7) + 7) % 7;
}

// Assegna un rotationSlot stabile a un nuovo dipendente: il più piccolo intero non ancora
// usato da nessun altro dipendente rotante esistente. Una volta assegnato, il valore va
// salvato sul dipendente e non ricalcolato mai più (a differenza della vecchia findIndex).
export function prossimoRotationSlotLibero(dipendenti) {
  const usati = new Set(
    dipendenti.filter((d) => d.rotationSlot !== undefined && d.rotationSlot !== null).map((d) => d.rotationSlot)
  );
  let slot = 0;
  while (usati.has(slot)) slot++;
  return slot;
}

// Calcola, per un dato anno/mese, il giorno della settimana (0=Lun...6=Dom) in cui inizia
// la coppia di riposo di ciascun dipendente. "Fisso": riposoFissoGiorno configurabile, non
// ruota mai. "Rotante" (default): rotationSlot stabile + indice mese assoluto (fix #2/#3).
// Il turnante, se rotante, riposa sempre subito DOPO il notturno se anch'esso rotante.
export function calcolaOffsetRiposoPerMese(dipendenti, anno, mese, agganciaTurnanteANotturno = true) {
  const offsetPerId = {};
  dipendenti.forEach((d) => {
    offsetPerId[d.id] = d.riposoTipo === "fisso"
      ? (d.riposoFissoGiorno ?? 5)
      : calcolaOffsetRiposo(d.rotationSlot ?? 0, anno, mese);
  });

  const notturnoTitolare = dipendenti.find((d) => d.tipo === "notturno");
  const turnanteTitolare = dipendenti.find((d) => d.tipo === "turnante");
  if (
    agganciaTurnanteANotturno &&
    notturnoTitolare &&
    turnanteTitolare &&
    notturnoTitolare.riposoTipo !== "fisso" &&
    turnanteTitolare.riposoTipo !== "fisso"
  ) {
    offsetPerId[turnanteTitolare.id] = (offsetPerId[notturnoTitolare.id] + 2) % 7;
  }
  return offsetPerId;
}
