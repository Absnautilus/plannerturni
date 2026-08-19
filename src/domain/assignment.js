import { giornoSettimana, formattaData } from "./dates.js";
import { eRiposoPerGiorno } from "./restRotation.js";
import { eProtettoDaRigenerazione } from "./shiftGuards.js";
import { categoriaTurno } from "../constants/shifts.js";
import { turniBaseDipendente, turniExtraDipendente } from "../constants/employeeTypes.js";

function keyTurno(empId, anno, mese, giorno) {
  return `${empId}_${anno}_${mese}_${giorno}`;
}

// generateSchedule: funzione PURA (nessun accesso a React/DOM/stato globale). Riceve tutto
// l'input esplicitamente e restituisce il risultato, senza mai mutare gli oggetti in ingresso.
//
// FIX #6: se il mese è "definitivo", si rifiuta di rigenerare (difesa anche a livello di
// funzione pura, non solo di bottone disabilitato in UI: chiunque chiami questa funzione
// direttamente non può aggirare la regola).
// FIX #4: i turni "protetti" (Ferie/Permesso, oppure DNM) sopravvivono sempre al reset,
// indipendentemente dal flag DNM.
// FIX #9: i turni di base e quelli extra vengono letti da turniBaseDipendente/turniExtraDipendente
// (CE incluso come extra di ruolo per diurno/turnante), non da TIPI_DIPENDENTE inline.
// FIX #10: i dipendenti non attivi (active === false) non partecipano alla generazione: i loro
// turni esistenti restano intoccati (né cancellati né rigenerati), lo storico resta integro.
export function generateSchedule({
  dipendenti,
  turniEsistenti,
  anno,
  mese,
  numGiorni,
  coperturaRegole,
  regoleAttive,
  ordineRegolePreferenza,
  preferenze,
  statoMese = "bozza",
  random = Math.random,
}) {
  if (statoMese === "definitivo") {
    return {
      turni: turniEsistenti,
      conflitti: [
        {
          giorno: null,
          turno: null,
          messaggio: "Il mese è Definitivo: la rigenerazione automatica è bloccata. Riporta il mese a Bozza per modificarlo.",
        },
      ],
      bloccato: true,
    };
  }

  const dipendentiAttivi = dipendenti.filter((d) => d.active !== false);
  const giorniArray = Array.from({ length: numGiorni }, (_, i) => i + 1);
  const kt = (empId, giorno) => keyTurno(empId, anno, mese, giorno);

  // Reset: via tutto ciò che non è protetto, SOLO per il mese corrente e SOLO per i
  // dipendenti attivi. I turni di mesi diversi (chiavi diverse) non vengono nemmeno guardati.
  const nuoviTurni = { ...turniEsistenti };
  giorniArray.forEach((giorno) => {
    dipendentiAttivi.forEach((d) => {
      const k = kt(d.id, giorno);
      if (nuoviTurni[k] && !eProtettoDaRigenerazione(nuoviTurni[k])) {
        delete nuoviTurni[k];
      }
    });
  });

  const nuoviConflitti = [];

  // --- Passo 1: giorni di riposo ---
  // FIX #11: le coppie di riposo sono generate in sequenza continua (mai come funzione pura
  // del solo giorno): questo evita di spezzare una coppia già iniziata quando il mese cambia
  // di calendario. Vedi eRiposoPerGiorno in restRotation.js.
  giorniArray.forEach((giorno) => {
    const riposoPerId = eRiposoPerGiorno(dipendentiAttivi, anno, mese, giorno, regoleAttive.riposoTurnanteDopoNotturno);
    dipendentiAttivi.forEach((d) => {
      const k = kt(d.id, giorno);
      if (nuoviTurni[k]) return;
      if (riposoPerId[d.id]) {
        nuoviTurni[k] = { code: "R", dnm: false };
      }
    });
  });

  const conteggioSettimana = (empId, giorno, codiceTurno) => {
    const inizioSettimana = giorno - ((giorno - 1) % 7);
    const fineSettimana = Math.min(inizioSettimana + 6, numGiorni);
    let count = 0;
    for (let g = inizioSettimana; g <= fineSettimana; g++) {
      if (nuoviTurni[kt(empId, g)]?.code === codiceTurno) count++;
    }
    return count;
  };

  const conteggioTurniMese = (empId) =>
    giorniArray.filter((g) => nuoviTurni[kt(empId, g)]?.code && !["R", "F", "P"].includes(nuoviTurni[kt(empId, g)].code)).length;

  const conteggioCategoriaMese = (empId, categoria) =>
    giorniArray.filter((g) => categoriaTurno(nuoviTurni[kt(empId, g)]?.code) === categoria).length;

  const rankPreferenza = (empId, codiceTurno, giorno) => {
    const gs = giornoSettimana(anno, mese, giorno);
    const prefGiorno = preferenze[empId]?.preferenzeGiorno?.[gs];
    if (prefGiorno && prefGiorno.length > 0) {
      const i = prefGiorno.indexOf(codiceTurno);
      if (i !== -1) return i;
      return 50;
    }
    const ordine = preferenze[empId]?.ordinePreferenza;
    if (!ordine || ordine.length === 0) return 99;
    const i = ordine.indexOf(codiceTurno);
    return i === -1 ? 99 : i;
  };

  const MAPPA_SEQUENZE_PREFERIBILI = { A1: "C1", A2: "C2" };
  const violaSequenzaPreferibile = (d, codiceTurno, giorno) => {
    const turnoPrecedente = MAPPA_SEQUENZE_PREFERIBILI[codiceTurno];
    if (!turnoPrecedente) return false;
    return nuoviTurni[kt(d.id, giorno - 1)]?.code === turnoPrecedente;
  };

  const conteggioSequenzeScomodeFinora = (empId, giorno) => {
    let count = 0;
    for (let g = 1; g < giorno; g++) {
      const oggi = nuoviTurni[kt(empId, g)]?.code;
      const domani = nuoviTurni[kt(empId, g + 1)]?.code;
      if ((oggi === "C1" && domani === "A1") || (oggi === "C2" && domani === "A2")) count++;
    }
    return count;
  };

  const comparatoriPreferenza = {
    sequenzaPreferibileEvitata: (a, b, codiceTurno, giorno) => {
      const sA = violaSequenzaPreferibile(a, codiceTurno, giorno) ? 1 : 0;
      const sB = violaSequenzaPreferibile(b, codiceTurno, giorno) ? 1 : 0;
      return sA - sB;
    },
    equitaSequenzeScomode: (a, b, codiceTurno, giorno) =>
      conteggioSequenzeScomodeFinora(a.id, giorno) - conteggioSequenzeScomodeFinora(b.id, giorno),
    equilibrioMattinaPomeriggio: (a, b, codiceTurno) => {
      const categoria = categoriaTurno(codiceTurno);
      if (!categoria) return 0;
      const opposta = categoria === "mattina" ? "pomeriggio" : "mattina";
      const sbilA = conteggioCategoriaMese(a.id, categoria) - conteggioCategoriaMese(a.id, opposta);
      const sbilB = conteggioCategoriaMese(b.id, categoria) - conteggioCategoriaMese(b.id, opposta);
      return sbilA - sbilB;
    },
    variazioneSettimanale: (a, b, codiceTurno, giorno) =>
      conteggioSettimana(a.id, giorno, codiceTurno) - conteggioSettimana(b.id, giorno, codiceTurno),
    preferenzePersonali: (a, b, codiceTurno, giorno) => rankPreferenza(a.id, codiceTurno, giorno) - rankPreferenza(b.id, codiceTurno, giorno),
  };

  function ordinaCandidati(lista, codiceTurno, giorno) {
    const conRandom = lista.map((d) => ({ d, r: random() }));
    conRandom.sort((x, y) => {
      const a = x.d, b = y.d;
      if (regoleAttive.prioritaNotturno && codiceTurno === "N") {
        const rA = a.tipo === "notturno" ? 0 : 1;
        const rB = b.tipo === "notturno" ? 0 : 1;
        if (rA !== rB) return rA - rB;
      }
      for (const chiave of ordineRegolePreferenza) {
        if (!regoleAttive[chiave]) continue;
        const risultato = comparatoriPreferenza[chiave](a, b, codiceTurno, giorno);
        if (risultato !== 0) return risultato;
      }
      const balA = conteggioTurniMese(a.id);
      const balB = conteggioTurniMese(b.id);
      if (balA !== balB) return balA - balB;
      return x.r - y.r;
    });
    return conRandom.map((x) => x.d);
  }

  // --- Passo 2: assegnazione turni di copertura ---
  const ordineTurni = ["N", "C1", "C2", "A1", "A2"].filter((c) => c in coperturaRegole);
  Object.keys(coperturaRegole).forEach((c) => {
    if (!ordineTurni.includes(c)) ordineTurni.push(c);
  });

  giorniArray.forEach((giorno) => {
    ordineTurni.forEach((codiceTurno) => {
      const quantita = coperturaRegole[codiceTurno];
      const giaAssegnati = dipendentiAttivi.filter((d) => nuoviTurni[kt(d.id, giorno)]?.code === codiceTurno).length;
      let daAssegnare = quantita - giaAssegnati;
      if (daAssegnare <= 0) return;

      const libero = (d) => !nuoviTurni[kt(d.id, giorno)];
      const violaSequenza = (d) =>
        regoleAttive.sequenzaC2A1Vietata && codiceTurno === "A1" && nuoviTurni[kt(d.id, giorno - 1)]?.code === "C2";

      const violaRegolaTurnanteNotte = (d) => {
        if (!regoleAttive.prioritaNotturno || codiceTurno !== "N" || d.tipo !== "turnante") return false;
        let distanzaRiposo = null;
        for (let g = giorno; g <= numGiorni; g++) {
          if (nuoviTurni[kt(d.id, g)]?.code === "R") {
            distanzaRiposo = g - giorno;
            break;
          }
        }
        if (distanzaRiposo === null) return false;
        return distanzaRiposo > 2;
      };

      // FIX #9: base/extra letti da turniBaseDipendente/turniExtraDipendente (CE incluso qui)
      const candidatiBase = dipendentiAttivi.filter(
        (d) => turniBaseDipendente(d).includes(codiceTurno) && libero(d) && !violaSequenza(d) && !violaRegolaTurnanteNotte(d)
      );
      const candidatiRiserva = dipendentiAttivi.filter(
        (d) => turniExtraDipendente(d).includes(codiceTurno) && libero(d) && !violaSequenza(d)
      );

      const pool = [...ordinaCandidati(candidatiBase, codiceTurno, giorno), ...ordinaCandidati(candidatiRiserva, codiceTurno, giorno)];

      for (let i = 0; i < daAssegnare; i++) {
        const scelto = pool[i];
        if (scelto) {
          nuoviTurni[kt(scelto.id, giorno)] = { code: codiceTurno, dnm: false };
        } else {
          nuoviConflitti.push({
            giorno,
            turno: codiceTurno,
            messaggio: `Giorno ${formattaData(giorno, mese, anno)}: nessun dipendente disponibile per ${codiceTurno} (${quantita - daAssegnare}/${quantita} coperti). Slot lasciato vuoto.`,
          });
        }
      }
    });
  });

  // --- Passo 3: Direttore (D1/D2) e FOM (F1/F2) ---
  function assegnaAlternanza(dipendente, coppia) {
    if (!dipendente) return;
    giorniArray.forEach((giorno) => {
      const k = kt(dipendente.id, giorno);
      if (nuoviTurni[k]) return;
      const conteggi = coppia.map((codice) => conteggioSettimana(dipendente.id, giorno, codice));
      let scelto;
      if (conteggi[0] === conteggi[1]) {
        scelto = coppia[random() < 0.5 ? 0 : 1];
      } else {
        scelto = conteggi[0] < conteggi[1] ? coppia[0] : coppia[1];
      }
      nuoviTurni[k] = { code: scelto, dnm: false };
    });
  }
  const direttore = dipendentiAttivi.find((d) => d.tipo === "direttore");
  const fom = dipendentiAttivi.find((d) => d.tipo === "fom");
  if (regoleAttive.direttoreD1D2Auto) assegnaAlternanza(direttore, ["D1", "D2"]);
  if (regoleAttive.fomF1F2Auto) assegnaAlternanza(fom, ["F1", "F2"]);

  // --- Passo 4: CE come opzione di riserva ---
  if (regoleAttive.ceAutomatico) {
    dipendentiAttivi.forEach((d) => {
      if (d.tipo !== "diurno" && d.tipo !== "turnante") return;
      giorniArray.forEach((giorno) => {
        const k = kt(d.id, giorno);
        if (!nuoviTurni[k]) {
          nuoviTurni[k] = { code: "CE", dnm: false };
        }
      });
    });
  }

  return { turni: nuoviTurni, conflitti: nuoviConflitti, bloccato: false };
}
