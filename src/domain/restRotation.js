// FIX #2 + #3 (storico): la vecchia calcolaOffsetRiposo(indice, mese) aveva due problemi:
//   1) usava "mese" (0-11) da solo, quindi a ogni gennaio la rotazione "ripartiva" invece
//      di continuare in modo prevedibile da dicembre — niente continuità tra anni.
//   2) "indice" era la posizione del dipendente nell'array corrente (ricalcolata ogni volta
//      con poolRotante.findIndex), quindi aggiungere/rimuovere/riordinare qualcuno cambiava
//      la rotazione di TUTTI gli altri, non solo della persona toccata.
// Risolti con un "rotationSlot" stabile assegnato una volta al dipendente e una generazione
// continua nel tempo (mai ancorata a un "mese 0" implicito).

// Regola confermata (schema reale usato finora): un dipendente rotante riposa normalmente in
// coppie di 2 giorni consecutivi a settimana. Dopo ogni 3 coppie consecutive, il turno di
// riposo successivo è UN SOLO giorno (non una coppia) e in quel momento il giorno della
// settimana del riposo si sposta indietro di 1, per far ruotare i turni — poi si ricomincia
// con le coppie sul nuovo giorno. Il ciclo è quindi: coppia, coppia, coppia, singolo, coppia,
// coppia, coppia, singolo, ... Le coppie sono generate in sequenza continua (mai come funzione
// pura del solo giorno) così restano sempre esattamente 7 giorni l'una dall'altra, senza mai
// dipendere da dove cadono i confini di mese.

const EPOCH_LUNEDI_UTC = Date.UTC(2020, 0, 6); // lunedì 6 gennaio 2020: weekday 0 per definizione
const MS_GIORNO = 86400000;
const COPPIE_PER_CICLO = 3; // dopo quante coppie consecutive il riposo diventa un singolo e ruota

function giorniEpochDaData(anno, mese, giorno) {
  return Math.round((Date.UTC(anno, mese, giorno) - EPOCH_LUNEDI_UTC) / MS_GIORNO);
}

function weekdayDaGiorniEpoch(giorniEpoch) {
  return ((giorniEpoch % 7) + 7) % 7; // l'epoch è un lunedì, quindi mod 7 dà già 0=Lun...6=Dom
}

// Genera, camminando in avanti dall'epoch, gli eventi di riposo (ciascuno una coppia di
// giorniEpoch [inizio, fine] o un singolo [giorno]) per un dato giorno-della-settimana di
// partenza, fino a superare `finoAGiornoEpoch`. Ogni evento parte esattamente 7 giorni dopo
// l'inizio del precedente; ogni 4° evento (dopo 3 coppie) è un giorno singolo sul nuovo
// weekday (ruotato indietro di 1), poi si ricomincia con le coppie.
function generaEventiRiposo(weekdayIniziale, finoAGiornoEpoch) {
  const eventi = [];
  let weekdayCorrente = ((weekdayIniziale % 7) + 7) % 7;
  let inizio = weekdayCorrente; // primo giorno (>= epoch) con questo weekday
  let contatoreCoppie = 0;
  while (inizio <= finoAGiornoEpoch) {
    if (contatoreCoppie < COPPIE_PER_CICLO) {
      eventi.push([inizio, inizio + 1]);
      contatoreCoppie++;
      inizio += 7;
    } else {
      weekdayCorrente = ((weekdayCorrente - 1) % 7 + 7) % 7;
      // il singolo cade nella stessa posizione settimanale in cui sarebbe caduta la 4a
      // coppia, ma sul nuovo weekday: prima occorrenza del nuovo weekday da lì in poi.
      let candidato = inizio;
      while (weekdayDaGiorniEpoch(candidato) !== weekdayCorrente) candidato++;
      eventi.push([candidato]);
      contatoreCoppie = 0;
      inizio = candidato + 7;
    }
  }
  return eventi;
}

// true se il giorno indicato è uno dei giorni di riposo (coppia o singolo) di un dipendente
// rotante con questo weekday di partenza (derivato dal rotationSlot, o forzato per l'aggancio
// turnante/notturno).
function eGiornoDiRiposoRotante(weekdayIniziale, anno, mese, giorno) {
  const giornoEpoch = giorniEpochDaData(anno, mese, giorno);
  const eventi = generaEventiRiposo(weekdayIniziale, giornoEpoch + 1);
  return eventi.some((e) => e.includes(giornoEpoch));
}

// true se il giorno indicato è uno dei due giorni della coppia FISSA (non ruota mai) che
// inizia al giorno della settimana indicato — stessa regola "coppia di 2 giorni" del rotante,
// ma sempre sullo stesso weekday: nessun rischio di coppia spezzata, essendo costante nel tempo.
function eGiornoDiRiposoFisso(riposoFissoGiorno, anno, mese, giorno) {
  const gs = weekdayDaGiorniEpoch(giorniEpochDaData(anno, mese, giorno));
  return gs === riposoFissoGiorno || gs === (riposoFissoGiorno + 1) % 7;
}

// Assegna un rotationSlot stabile a un nuovo dipendente: il più piccolo intero non ancora
// usato da nessun altro dipendente rotante esistente. Una volta assegnato, il valore va
// salvato sul dipendente e non ricalcolato mai più.
export function prossimoRotationSlotLibero(dipendenti) {
  const usati = new Set(
    dipendenti.filter((d) => d.rotationSlot !== undefined && d.rotationSlot !== null).map((d) => d.rotationSlot)
  );
  let slot = 0;
  while (usati.has(slot)) slot++;
  return slot;
}

// Calcola, per un giorno specifico, se ciascun dipendente è in riposo. "Fisso":
// riposoFissoGiorno configurabile, non ruota mai. "Rotante" (default): rotationSlot stabile,
// weekday di partenza (rotationSlot*2)%7, ciclo coppia/coppia/coppia/singolo. Il turnante, se
// rotante, riposa sempre 2 giorni della settimana dopo il notturno se anch'esso rotante
// (stesso weekday di partenza spostato di 2, stesso ciclo).
export function eRiposoPerGiorno(dipendenti, anno, mese, giorno, agganciaTurnanteANotturno = true) {
  const weekdayInizialePerId = {};
  dipendenti.forEach((d) => {
    if (d.riposoTipo !== "fisso") {
      weekdayInizialePerId[d.id] = ((d.rotationSlot ?? 0) * 2) % 7;
    }
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
    weekdayInizialePerId[turnanteTitolare.id] = (weekdayInizialePerId[notturnoTitolare.id] + 2) % 7;
  }

  const risultato = {};
  dipendenti.forEach((d) => {
    risultato[d.id] = d.riposoTipo === "fisso"
      ? eGiornoDiRiposoFisso(d.riposoFissoGiorno ?? 5, anno, mese, giorno)
      : eGiornoDiRiposoRotante(weekdayInizialePerId[d.id], anno, mese, giorno);
  });
  return risultato;
}
