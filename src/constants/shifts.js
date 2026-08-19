export const TIPI_TURNO = {
  A1: { label: "Apertura 1", orario: "07:00-15:00", colore: "#3FA935" },
  A2: { label: "Apertura 2", orario: "08:30-16:30", colore: "#9C4FC7" },
  CE: { label: "Centrale", orario: "09:30-17:30", colore: "#E8541E" },
  C1: { label: "Chiusura 1", orario: "14:00-22:00", colore: "#F5A623" },
  C2: { label: "Chiusura 2", orario: "15:00-23:00", colore: "#EAD23C" },
  N: { label: "Notte", orario: "23:00-07:00", colore: "#E63946" },
  D1: { label: "Direzione 1", orario: "08:00-16:00*", colore: "#7B68B0" },
  D2: { label: "Direzione 2", orario: "12:00-20:00*", colore: "#9B4F68" },
  F1: { label: "FOM 1", orario: "08:00-16:00*", colore: "#3D7DCA" },
  F2: { label: "FOM 2", orario: "12:00-20:00*", colore: "#1B3A6B" },
  R: { label: "Riposo", orario: "", colore: "#9AA0A6" },
  F: { label: "Ferie", orario: "", colore: "#C9A227" },
  P: { label: "Permesso", orario: "", colore: "#6B5B95" },
  // Non sono turni di copertura: sono etichette per segnare la giornata lavorativa
  // (permessi a ore, R.O.L., flessibilità, malattia, assenze...). Stesso grigio e
  // stessa formattazione di "Riposo" — nessun orario, non vanno coperti né conteggiati
  // nell'assegnazione automatica.
  P8: { label: "Permesso 8H", orario: "", colore: "#9AA0A6" },
  P7: { label: "Permesso 7H", orario: "", colore: "#9AA0A6" },
  P6: { label: "Permesso 6H", orario: "", colore: "#9AA0A6" },
  P5: { label: "Permesso 5H", orario: "", colore: "#9AA0A6" },
  P4: { label: "Permesso 4H", orario: "", colore: "#9AA0A6" },
  P3: { label: "Permesso 3H", orario: "", colore: "#9AA0A6" },
  P2: { label: "Permesso 2H", orario: "", colore: "#9AA0A6" },
  P1: { label: "Permesso 1H", orario: "", colore: "#9AA0A6" },
  R8: { label: "R.O.L. 8H", orario: "", colore: "#9AA0A6" },
  R7: { label: "R.O.L. 7H", orario: "", colore: "#9AA0A6" },
  R6: { label: "R.O.L. 6H", orario: "", colore: "#9AA0A6" },
  R5: { label: "R.O.L. 5H", orario: "", colore: "#9AA0A6" },
  R4: { label: "R.O.L. 4H", orario: "", colore: "#9AA0A6" },
  R3: { label: "R.O.L. 3H", orario: "", colore: "#9AA0A6" },
  R2: { label: "R.O.L. 2H", orario: "", colore: "#9AA0A6" },
  R1: { label: "R.O.L. 1H", orario: "", colore: "#9AA0A6" },
  RS: { label: "Flessibilità lavorata", orario: "", colore: "#9AA0A6" },
  RR: { label: "Flessibilità goduta", orario: "", colore: "#9AA0A6" },
  AS: { label: "Assenza ingiustificata", orario: "", colore: "#9AA0A6" },
  M: { label: "Malattia", orario: "", colore: "#9AA0A6" },
  FG: { label: "Festività goduta", orario: "", colore: "#9AA0A6" },
  CON: { label: "Congedo parentale", orario: "", colore: "#9AA0A6" },
  PL: { label: "Permesso lutto", orario: "", colore: "#9AA0A6" },
};

export const CODICI_MATTINA = ["A1", "A2"];
export const CODICI_POMERIGGIO = ["C1", "C2"];

export function categoriaTurno(codice) {
  if (CODICI_MATTINA.includes(codice)) return "mattina";
  if (CODICI_POMERIGGIO.includes(codice)) return "pomeriggio";
  return null;
}

// Un turno "di copertura" (A1/A2/C1/C2/N/D1/D2/F1/F2/CE) ha sempre un orario; riposo, ferie,
// permesso e le etichette di assenza (P1-8, R1-8, RS, RR, AS, M, FG, CON, PL) no. Unica fonte
// di verità per "questo codice è un turno lavorato o solo un'etichetta sulla giornata" — usata
// sia per bilanciare l'assegnazione automatica sia per i riepiloghi "giorni lavorati".
export function eTurnoDiCopertura(codice) {
  return !!TIPI_TURNO[codice]?.orario;
}
