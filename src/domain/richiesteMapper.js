// Converte tra le colonne snake_case delle tabelle richieste_* di Supabase e la forma
// camelCase usata nel resto dell'app (risalente a quando le richieste erano solo array
// locali in memoria, con id generati da Date.now()). L'id ora è quello vero generato dal
// database (bigint identity): rigaDa*() non lo include mai nel payload di scrittura.

export function swapDaRiga(riga) {
  return {
    id: riga.id,
    daEmpId: riga.da_profile_id,
    aEmpId: riga.a_profile_id,
    annoDa: riga.anno_da,
    meseDa: riga.mese_da,
    giornoDa: riga.giorno_da,
    annoA: riga.anno_a,
    meseA: riga.mese_a,
    giornoA: riga.giorno_a,
    turnoDa: riga.turno_da,
    turnoA: riga.turno_a,
    stato: riga.stato,
    notaSistema: riga.nota_sistema,
    motivoRifiuto: riga.motivo_rifiuto,
  };
}

export function rigaDaSwap(patch) {
  const mappa = {
    daEmpId: "da_profile_id",
    aEmpId: "a_profile_id",
    annoDa: "anno_da",
    meseDa: "mese_da",
    giornoDa: "giorno_da",
    annoA: "anno_a",
    meseA: "mese_a",
    giornoA: "giorno_a",
    turnoDa: "turno_da",
    turnoA: "turno_a",
    stato: "stato",
    notaSistema: "nota_sistema",
    motivoRifiuto: "motivo_rifiuto",
  };
  const riga = {};
  Object.entries(patch).forEach(([chiave, valore]) => {
    if (mappa[chiave]) riga[mappa[chiave]] = valore;
  });
  return riga;
}

export function assenzaDaRiga(riga) {
  return {
    id: riga.id,
    empId: riga.profile_id,
    giorno: riga.giorno,
    anno: riga.anno,
    mese: riga.mese,
    tipo: riga.tipo,
    turnoInteressato: riga.turno_interessato,
    nota: riga.nota,
    ore: riga.ore,
    oraInizio: riga.ora_inizio,
    oraFine: riga.ora_fine,
    stato: riga.stato,
    motivoRifiuto: riga.motivo_rifiuto,
  };
}

export function rigaDaAssenza(patch) {
  const mappa = {
    empId: "profile_id",
    giorno: "giorno",
    anno: "anno",
    mese: "mese",
    tipo: "tipo",
    turnoInteressato: "turno_interessato",
    nota: "nota",
    ore: "ore",
    oraInizio: "ora_inizio",
    oraFine: "ora_fine",
    stato: "stato",
    motivoRifiuto: "motivo_rifiuto",
  };
  const riga = {};
  Object.entries(patch).forEach(([chiave, valore]) => {
    if (mappa[chiave]) riga[mappa[chiave]] = valore;
  });
  return riga;
}

export function preassegnazioneDaRiga(riga) {
  return {
    id: riga.id,
    empId: riga.profile_id,
    giorno: riga.giorno,
    anno: riga.anno,
    mese: riga.mese,
    turno: riga.turno,
    nota: riga.nota,
    stato: riga.stato,
    motivoRifiuto: riga.motivo_rifiuto,
  };
}

export function rigaDaPreassegnazione(patch) {
  const mappa = {
    empId: "profile_id",
    giorno: "giorno",
    anno: "anno",
    mese: "mese",
    turno: "turno",
    nota: "nota",
    stato: "stato",
    motivoRifiuto: "motivo_rifiuto",
  };
  const riga = {};
  Object.entries(patch).forEach(([chiave, valore]) => {
    if (mappa[chiave]) riga[mappa[chiave]] = valore;
  });
  return riga;
}
