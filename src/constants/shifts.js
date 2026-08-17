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
};

export const CODICI_MATTINA = ["A1", "A2"];
export const CODICI_POMERIGGIO = ["C1", "C2"];

export function categoriaTurno(codice) {
  if (CODICI_MATTINA.includes(codice)) return "mattina";
  if (CODICI_POMERIGGIO.includes(codice)) return "pomeriggio";
  return null;
}
