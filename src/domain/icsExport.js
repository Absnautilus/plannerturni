import { TIPI_TURNO } from "../constants/shifts.js";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dataOraICS(anno, mese, giorno, ora, minuto) {
  return `${anno}${pad2(mese + 1)}${pad2(giorno)}T${pad2(ora)}${pad2(minuto)}00`;
}

function dataICS(anno, mese, giorno) {
  return `${anno}${pad2(mese + 1)}${pad2(giorno)}`;
}

function giornoSuccessivo(anno, mese, giorno) {
  const d = new Date(anno, mese, giorno + 1);
  return { anno: d.getFullYear(), mese: d.getMonth(), giorno: d.getDate() };
}

// Escaping richiesto da RFC 5545 per i campi di testo (SUMMARY, DESCRIPTION, ...).
function escapeICS(testo) {
  return String(testo)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Genera un calendario iCalendar (.ics) con i turni di un dipendente, importabile in
// Google Calendar / Outlook / Proton Calendar / Apple Calendar. Riposo (R) non genera
// eventi (sarebbe solo rumore); Ferie/Permesso diventano eventi "giornata intera";
// i turni con orario (inclusa la Notte, che attraversa la mezzanotte) diventano eventi
// con inizio/fine precisi, usando l'orario locale del turno (nessun fuso orario esplicito).
//
// eventiTurno: [{ anno, mese (0-11), giorno, code }]
export function generaICS(dipendente, eventiTurno) {
  const righe = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PlannerTurni//IT", "CALSCALE:GREGORIAN"];
  const adesso = new Date();
  const dtstamp = `${adesso.getUTCFullYear()}${pad2(adesso.getUTCMonth() + 1)}${pad2(adesso.getUTCDate())}T${pad2(adesso.getUTCHours())}${pad2(adesso.getUTCMinutes())}${pad2(adesso.getUTCSeconds())}Z`;

  eventiTurno.forEach(({ anno, mese, giorno, code }) => {
    const info = TIPI_TURNO[code];
    if (!info) return;
    const uid = `${dipendente.id}-${anno}${pad2(mese + 1)}${pad2(giorno)}-${code}@plannerturni.local`;

    if (code === "F" || code === "P") {
      const fine = giornoSuccessivo(anno, mese, giorno);
      righe.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${dataICS(anno, mese, giorno)}`,
        `DTEND;VALUE=DATE:${dataICS(fine.anno, fine.mese, fine.giorno)}`,
        `SUMMARY:${escapeICS(info.label)}`,
        "END:VEVENT"
      );
      return;
    }

    if (!info.orario) return; // Riposo (o altri codici senza orario): nessun evento

    const match = info.orario.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
    if (!match) return;
    const oraInizio = Number(match[1]);
    const minInizio = Number(match[2]);
    const oraFine = Number(match[3]);
    const minFine = Number(match[4]);

    let fine = { anno, mese, giorno };
    if (oraFine * 60 + minFine <= oraInizio * 60 + minInizio) {
      fine = giornoSuccessivo(anno, mese, giorno); // turno che attraversa la mezzanotte (es. Notte)
    }

    righe.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dataOraICS(anno, mese, giorno, oraInizio, minInizio)}`,
      `DTEND:${dataOraICS(fine.anno, fine.mese, fine.giorno, oraFine, minFine)}`,
      `SUMMARY:${escapeICS(`${code} — ${info.label}`)}`,
      "END:VEVENT"
    );
  });

  righe.push("END:VCALENDAR");
  return righe.join("\r\n");
}
