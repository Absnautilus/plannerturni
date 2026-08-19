// FIX #2 + #3 (storico): la vecchia calcolaOffsetRiposo(indice, mese) aveva due problemi:
//   1) usava "mese" (0-11) da solo, quindi a ogni gennaio la rotazione "ripartiva" invece
//      di continuare in modo prevedibile da dicembre — niente continuità tra anni.
//   2) "indice" era la posizione del dipendente nell'array corrente (ricalcolata ogni volta
//      con poolRotante.findIndex), quindi aggiungere/rimuovere/riordinare qualcuno cambiava
//      la rotazione di TUTTI gli altri, non solo della persona toccata.
// Risolti con un "rotationSlot" stabile assegnato una volta al dipendente e una generazione
// continua nel tempo (mai ancorata a un "mese 0" implicito).

// FIX #11: due tentativi precedenti calcolavano un "offset" (0=Lun...6=Dom) come funzione pura
// di anno/mese/giorno, che cambiava valore o ogni mese di calendario o ogni 4 settimane
// continue. Entrambi hanno lo stesso difetto di fondo: nel momento esatto in cui l'offset
// cambia, se capita a metà di una coppia già iniziata (un giorno valutato con l'offset
// vecchio, il giorno dopo con quello nuovo), la coppia si spezza e resta un riposo isolato —
// capitava con periodicità irregolare, visibile chiaramente generando "Imposta riposi mesi
// successivi" su più mesi.
//
// L'unico modo per non spezzare mai una coppia è non chiedersi "che offset ha QUESTO giorno"
// ma generare le coppie IN SEQUENZA: la prossima parte sempre esattamente 7 giorni dopo la
// precedente finché non tocca ruotare (ogni CICLO_COPPIE coppie), nel qual caso la prossima
// coppia parte comunque alla prima occorrenza valida del nuovo giorno della settimana DOPO
// la fine di quella in corso — mai a metà. Una coppia, una volta iniziata, è sempre completa.

const EPOCH_LUNEDI_UTC = Date.UTC(2020, 0, 6); // lunedì 6 gennaio 2020: weekday 0 per definizione
const MS_GIORNO = 86400000;
const CICLO_COPPIE = 4; // dopo quante coppie consecutive il giorno di riposo ruota indietro di 1

function giorniEpochDaData(anno, mese, giorno) {
  return Math.round((Date.UTC(anno, mese, giorno) - EPOCH_LUNEDI_UTC) / MS_GIORNO);
}

function weekdayDaGiorniEpoch(giorniEpoch) {
  return ((giorniEpoch % 7) + 7) % 7; // l'epoch è un lunedì, quindi mod 7 dà già 0=Lun...6=Dom
}

// Genera, camminando in avanti dall'epoch, le coppie di riposo (come coppie di giorniEpoch
// [inizio, fine]) per un dato giorno-della-settimana di partenza, fino a superare
// `finoAGiornoEpoch`. Ogni coppia dista esattamente 7 giorni dalla precedente finché non tocca
// ruotare; quando tocca, la prossima coppia parte alla prima occorrenza del nuovo giorno della
// settimana successiva alla fine di quella in corso — mai in mezzo.
function generaCoppieRiposo(weekdayIniziale, finoAGiornoEpoch) {
  const coppie = [];
  let weekdayCorrente = ((weekdayIniziale % 7) + 7) % 7;
  let inizio = weekdayCorrente; // primo giorno (>= epoch) con questo weekday
  let contatore = 0;
  while (inizio <= finoAGiornoEpoch) {
    coppie.push([inizio, inizio + 1]);
    contatore++;
    if (contatore % CICLO_COPPIE === 0) {
      weekdayCorrente = ((weekdayCorrente - 1) % 7 + 7) % 7;
      let candidato = inizio + 2; // primo giorno utile dopo la fine della coppia appena generata
      while (weekdayDaGiorniEpoch(candidato) !== weekdayCorrente) candidato++;
      inizio = candidato;
    } else {
      inizio += 7;
    }
  }
  return coppie;
}

// true se il giorno indicato è uno dei due giorni della coppia di riposo di un dipendente
// rotante con questo weekday di partenza (derivato dal rotationSlot, o forzato per l'aggancio
// turnante/notturno).
function eGiornoDiRiposoRotante(weekdayIniziale, anno, mese, giorno) {
  const giornoEpoch = giorniEpochDaData(anno, mese, giorno);
  const coppie = generaCoppieRiposo(weekdayIniziale, giornoEpoch + 1);
  return coppie.some(([a, b]) => giornoEpoch === a || giornoEpoch === b);
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
// weekday di partenza (rotationSlot*2)%7. Il turnante, se rotante, riposa sempre 2 giorni della
// settimana dopo il notturno se anch'esso rotante (stesso weekday di partenza spostato di 2).
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
