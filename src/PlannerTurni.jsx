import React, { useState, useMemo, useEffect, useRef } from "react";
import { TIPI_TURNO, CODICI_MATTINA, CODICI_POMERIGGIO, categoriaTurno } from "./constants/shifts.js";
import { TIPI_DIPENDENTE, turniAmmessiDipendente } from "./constants/employeeTypes.js";
import {
  GIORNI_SETTIMANA,
  giorniDelMese,
  giornoSettimana,
  nomeGiorno,
  eWeekend,
  formattaData,
  giornoPrecedente,
  meseSuccessivo,
  mesePrecedente,
} from "./domain/dates.js";
import { calcolaOffsetRiposoPerMese, prossimoRotationSlotLibero } from "./domain/restRotation.js";
import { canModifyShift, eProtettoDaRigenerazione } from "./domain/shiftGuards.js";
import { generateSchedule } from "./domain/assignment.js";
import {
  STATI_SWAP,
  accettaDaCollega,
  rifiutaDaCollega,
  approvaAdmin as approvaSwapAdmin,
  rifiutaAdmin as rifiutaSwapAdmin,
  applicaScambio,
} from "./domain/swapWorkflow.js";
import { puoEliminareDefinitivamente, disattivaDipendente, attivaDipendente } from "./domain/employeeLifecycle.js";
import { generaICS } from "./domain/icsExport.js";
import { profiloDaRiga, rigaDaProfiloParziale } from "./domain/profiliMapper.js";
import {
  swapDaRiga,
  rigaDaSwap,
  assenzaDaRiga,
  rigaDaAssenza,
  preassegnazioneDaRiga,
  rigaDaPreassegnazione,
} from "./domain/richiesteMapper.js";
import { supabase, RESTA_CONNESSO_KEY, ULTIMA_ATTIVITA_KEY } from "./lib/supabaseClient.js";
import logoPlannerTurni from "./assets/logo-planner-turni.png";
import logoIcona from "./assets/logo-icon.png";

// ---------- Font + stile globale (hover/focus/interazioni) ----------

const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap');

  html, body {
    overflow-x: hidden;
  }
  .planner-turni-app,
  .planner-turni-app *,
  .planner-turni-app *::before,
  .planner-turni-app *::after {
    box-sizing: border-box;
  }
  .ptn-nav-scroll {
    scrollbar-width: none;
  }
  .ptn-nav-scroll::-webkit-scrollbar {
    display: none;
  }
  .planner-turni-app button:not(:disabled) {
    transition: filter 0.12s ease, transform 0.05s ease;
  }
  .planner-turni-app button:not(:disabled):hover {
    filter: brightness(0.93);
  }
  .planner-turni-app button:not(:disabled):active {
    transform: translateY(1px);
  }
  .planner-turni-app button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .planner-turni-app select,
  .planner-turni-app input {
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .planner-turni-app select:hover,
  .planner-turni-app input:hover {
    border-color: #A9825A;
  }
  .planner-turni-app select:focus,
  .planner-turni-app input:focus {
    outline: none;
    border-color: #1F6F78;
    box-shadow: 0 0 0 3px rgba(31, 111, 120, 0.12);
  }
  .planner-turni-app tbody tr:hover td {
    background: rgba(31, 111, 120, 0.035);
  }
  .planner-turni-app td.cella-turno-editabile:hover {
    filter: brightness(0.9);
    cursor: pointer;
  }
  .planner-turni-app ::selection {
    background: rgba(31, 111, 120, 0.2);
  }
`;

// ---------- Design tokens ----------

const COLORI = {
  inkDark: "#16182B",       // pillola nav scura
  ink: "#1C1E2E",
  muted: "#8A8FA3",
  mist: "#EAECF9",          // sfondo pagina lavanda tenue
  card: "#FFFFFF",
  hairline: "#EDEFF7",
  hairlineForte: "#DCDFF0",
  teal: "#1C1E2E",          // pulsante primario = pillola scura, coerente con la nav
  tealScuro: "#000000",
  ottone: "#9C4FC7",
  ottoneScuro: "#7B3B9E",
  selezione: "#4C8DF0",
  bozzaBg: "#FFF1D6",
  bozzaTesto: "#8A6416",
  definitivoBg: "#DFF6E8",
  definitivoTesto: "#1E7A46",
  avvisoBg: "#FDE8E8",
  avvisoBordo: "#F3B9B9",
  avvisoTesto: "#B23A3A",
};

// Restituisce il testo (bianco o quasi-nero) più leggibile su uno sfondo del colore indicato
function testoContrastante(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const luminanza = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminanza > 0.62 ? "#1C1E2E" : "#FFFFFF";
}


const COLORI_DIPENDENTE = [
  "#8A6A3A", "#6B5B78", "#2E6B78", "#5C7A5E", "#7A5C4A",
  "#4A6670", "#9A7B4E", "#5E6B4A", "#6B4E5E", "#2A2E3A",
];

const MESI_NOMI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const COPERTURA_DEFAULT = { C1: 1, C2: 1, A1: 1, A2: 1, N: 1 };

// Quote annue di default (bozza: valori indicativi, da confermare/rendere modificabili in seguito)
const QUOTA_FERIE_DEFAULT = 26; // giorni
const QUOTA_PERMESSI_ORE_DEFAULT = 88; // ore

// Converte un colore esadecimale in rgba con l'opacità indicata (per sfondi tenui dei badge)
function hexRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Persistenza locale (Fase C rimanda a Supabase, ma nel frattempo lo stato non deve
// perdersi a ogni refresh): un unico blob in localStorage con tutti i dati modificabili
// dall'utente (dipendenti, turni, richieste, regole). Stato solo-UI (tab attiva, sessione
// di login, mese visualizzato) resta volutamente fuori e non viene persistito.
const STORAGE_KEY = "planner-turni-stato-v1";

function caricaStatoSalvato() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// La chiave del turno include anno e mese: così l'assegnazione (manuale o automatica)
// di un mese non si sovrappone mai con quella di un altro mese.
function keyTurno(empId, anno, mese, giorno) {
  return `${empId}_${anno}_${mese}_${giorno}`;
}

// Le API push del browser vogliono la chiave VAPID come Uint8Array, non come stringa:
// conversione standard da base64url (usata ovunque nelle guide Web Push).
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Risale dagli antenati DOM di un elemento cercando il primo che scorre orizzontalmente
// (es. la tabella del calendario, più larga dello schermo su mobile): serve allo swipe
// cambia-tab per non "rubare" il gesto a chi sta scorrendo la tabella lateralmente.
function trovaAntenatoScrollabileOrizzontale(elemento) {
  let el = elemento;
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = window.getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return el;
    }
    el = el.parentElement;
  }
  return null;
}

// Genera le celle del calendario per un mese (settimane complete, Lun-Dom), includendo
// i giorni "di contorno" del mese precedente/successivo per riempire la griglia.
function generaGrigliaMese(anno, mese) {
  const numGiorni = giorniDelMese(anno, mese);
  const primoOffset = giornoSettimana(anno, mese, 1); // 0 = Lun
  const celle = [];

  const mesePrec = mese === 0 ? 11 : mese - 1;
  const annoPrec = mese === 0 ? anno - 1 : anno;
  const giorniPrec = giorniDelMese(annoPrec, mesePrec);
  for (let i = primoOffset - 1; i >= 0; i--) {
    celle.push({ anno: annoPrec, mese: mesePrec, giorno: giorniPrec - i, fuoriMese: true });
  }
  for (let g = 1; g <= numGiorni; g++) {
    celle.push({ anno, mese, giorno: g, fuoriMese: false });
  }
  const meseSucc = mese === 11 ? 0 : mese + 1;
  const annoSucc = mese === 11 ? anno + 1 : anno;
  let gSucc = 1;
  while (celle.length % 7 !== 0) {
    celle.push({ anno: annoSucc, mese: meseSucc, giorno: gSucc++, fuoriMese: true });
  }
  return celle;
}

// Deriva le notifiche dell'utente corrente dagli esiti/richieste già presenti nello stato
// (nessun log a parte): per il richiedente, l'esito di cambi/ferie/pre-assegnazioni; per
// l'admin, le richieste ancora in sospeso che aspettano una sua decisione. L'id di ogni
// notifica include lo stato ("swap-12-applicata") così che un nuovo esito per la stessa
// richiesta risulti una notifica nuova, anche se quella precedente era già stata letta.
function calcolaNotifiche({ empCorrente, isAdmin, richiesteSwap, richiesteAssenza, richiestePreassegnazione, dipendenti }) {
  if (!empCorrente) return [];
  const nome = (id) => {
    const d = dipendenti.find((x) => x.id === id);
    return d ? `${d.nome} ${d.cognome}` : "un collega";
  };
  const elenco = [];

  richiesteSwap.forEach((r) => {
    const quando = formattaData(r.giornoDa, r.meseDa, r.annoDa);
    if (r.daEmpId === empCorrente.id) {
      if (r.stato === STATI_SWAP.APPLICATA) {
        elenco.push({ id: `swap-${r.id}-${r.stato}`, ordine: r.id, positivo: true, testo: `Cambio turno con ${nome(r.aEmpId)} accettato — ${quando}.` });
      } else if (r.stato === STATI_SWAP.RIFIUTATA_COLLEGA) {
        elenco.push({ id: `swap-${r.id}-${r.stato}`, ordine: r.id, positivo: false, testo: `${nome(r.aEmpId)} ha rifiutato il cambio turno del ${quando}.` });
      } else if (r.stato === STATI_SWAP.RIFIUTATA_ADMIN) {
        elenco.push({ id: `swap-${r.id}-${r.stato}`, ordine: r.id, positivo: false, testo: `L'admin ha rifiutato il cambio turno con ${nome(r.aEmpId)} del ${quando}.` });
      }
    }
    if (r.aEmpId === empCorrente.id && r.stato === STATI_SWAP.IN_ATTESA_COLLEGA) {
      elenco.push({ id: `swap-${r.id}-${r.stato}`, ordine: r.id, positivo: null, testo: `${nome(r.daEmpId)} ti ha proposto un cambio turno — ${quando}.` });
    }
    if (isAdmin && r.stato === STATI_SWAP.IN_ATTESA_ADMIN) {
      elenco.push({ id: `swap-${r.id}-${r.stato}`, ordine: r.id, positivo: null, testo: `Cambio turno tra ${nome(r.daEmpId)} e ${nome(r.aEmpId)} in attesa della tua approvazione.` });
    }
  });

  richiesteAssenza.forEach((r) => {
    const tipoLabel = r.tipo === "F" ? "Ferie" : "Permesso";
    const quando = formattaData(r.giorno, r.mese, r.anno);
    if (r.empId === empCorrente.id) {
      if (r.stato === "approvata") {
        elenco.push({ id: `assenza-${r.id}-${r.stato}`, ordine: r.id, positivo: true, testo: `${tipoLabel} approvate per il ${quando}.` });
      } else if (r.stato === "rifiutata") {
        elenco.push({ id: `assenza-${r.id}-${r.stato}`, ordine: r.id, positivo: false, testo: `${tipoLabel} rifiutate per il ${quando}.` });
      }
    }
    if (isAdmin && r.stato === "in sospeso") {
      elenco.push({ id: `assenza-${r.id}-${r.stato}`, ordine: r.id, positivo: null, testo: `${nome(r.empId)} ha richiesto ${tipoLabel.toLowerCase()} per il ${quando}.` });
    }
  });

  richiestePreassegnazione.forEach((r) => {
    const quando = formattaData(r.giorno, r.mese, r.anno);
    if (r.empId === empCorrente.id && !isAdmin) {
      if (r.stato === "approvata") {
        elenco.push({ id: `preassegnazione-${r.id}-${r.stato}`, ordine: r.id, positivo: true, testo: `Pre-assegnazione approvata per il ${quando}.` });
      } else if (r.stato === "rifiutata") {
        elenco.push({ id: `preassegnazione-${r.id}-${r.stato}`, ordine: r.id, positivo: false, testo: `Pre-assegnazione rifiutata per il ${quando}.` });
      }
    }
    if (isAdmin && r.stato === "in sospeso") {
      elenco.push({ id: `preassegnazione-${r.id}-${r.stato}`, ordine: r.id, positivo: null, testo: `${nome(r.empId)} ha richiesto una pre-assegnazione per il ${quando}.` });
    }
  });

  return elenco.sort((a, b) => b.ordine - a.ordine);
}

// ---------- Componente principale ----------

export default function PlannerTurni() {
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth());

  // Breakpoint mobile: pilota gli aggiustamenti di layout (padding, font-size) che
  // non si possono esprimere solo con flexWrap, dato che gli stili sono inline.
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const aggiorna = () => setIsMobile(mql.matches);
    aggiorna();
    mql.addEventListener("change", aggiorna);
    return () => mql.removeEventListener("change", aggiorna);
  }, []);

  const statoSalvato = useMemo(() => caricaStatoSalvato(), []);

  // I dipendenti ora vivono in Supabase (tabella `profiles`, condivisa tra tutti i
  // dispositivi), non più in localStorage: caricati dopo il login, vedi l'effetto di
  // autenticazione più sotto.
  const [dipendenti, setDipendenti] = useState([]);
  // Turni e stato bozza/definitivo vivono in Supabase (tabelle `turni` e `stato_mese`,
  // condivise tra tutta la squadra): caricati dopo il login insieme ai profili, vedi
  // caricaTurniEStato() nell'effetto di autenticazione più sotto. Non partono più da
  // localStorage, che è per dispositivo e non li terrebbe sincronizzati tra colleghi.
  const [statoPerMese, setStatoPerMese] = useState({}); // { "anno_mese": "bozza" | "definitivo" }
  const chiaveMese = `${anno}_${mese}`;
  const statoMese = statoPerMese[chiaveMese] ?? "bozza";
  async function toggleStatoMese() {
    const nuovoStato = statoMese === "bozza" ? "definitivo" : "bozza";
    setStatoPerMese((prev) => ({ ...prev, [chiaveMese]: nuovoStato }));
    if (supabase) {
      const { error } = await supabase.from("stato_mese").upsert({ anno, mese, stato: nuovoStato });
      if (error) {
        console.error("Errore salvataggio stato mese:", error);
        alert(`Errore nel salvare lo stato del mese: ${error.message}`);
      }
    }
  }
  const [turni, setTurni] = useState({}); // { "empId_anno_mese_giorno": { code, dnm } }
  // Ultima "fotografia" di `turni` così come salvata su Supabase: usata da salvaTurni()
  // per capire cosa scrivere/eliminare senza rimandare giù l'intera tabella a ogni salvataggio.
  const turniSincronizzatiRef = useRef({});
  const [salvandoTurni, setSalvandoTurni] = useState(false);
  const [coperturaRegole, setCoperturaRegole] = useState(statoSalvato.coperturaRegole ?? COPERTURA_DEFAULT);
  const [preferenze, setPreferenze] = useState(statoSalvato.preferenze ?? {});
  // Richieste swap/assenza/pre-assegnazione vivono in Supabase (condivise tra tutta la
  // squadra, con id generati dal database): caricate dopo il login, vedi ricaricaRichieste()
  // nell'effetto di autenticazione più sotto. Non partono più da localStorage.
  const [richiesteSwap, setRichiesteSwap] = useState([]);
  const [richiesteAssenza, setRichiesteAssenza] = useState([]);
  const [richiestePreassegnazione, setRichiestePreassegnazione] = useState([]);
  const [conflitti, setConflitti] = useState(statoSalvato.conflitti ?? []);
  // { [empId]: [idNotifica, ...] } — quali notifiche ha già visto ciascun utente.
  const [notificheLette, setNotificheLette] = useState(statoSalvato.notificheLette ?? {});
  const [pannelloNotificheAperto, setPannelloNotificheAperto] = useState(false);

  const [utenteLoggato, setUtenteLoggato] = useState(null); // { id, isAdmin, email }
  const [sessionePronta, setSessionePronta] = useState(false); // true dopo il primo controllo sessione Supabase
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginErrore, setLoginErrore] = useState("");
  const [restaConnesso, setRestaConnesso] = useState(true);
  const [modalitaRecupero, setModalitaRecupero] = useState(false); // mostra il form "PIN dimenticato"
  const [emailRecupero, setEmailRecupero] = useState("");
  const [messaggioRecupero, setMessaggioRecupero] = useState("");
  const [recuperoInCorso, setRecuperoInCorso] = useState(false);
  // true quando l'utente è arrivato qui dal link "reimposta PIN" ricevuto via email:
  // in quel caso, invece della app normale, mostriamo solo il modulo per scegliere
  // il nuovo PIN (vedi l'evento PASSWORD_RECOVERY nell'effetto di autenticazione).
  const [impostaNuovoPinDopoRecupero, setImpostaNuovoPinDopoRecupero] = useState(false);
  const [nuovoPinRecupero, setNuovoPinRecupero] = useState("");
  const [messaggioNuovoPinRecupero, setMessaggioNuovoPinRecupero] = useState("");
  const [pannelloAccountAperto, setPannelloAccountAperto] = useState(false);
  const [menuAvatarAperto, setMenuAvatarAperto] = useState(false);
  const [nuovaEmailAccount, setNuovaEmailAccount] = useState("");
  const [nuovoPinAccount, setNuovoPinAccount] = useState("");
  const [messaggioAccount, setMessaggioAccount] = useState("");
  const [notifichePushAttive, setNotifichePushAttive] = useState(false);
  const [notifichePushCaricamento, setNotifichePushCaricamento] = useState(false);

  const [tab, setTab] = useState("calendario");
  const [cellaSelezionata, setCellaSelezionata] = useState(null); // { empId, giorno }
  // Su mobile la colonna "Dipendente" del calendario mostra solo l'avatar per lasciare più
  // spazio ai giorni: il nome compare solo per le righe qui dentro, toccando l'avatar per
  // aprirlo/richiuderlo. Nessun effetto su desktop, dove il nome è sempre visibile.
  const [righeCalendarioEspanse, setRigheCalendarioEspanse] = useState(() => new Set());
  function toggleRigaCalendarioEspansa(empId) {
    setRigheCalendarioEspanse((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  }
  const [nuovoCodiceRegola, setNuovoCodiceRegola] = useState("");
  const [meseMiei, setMeseMiei] = useState(oggi.getMonth());
  const [annoMiei, setAnnoMiei] = useState(oggi.getFullYear());
  const [nuovaQuantitaRegola, setNuovaQuantitaRegola] = useState(1);

  // Regole assolute e di preferenza: attivabili/disattivabili dall'admin, effettivamente
  // collegate all'algoritmo di assegnazione automatica (non solo testo informativo).
  const [regoleAttive, setRegoleAttive] = useState(statoSalvato.regoleAttive ?? {
    // assolute
    sequenzaC2A1Vietata: true,
    prioritaNotturno: true,
    riposoTurnanteDopoNotturno: true,
    direttoreD1D2Auto: true,
    fomF1F2Auto: true,
    ceAutomatico: true,
    // preferenza
    sequenzaPreferibileEvitata: true,
    equitaSequenzeScomode: true,
    equilibrioMattinaPomeriggio: true,
    variazioneSettimanale: true,
    preferenzePersonali: true,
  });

  function toggleRegola(chiave) {
    setRegoleAttive((prev) => ({ ...prev, [chiave]: !prev[chiave] }));
  }

  // Ordine di priorità delle regole di preferenza: sono criteri usati in sequenza per scegliere
  // tra più candidati validi (a differenza delle regole assolute, che sono vincoli indipendenti
  // e non hanno un ordine che ne cambia l'effetto). Spostabile dall'admin in "Regole copertura".
  // L'equilibrio mattina/pomeriggio va per primo: è il criterio con l'impatto più ampio e
  // sistemico sulla distribuzione del mese; se un criterio più "di dettaglio" come l'equità
  // sulle sequenze scomode venisse controllato prima, deciderebbe la maggior parte dei casi
  // per conto suo e impedirebbe all'equilibrio mattina/pomeriggio di correggere davvero chi si
  // è specializzato su una sola categoria di turno.
  const [ordineRegolePreferenza, setOrdineRegolePreferenza] = useState(statoSalvato.ordineRegolePreferenza ?? [
    "equilibrioMattinaPomeriggio",
    "sequenzaPreferibileEvitata",
    "equitaSequenzeScomode",
    "variazioneSettimanale",
    "preferenzePersonali",
  ]);

  function spostaRegolaPreferenza(chiave, direzione) {
    setOrdineRegolePreferenza((prev) => {
      const indice = prev.indexOf(chiave);
      const target = indice + direzione;
      if (target < 0 || target >= prev.length) return prev;
      const nuovo = [...prev];
      [nuovo[indice], nuovo[target]] = [nuovo[target], nuovo[indice]];
      return nuovo;
    });
  }

  // Salva su localStorage a ogni modifica dei dati (non dello stato di sola UI). Dipendenti,
  // turni, stato bozza/definitivo e le richieste (swap/assenza/pre-assegnazione) non sono
  // più qui: vivono in Supabase (vedi l'effetto di autenticazione).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        coperturaRegole,
        preferenze,
        conflitti,
        regoleAttive,
        ordineRegolePreferenza,
        notificheLette,
      }));
    } catch {
      // storage non disponibile (es. modalità privata/quota esaurita): l'app resta usabile in memoria
    }
  }, [coperturaRegole, preferenze, conflitti, regoleAttive, ordineRegolePreferenza, notificheLette]);

  // ---------- Autenticazione (Supabase) ----------

  // Carica tutti i profili (condivisi tra tutta la squadra: servono per il calendario,
  // per le liste "con chi vuoi scambiare", ecc.) e li mappa nella forma camelCase usata
  // dal resto dell'app.
  async function ricaricaDipendenti() {
    const { data, error } = await supabase.from("profiles").select("*").order("ordine", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
    if (error) {
      console.error("Errore caricamento profili:", error);
      return [];
    }
    const profili = data.map(profiloDaRiga);
    setDipendenti(profili);
    return profili;
  }

  // Carica turni e stato bozza/definitivo (condivisi tra tutta la squadra) da Supabase.
  // `turniSincronizzatiRef` tiene la "fotografia" di ciò che risulta scritto sul database,
  // così salvaTurni() può poi calcolare solo la differenza da scrivere/eliminare.
  async function caricaTurniEStato() {
    const [{ data: righeTurni, error: erroreTurni }, { data: righeStato, error: erroreStato }] = await Promise.all([
      supabase.from("turni").select("*"),
      supabase.from("stato_mese").select("*"),
    ]);
    if (erroreTurni) console.error("Errore caricamento turni:", erroreTurni);
    if (erroreStato) console.error("Errore caricamento stato mese:", erroreStato);
    const turniCaricati = {};
    (righeTurni ?? []).forEach((r) => {
      turniCaricati[keyTurno(r.profile_id, r.anno, r.mese, r.giorno)] = { code: r.code, dnm: r.dnm };
    });
    const statoCaricato = {};
    (righeStato ?? []).forEach((r) => {
      statoCaricato[`${r.anno}_${r.mese}`] = r.stato;
    });
    setTurni(turniCaricati);
    setStatoPerMese(statoCaricato);
    turniSincronizzatiRef.current = turniCaricati;
  }

  // Carica le tre liste di richieste (swap, assenza, pre-assegnazione) da Supabase: sono
  // condivise tra tutta la squadra, quindi vanno ricaricate dopo ogni scrittura (non c'è
  // sottoscrizione realtime) per riflettere anche le azioni fatte da altri utenti.
  async function ricaricaRichieste() {
    const [
      { data: righeSwap, error: erroreSwap },
      { data: righeAssenza, error: erroreAssenza },
      { data: righePreassegnazione, error: errorePreassegnazione },
    ] = await Promise.all([
      supabase.from("richieste_swap").select("*").order("created_at", { ascending: true }),
      supabase.from("richieste_assenza").select("*").order("created_at", { ascending: true }),
      supabase.from("richieste_preassegnazione").select("*").order("created_at", { ascending: true }),
    ]);
    if (erroreSwap) console.error("Errore caricamento richieste swap:", erroreSwap);
    if (erroreAssenza) console.error("Errore caricamento richieste assenza:", erroreAssenza);
    if (errorePreassegnazione) console.error("Errore caricamento richieste pre-assegnazione:", errorePreassegnazione);
    setRichiesteSwap((righeSwap ?? []).map(swapDaRiga));
    setRichiesteAssenza((righeAssenza ?? []).map(assenzaDaRiga));
    setRichiestePreassegnazione((righePreassegnazione ?? []).map(preassegnazioneDaRiga));
  }

  useEffect(() => {
    if (!supabase) {
      setSessionePronta(true);
      return;
    }
    const { data: sottoscrizione } = supabase.auth.onAuthStateChange(async (evento, sessione) => {
      // Arrivati qui dal link "Password dimenticata" ricevuto via email: prima di
      // lasciare entrare nella app, blocchiamo su una schermata che chiede il nuovo PIN.
      if (evento === "PASSWORD_RECOVERY") {
        setImpostaNuovoPinDopoRecupero(true);
      }
      if (sessione?.user) {
        // "Resta connesso" tiene la sessione viva (Supabase da solo non la farebbe scadere
        // da sola), ma solo finché l'app viene davvero riaperta: se sono passate più di 24
        // ore dall'ultimo uso reale, la sessione va comunque chiusa qui, prima di caricare
        // qualunque dato. Non riguarda chi non ha spuntato "Resta connesso": in quel caso la
        // sessione vive in sessionStorage e sparisce da sola chiudendo scheda/browser.
        const restaConnessoAttivo = localStorage.getItem(RESTA_CONNESSO_KEY) !== "false";
        const ultimaAttivita = Number(localStorage.getItem(ULTIMA_ATTIVITA_KEY) || 0);
        const inattivoOltre24Ore = restaConnessoAttivo && ultimaAttivita > 0 && Date.now() - ultimaAttivita > 24 * 60 * 60 * 1000;
        if (inattivoOltre24Ore) {
          localStorage.removeItem(ULTIMA_ATTIVITA_KEY);
          await supabase.auth.signOut();
          setSessionePronta(true);
          return;
        }
        localStorage.setItem(ULTIMA_ATTIVITA_KEY, String(Date.now()));
        const profili = await ricaricaDipendenti();
        await caricaTurniEStato();
        await ricaricaRichieste();
        const mio = profili.find((p) => p.id === sessione.user.id);
        setUtenteLoggato({ id: sessione.user.id, isAdmin: !!mio?.isAdmin, email: sessione.user.email });
      } else {
        setUtenteLoggato(null);
        setDipendenti([]);
        setTurni({});
        setStatoPerMese({});
        turniSincronizzatiRef.current = {};
        setRichiesteSwap([]);
        setRichiesteAssenza([]);
        setRichiestePreassegnazione([]);
      }
      setSessionePronta(true);
    });
    return () => sottoscrizione.subscription.unsubscribe();
  }, []);

  // Specchi in ref di stato che cambia spesso (tab, turni): servono all'effetto di
  // aggiornamento in background qui sotto per leggere sempre il valore più recente senza
  // dover ricreare l'intervallo/i listener a ogni render (che dipendessero da `tab`/`turni`).
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  const turniRef = useRef(turni);
  useEffect(() => {
    turniRef.current = turni;
  }, [turni]);

  // Aggiorna in background dipendenti, turni/stato mese e richieste: così due persone che
  // usano l'app nello stesso momento si vedono i cambiamenti a vicenda senza dover ricaricare
  // la pagina a mano. Non tocca MAI una modifica non ancora salvata: salta `turni` se ci sono
  // celle modificate ma non ancora premuto "Salva turni" (confronto per contenuto, non per
  // riferimento — sincronizzaTurnoSingolo crea sempre nuovi oggetti anche quando il contenuto
  // coincide), e salta `dipendenti` mentre si è sulla scheda Dipendenti (dove potrebbe esserci
  // una riga in modifica non ancora salvata).
  useEffect(() => {
    if (!supabase || !utenteLoggato) return;
    let inCorso = false;
    async function aggiornaInBackground() {
      if (inCorso) return;
      inCorso = true;
      try {
        // Ogni aggiornamento in background parte solo perché l'app è davvero aperta e in uso
        // (tick periodico, o ritorno di focus/visibilità): è il segnale di attività che tiene
        // viva la finestra di 24 ore di "Resta connesso" (vedi il controllo nell'effetto di
        // autenticazione più sopra).
        if (localStorage.getItem(RESTA_CONNESSO_KEY) !== "false") {
          localStorage.setItem(ULTIMA_ATTIVITA_KEY, String(Date.now()));
        }
        if (tabRef.current !== "dipendenti") await ricaricaDipendenti();
        if (JSON.stringify(turniRef.current) === JSON.stringify(turniSincronizzatiRef.current)) {
          await caricaTurniEStato();
        }
        await ricaricaRichieste();
      } finally {
        inCorso = false;
      }
    }
    const intervallo = setInterval(aggiornaInBackground, 60000);
    function alCambioVisibilita() {
      if (document.visibilityState === "visible") aggiornaInBackground();
    }
    document.addEventListener("visibilitychange", alCambioVisibilita);
    window.addEventListener("focus", aggiornaInBackground);
    return () => {
      clearInterval(intervallo);
      document.removeEventListener("visibilitychange", alCambioVisibilita);
      window.removeEventListener("focus", aggiornaInBackground);
    };
  }, [utenteLoggato]);

  // Calcola cosa cambiare su Supabase (upsert per le celle nuove/modificate, delete per
  // quelle rimosse) confrontando lo stato attuale con l'ultima fotografia sincronizzata,
  // invece di riscrivere sempre l'intera tabella. Admin-only: è l'unico punto in cui le
  // modifiche fatte sul calendario (assegnazioni manuali, cambi, approvazioni…) diventano
  // visibili agli altri utenti — prima restavano solo nel browser di chi le aveva fatte.
  async function salvaTurni() {
    if (!supabase) return;
    setSalvandoTurni(true);
    const precedenti = turniSincronizzatiRef.current;
    const daScrivere = [];
    Object.entries(turni).forEach(([key, valore]) => {
      const precedente = precedenti[key];
      if (!precedente || precedente.code !== valore.code || !!precedente.dnm !== !!valore.dnm) {
        const [empId, annoK, meseK, giornoK] = key.split("_");
        daScrivere.push({
          profile_id: empId,
          anno: Number(annoK),
          mese: Number(meseK),
          giorno: Number(giornoK),
          code: valore.code,
          dnm: !!valore.dnm,
        });
      }
    });
    const daEliminare = Object.keys(precedenti).filter((key) => !turni[key]);

    if (daScrivere.length > 0) {
      const { error } = await supabase.from("turni").upsert(daScrivere, { onConflict: "profile_id,anno,mese,giorno" });
      if (error) {
        setSalvandoTurni(false);
        alert(`Errore nel salvare i turni: ${error.message}`);
        return;
      }
    }
    for (const key of daEliminare) {
      const [empId, annoK, meseK, giornoK] = key.split("_");
      const { error } = await supabase
        .from("turni")
        .delete()
        .match({ profile_id: empId, anno: Number(annoK), mese: Number(meseK), giorno: Number(giornoK) });
      if (error) {
        setSalvandoTurni(false);
        alert(`Errore nell'eliminare un turno: ${error.message}`);
        return;
      }
    }
    turniSincronizzatiRef.current = turni;
    setSalvandoTurni(false);
  }

  // Scrive/elimina subito su Supabase una singola cella di `turni`. Serve per le mutazioni
  // "puntuali" che nascono da un'approvazione o da uno scambio (assenza approvata,
  // pre-assegnazione applicata, swap accettato): possono avvenire nel browser di
  // QUALSIASI utente, non solo dell'admin, quindi non possono aspettare che qualcuno prema
  // "Salva turni" (che esiste solo nella pagina Calendario, per le modifiche manuali in blocco).
  async function sincronizzaTurnoSingolo(key, valore) {
    if (!supabase) return;
    const [empId, annoK, meseK, giornoK] = key.split("_");
    const riga = { profile_id: empId, anno: Number(annoK), mese: Number(meseK), giorno: Number(giornoK) };
    const { error } = valore
      ? await supabase.from("turni").upsert({ ...riga, code: valore.code, dnm: !!valore.dnm }, { onConflict: "profile_id,anno,mese,giorno" })
      : await supabase.from("turni").delete().match(riga);
    if (error) {
      console.error("Errore sincronizzazione turno:", error);
      return;
    }
    if (valore) {
      turniSincronizzatiRef.current = { ...turniSincronizzatiRef.current, [key]: valore };
    } else {
      const { [key]: rimosso, ...resto } = turniSincronizzatiRef.current;
      turniSincronizzatiRef.current = resto;
    }
  }

  const numGiorni = giorniDelMese(anno, mese);
  const giorniArray = Array.from({ length: numGiorni }, (_, i) => i + 1);

  const nomeMese = new Date(anno, mese, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  // scorciatoia: chiave turno per il mese/anno attualmente selezionato
  const kt = (empId, giorno) => keyTurno(empId, anno, mese, giorno);

  // ---------- Login ----------

  async function handleLogin() {
    if (!supabase) {
      setLoginErrore("App non collegata al backend: contatta l'amministratore.");
      return;
    }
    if (!loginEmail.trim() || !loginPin) {
      setLoginErrore("Inserisci email e PIN.");
      return;
    }
    setLoginErrore("");
    // Va scritta PRIMA del login: l'adapter di storage in supabaseClient.js la legge
    // nel momento stesso in cui Supabase salva la sessione, per decidere se metterla
    // in localStorage (sopravvive alla chiusura del browser) o in sessionStorage.
    localStorage.setItem(RESTA_CONNESSO_KEY, restaConnesso ? "true" : "false");
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPin });
    if (error) {
      setLoginErrore(`Errore: ${error.message}`);
      return;
    }
    setLoginPin("");
    setTab("calendario");
  }

  async function handleLogout() {
    await supabase?.auth.signOut();
    setLoginEmail("");
    setLoginPin("");
    setPannelloAccountAperto(false);
  }

  // Il motivo è obbligatorio: se l'admin annulla il prompt o lo lascia vuoto, il
  // rifiuto non viene proprio inviato (il chiamante controlla il valore restituito).
  function richiediMotivoRifiuto() {
    const motivo = window.prompt("Motivo del rifiuto (obbligatorio):");
    if (!motivo || !motivo.trim()) return null;
    return motivo.trim();
  }

  // ---------- Recupero PIN dimenticato ----------

  async function inviaRecuperoPin() {
    if (!emailRecupero.trim()) return;
    setRecuperoInCorso(true);
    setMessaggioRecupero("");
    const { error } = await supabase.auth.resetPasswordForEmail(emailRecupero.trim(), {
      redirectTo: window.location.origin,
    });
    setRecuperoInCorso(false);
    if (error) {
      setMessaggioRecupero(`Errore: ${error.message}`);
      return;
    }
    setMessaggioRecupero("Se l'indirizzo è registrato, ti abbiamo inviato un'email con il link per scegliere un nuovo PIN.");
  }

  async function confermaNuovoPinRecupero() {
    if (nuovoPinRecupero.length < 4) {
      setMessaggioNuovoPinRecupero("Il PIN deve avere almeno 4 caratteri.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: nuovoPinRecupero });
    if (error) {
      setMessaggioNuovoPinRecupero(`Errore: ${error.message}`);
      return;
    }
    setNuovoPinRecupero("");
    setImpostaNuovoPinDopoRecupero(false);
  }

  const isAdmin = utenteLoggato?.isAdmin;

  // Un account può esistere solo per amministrare (es. il titolare) senza far parte
  // della squadra operativa: non deve comparire in calendario, rotazioni, cambi turno
  // o ferie/permessi. `dipendenti` resta la lista completa (serve per il login e per
  // la gestione in "Dipendenti"); questa è la vista da usare ovunque si parli di turni.
  const dipendentiOperativi = dipendenti.filter((d) => d.membroSquadra !== false);

  // ---------- Account personale (self-service) ----------

  async function aggiornaEmailAccount() {
    if (!nuovaEmailAccount.trim()) return;
    const { error } = await supabase.auth.updateUser({ email: nuovaEmailAccount.trim() });
    if (error) {
      setMessaggioAccount(`Errore: ${error.message}`);
      return;
    }
    setMessaggioAccount("Controlla la tua nuova casella email per confermare il cambio.");
    setNuovaEmailAccount("");
  }

  async function aggiornaPinAccount() {
    if (nuovoPinAccount.length < 4) {
      setMessaggioAccount("Il PIN deve avere almeno 4 caratteri (Supabase può richiederne di più).");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: nuovoPinAccount });
    if (error) {
      setMessaggioAccount(`Errore: ${error.message}`);
      return;
    }
    setMessaggioAccount("PIN aggiornato.");
    setNuovoPinAccount("");
  }

  // ---------- Notifiche push ----------

  // Controlla se QUESTO browser/dispositivo ha già una sottoscrizione push attiva
  // (indipendente per ogni dispositivo: attivarle sul telefono non le attiva anche
  // sul computer, va fatto separatamente su ciascuno).
  useEffect(() => {
    if (!utenteLoggato || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.getRegistration().then((registrazione) => {
      registrazione?.pushManager.getSubscription().then((sub) => setNotifichePushAttive(!!sub));
    });
  }, [utenteLoggato]);

  async function attivaNotifichePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessaggioAccount("Questo browser non supporta le notifiche push.");
      return;
    }
    if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      setMessaggioAccount("Notifiche push non ancora configurate: contatta l'amministratore.");
      return;
    }
    setNotifichePushCaricamento(true);
    try {
      const permesso = await Notification.requestPermission();
      if (permesso !== "granted") {
        setMessaggioAccount("Permesso per le notifiche negato dal browser.");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      // pushManager.subscribe() vuole un service worker già ATTIVO: subito dopo
      // register() potrebbe essere ancora in fase di installazione. "ready" aspetta
      // che lo sia davvero, altrimenti si ottiene "requires an active service worker".
      const registrazione = await navigator.serviceWorker.ready;
      const subscription = await registrazione.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      });
      const sub = subscription.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        { profile_id: utenteLoggato.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        { onConflict: "endpoint" }
      );
      if (error) throw error;
      setNotifichePushAttive(true);
      setMessaggioAccount("Notifiche push attivate su questo dispositivo.");
    } catch (err) {
      setMessaggioAccount(`Errore: ${err.message}`);
    } finally {
      setNotifichePushCaricamento(false);
    }
  }

  async function disattivaNotifichePush() {
    setNotifichePushCaricamento(true);
    try {
      const registrazione = await navigator.serviceWorker.getRegistration();
      const subscription = await registrazione?.pushManager.getSubscription();
      if (subscription) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
      setNotifichePushAttive(false);
      setMessaggioAccount("Notifiche push disattivate su questo dispositivo.");
    } catch (err) {
      setMessaggioAccount(`Errore: ${err.message}`);
    } finally {
      setNotifichePushCaricamento(false);
    }
  }

  // Le notifiche push sono un extra rispetto all'azione principale (accettare uno
  // scambio, approvare ferie...): se l'invio fallisce non deve mai bloccarla, quindi
  // gli errori restano silenziosi qui (la notifica in-app nella campanella resta comunque).
  async function inviaPush(profileId, titolo, corpo) {
    if (!supabase || !profileId) return;
    try {
      await supabase.functions.invoke("send-push", { body: { profileId, titolo, corpo } });
    } catch {
      // silenzioso, vedi commento sopra
    }
  }

  // ---------- Gestione turni ----------

  function impostaTurno(empId, giorno, code) {
    const k = kt(empId, giorno);
    setTurni((prev) => {
      const esito = canModifyShift(prev[k]);
      if (!esito.allowed) {
        alert(esito.reason);
        return prev;
      }
      const next = { ...prev };
      if (!code) {
        delete next[k];
      } else {
        next[k] = { code, dnm: false };
      }
      return next;
    });
  }

  function toggleDNM(empId, giorno) {
    const k = kt(empId, giorno);
    setTurni((prev) => {
      if (!prev[k]) return prev;
      return { ...prev, [k]: { ...prev[k], dnm: !prev[k].dnm } };
    });
  }

  // Risolve una segnalazione "sequenza da preferire diversamente" (C1→A1 o C2→A2) SENZA
  // lasciare lo slot scoperto: prova prima a scambiare il turno del giorno successivo con un
  // collega che lavora già quel giorno con un turno diverso (così restano entrambi coperti);
  // se non trova un collega disponibile per lo scambio, cerca un sostituto libero per il turno
  // originale e sposta il dipendente coinvolto su CE (se il suo ruolo lo ammette), così nessuno
  // resta senza turno. Se nemmeno questo è possibile, avvisa che serve un intervento manuale.
  // IMPORTANTE: non applica mai una modifica che crei la sequenza assoluta vietata (C2 seguito
  // da A1) per nessuno dei dipendenti coinvolti, né guardando al giorno prima né al giorno dopo.
  const MAPPA_SEQUENZE_PREFERIBILI_GLOBALE = { A1: "C1", A2: "C2" };

  function correggiSequenza(v) {
    const giornoSucc = v.giorno + 1;
    const kX = kt(v.empId, giornoSucc);
    const empX = dipendenti.find((x) => x.id === v.empId);

    // FIX #5: prima questo controllo mancava del tutto — si verificava solo il DNM del
    // collega coinvolto nello scambio (tY.dnm sotto), mai quello del proprio slot (kX).
    const guardX = canModifyShift(turni[kX]);
    if (!guardX.allowed) {
      alert(`Non posso correggere questa sequenza: ${guardX.reason}`);
      return;
    }

    const ieriSucc = giornoPrecedente(anno, mese, giornoSucc);
    const violaPerAltri = (d, codice) => {
      const turnoPrec = MAPPA_SEQUENZE_PREFERIBILI_GLOBALE[codice];
      if (!turnoPrec) return false;
      return turni[keyTurno(d.id, ieriSucc.anno, ieriSucc.mese, ieriSucc.giorno)]?.code === turnoPrec;
    };

    // Non creare MAI la sequenza assoluta vietata (C2 seguito da A1): controlla sia il giorno
    // prima (qualcun altro ha fatto C2 e daremmo A1) sia il giorno dopo (assegneremmo C2 e il
    // giorno successivo quella persona ha già A1).
    const violaSequenzaAssoluta = (empId, giorno, codice) => {
      const ieri = giornoPrecedente(anno, mese, giorno);
      const turnoIeri = turni[keyTurno(empId, ieri.anno, ieri.mese, ieri.giorno)]?.code;
      if (turnoIeri === "C2" && codice === "A1") return true;
      if (codice === "C2" && giorno < numGiorni) {
        const turnoDomani = turni[kt(empId, giorno + 1)]?.code;
        if (turnoDomani === "A1") return true;
      }
      return false;
    };

    // --- Tentativo 1: scambio con un collega che lavora lo stesso giorno con un turno diverso ---
    const candidatoScambio = dipendenti.find((d) => {
      if (d.id === v.empId) return false;
      const tY = turni[kt(d.id, giornoSucc)];
      if (!tY || !canModifyShift(tY).allowed || tY.code === v.domani) return false;
      if (!["C1", "C2", "A1", "A2", "N", "CE"].includes(tY.code)) return false;
      if (!turniAmmessiDipendente(empX).includes(tY.code)) return false;
      if (!turniAmmessiDipendente(d).includes(v.domani)) return false;
      if (violaPerAltri(d, v.domani)) return false;
      if (violaSequenzaAssoluta(v.empId, giornoSucc, tY.code)) return false;
      if (violaSequenzaAssoluta(d.id, giornoSucc, v.domani)) return false;
      return true;
    });

    if (candidatoScambio) {
      const kY = kt(candidatoScambio.id, giornoSucc);
      const codiceY = turni[kY].code;
      setTurni((prev) => ({
        ...prev,
        [kX]: { code: codiceY, dnm: false },
        [kY]: { code: v.domani, dnm: false },
      }));
      return;
    }

    // --- Tentativo 2: sostituto libero per il turno originale, e X spostato su CE ---
    // (CE non può mai creare la sequenza assoluta vietata, quindi qui basta controllare il sostituto)
    const sostitutoLibero = dipendenti.find((d) => {
      if (d.id === v.empId) return false;
      if (!turniAmmessiDipendente(d).includes(v.domani)) return false;
      if (turni[kt(d.id, giornoSucc)]) return false;
      if (violaPerAltri(d, v.domani)) return false;
      if (violaSequenzaAssoluta(d.id, giornoSucc, v.domani)) return false;
      return true;
    });

    if (sostitutoLibero) {
      const kSostituto = kt(sostitutoLibero.id, giornoSucc);
      const puoFareCE = empX.tipo === "diurno" || empX.tipo === "turnante";
      setTurni((prev) => {
        const next = { ...prev, [kSostituto]: { code: v.domani, dnm: false } };
        if (puoFareCE) next[kX] = { code: "CE", dnm: false };
        return next;
      });
      return;
    }

    alert("Nessuna soluzione automatica trovata senza creare una sequenza da evitare (C2 seguito da A1): correggi manualmente dal calendario.");
  }

  // ---------- Assegnazione automatica ----------
  // Vale solo per il mese/anno attualmente selezionato: le chiavi dei turni includono
  // anno e mese, quindi non tocca mai i dati di altri mesi.
  // Ad ogni click riparte da zero per il mese corrente, MA rispetta sempre i turni
  // bloccati con DNM (che restano fissi) e i turni di altri mesi (mai toccati).

  function assegnaAutomaticamente() {
    // FIX #4, #6, #9: la logica di generazione è ora nel modulo di dominio puro
    // generateSchedule() (src/domain/assignment.js), testato in isolamento. Qui il componente
    // si limita a raccogliere l'input, chiamarlo, e applicare il risultato allo stato React.
    const risultato = generateSchedule({
      dipendenti: dipendentiOperativi,
      turniEsistenti: turni,
      anno,
      mese,
      numGiorni,
      coperturaRegole,
      regoleAttive,
      ordineRegolePreferenza,
      preferenze,
      statoMese,
    });

    if (risultato.bloccato) {
      // FIX #6: il mese è Definitivo — generateSchedule si è rifiutata di rigenerare.
      alert(risultato.conflitti[0]?.messaggio || "Il mese è Definitivo: rigenerazione bloccata.");
      return;
    }

    setTurni(risultato.turni);
    setConflitti(risultato.conflitti);
  }


  // Pre-imposta SOLO i giorni di riposo (non i turni di copertura) per un certo numero di mesi
  // futuri, a partire dal mese successivo a quello visualizzato — usando la stessa regola di
  // rotazione (la coppia di riposo scala indietro di 1 giorno ogni mese) già usata per il mese
  // corrente. Non tocca mai un giorno che ha già un turno impostato (di alcun tipo).
  function impostaRiposiMesiSuccessivi(numeroMesi = 12) {
    setTurni((prev) => {
      const next = { ...prev };
      for (let offset = 1; offset <= numeroMesi; offset++) {
        const meseTarget = (mese + offset) % 12;
        const annoTarget = anno + Math.floor((mese + offset) / 12);
        const giorniTarget = giorniDelMese(annoTarget, meseTarget);
        const offsetRiposoPerId = calcolaOffsetRiposoPerMese(dipendentiOperativi, annoTarget, meseTarget);

        dipendentiOperativi.forEach((d) => {
          const offsetRiposo = offsetRiposoPerId[d.id];
          for (let giorno = 1; giorno <= giorniTarget; giorno++) {
            const k = keyTurno(d.id, annoTarget, meseTarget, giorno);
            if (next[k]) continue; // non sovrascrivere un turno già presente
            const gs = giornoSettimana(annoTarget, meseTarget, giorno);
            if (gs === offsetRiposo || gs === (offsetRiposo + 1) % 7) {
              next[k] = { code: "R", dnm: false };
            }
          }
        });
      }
      return next;
    });
  }

  // ---------- Riepiloghi ----------

  const riepilogoOre = useMemo(() => {
    const res = {};
    dipendenti.forEach((d) => {
      let giorniLavorati = 0;
      giorniArray.forEach((g) => {
        const t = turni[kt(d.id, g)];
        if (t && !["R", "F", "P"].includes(t.code)) giorniLavorati++;
      });
      res[d.id] = giorniLavorati;
    });
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turni, dipendenti, giorniArray, anno, mese]);

  // Recap: quanti giorni di A1, A2, C1, C2, N ha fatto ciascun dipendente questo mese
  const CODICI_RECAP = ["A1", "A2", "C1", "C2", "N"];
  const recapTurniTipo = useMemo(() => {
    const res = {};
    dipendenti.forEach((d) => {
      const conteggi = {};
      CODICI_RECAP.forEach((code) => {
        conteggi[code] = giorniArray.filter((g) => turni[kt(d.id, g)]?.code === code).length;
      });
      res[d.id] = conteggi;
    });
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turni, dipendenti, giorniArray, anno, mese]);

  // Recap: ferie e permessi rimanenti nell'anno (calcolato su tutti i mesi dell'anno, non solo quello visualizzato)
  const recapFeriePermessi = useMemo(() => {
    const res = {};
    dipendenti.forEach((d) => {
      let ferieUsate = 0;
      Object.entries(turni).forEach(([k, v]) => {
        const [empIdStr, annoStr] = k.split("_");
        if (Number(empIdStr) === d.id && Number(annoStr) === anno && v.code === "F") {
          ferieUsate += 1;
        }
      });
      let permessiOreUsate = 0;
      richiesteAssenza
        .filter((r) => r.empId === d.id && r.anno === anno && r.tipo === "P" && r.stato === "approvata")
        .forEach((r) => {
          permessiOreUsate += r.ore || 8; // se non specificate, considera una giornata piena (8h)
        });
      res[d.id] = {
        ferieUsate,
        ferieResidue: (d.quotaFerieAnnua ?? QUOTA_FERIE_DEFAULT) - ferieUsate,
        permessiOreUsate,
        permessiOreResidue: (d.quotaPermessiOreAnnue ?? QUOTA_PERMESSI_ORE_DEFAULT) - permessiOreUsate,
      };
    });
    return res;
  }, [turni, dipendenti, richiesteAssenza, anno]);

  // Rileva sequenze C2 (sera) seguito da A1 (mattina presto) il giorno dopo, anche se inserite a mano
  const violazioniSequenza = useMemo(() => {
    const elenco = [];
    dipendenti.forEach((d) => {
      giorniArray.forEach((g) => {
        if (g + 1 > numGiorni) return;
        const oggiTurno = turni[kt(d.id, g)];
        const domaniTurno = turni[kt(d.id, g + 1)];
        if (oggiTurno?.code === "C2" && domaniTurno?.code === "A1") {
          elenco.push({ empId: d.id, giorno: g });
        }
      });
    });
    return elenco;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turni, dipendenti, giorniArray, numGiorni, anno, mese]);

  // Rileva sequenze "preferibili da evitare" (C1→A1, C2→A2): non bloccanti, solo un avviso
  const avvisiSequenzaPreferibile = useMemo(() => {
    const mappa = { C1: "A1", C2: "A2" };
    const elenco = [];
    dipendenti.forEach((d) => {
      giorniArray.forEach((g) => {
        if (g + 1 > numGiorni) return;
        const oggiTurno = turni[kt(d.id, g)];
        const domaniTurno = turni[kt(d.id, g + 1)];
        if (mappa[oggiTurno?.code] && mappa[oggiTurno.code] === domaniTurno?.code) {
          elenco.push({ empId: d.id, giorno: g, oggi: oggiTurno.code, domani: domaniTurno?.code });
        }
      });
    });
    return elenco;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turni, dipendenti, giorniArray, numGiorni, anno, mese]);

  // ---------- Swap ----------
  // FIX #7: macchina a stati esplicita, coerente con la UI che promette "conferma del collega
  // e, a mese Definitivo, dell'Admin" — prima veniva applicato subito dopo l'accettazione del
  // collega, ignorando lo stato Bozza/Definitivo. Vedi src/domain/swapWorkflow.js.

  // Ogni azione su una richiesta scrive subito su Supabase e poi ricarica le tre liste:
  // le richieste passano di mano tra utenti diversi (chi le fa, il collega, l'admin), quindi
  // non si può tenerle in una bozza locale con un pulsante "Salva" come per il calendario —
  // ogni passaggio deve arrivare al database prima che l'altra persona possa vederlo.
  async function richiediSwap(empId, annoDa, meseDa, giornoDa, empDestinatarioId, annoA, meseA, giornoA) {
    const nuovaRiga = rigaDaSwap({
      daEmpId: empId,
      aEmpId: empDestinatarioId,
      annoDa,
      meseDa,
      giornoDa,
      annoA,
      meseA,
      giornoA,
      turnoDa: turni[keyTurno(empId, annoDa, meseDa, giornoDa)]?.code || null,
      turnoA: turni[keyTurno(empDestinatarioId, annoA, meseA, giornoA)]?.code || null,
      stato: STATI_SWAP.IN_ATTESA_COLLEGA,
    });
    const { error } = await supabase.from("richieste_swap").insert(nuovaRiga);
    if (error) {
      alert(`Errore nell'invio della richiesta: ${error.message}`);
      return;
    }
    await ricaricaRichieste();
    const richiedente = dipendenti.find((d) => d.id === empId);
    inviaPush(empDestinatarioId, "Nuovo cambio turno", `${richiedente?.nome ?? "Un collega"} ti ha proposto un cambio turno.`);
  }

  // FIX #8: rivalidazione al momento dell'applicazione effettiva (non solo alla creazione della
  // richiesta) — applicaScambio() ricontrolla che entrambi gli slot siano ancora modificabili
  // (non DNM) e corrispondano ancora ai turni originali della richiesta, usando lo stato LIVE
  // di `turni`, non lo snapshot salvato al momento della richiesta.
  async function applicaSwapEffettivo(richiesta) {
    const esito = applicaScambio(turni, richiesta, keyTurno);
    if (!esito.ok) {
      alert(esito.errore);
      await supabase
        .from("richieste_swap")
        .update(rigaDaSwap({ stato: STATI_SWAP.RIFIUTATA_ADMIN, notaSistema: esito.errore }))
        .eq("id", richiesta.id);
      await ricaricaRichieste();
      return;
    }
    // In un mese Definitivo "Assegna automaticamente" è già bloccato del tutto, quindi
    // non serve altra protezione. In Bozza invece una rigenerazione potrebbe cancellare
    // lo scambio appena concordato: i due turni scambiati si bloccano (DNM) per restare
    // fissi anche se l'admin rigenera l'assegnazione automatica.
    const statoMeseSwap = statoPerMese[`${richiesta.annoDa}_${richiesta.meseDa}`] ?? "bozza";
    let turniFinali = esito.turni;
    const kDa = keyTurno(richiesta.daEmpId, richiesta.annoDa, richiesta.meseDa, richiesta.giornoDa);
    const kA = keyTurno(richiesta.aEmpId, richiesta.annoA, richiesta.meseA, richiesta.giornoA);
    if (statoMeseSwap === "bozza") {
      turniFinali = { ...turniFinali };
      if (turniFinali[kDa]) turniFinali[kDa] = { ...turniFinali[kDa], dnm: true };
      if (turniFinali[kA]) turniFinali[kA] = { ...turniFinali[kA], dnm: true };
    }
    setTurni(turniFinali);
    // Attenzione: uno scambio può anche svuotare una cella (es. verso un giorno senza
    // turno) — sincronizzaTurnoSingolo va chiamata comunque, con valore undefined,
    // così la riga viene eliminata su Supabase invece di restare orfana.
    sincronizzaTurnoSingolo(kDa, turniFinali[kDa]);
    sincronizzaTurnoSingolo(kA, turniFinali[kA]);
  }

  // Il collega destinatario risponde: in Bozza l'accettazione applica subito, in Definitivo
  // passa in attesa dell'admin (accettaDaCollega decide in base a statoMese).
  async function rispondiSwapCollega(id, accetta) {
    const richiesta = richiesteSwap.find((r) => r.id === id);
    if (!richiesta) return;
    const collega = dipendenti.find((d) => d.id === richiesta.aEmpId);
    if (!accetta) {
      await supabase.from("richieste_swap").update(rigaDaSwap({ stato: rifiutaDaCollega() })).eq("id", id);
      await ricaricaRichieste();
      inviaPush(richiesta.daEmpId, "Cambio turno rifiutato", `${collega?.nome ?? "Il collega"} ha rifiutato il cambio turno.`);
      return;
    }
    const nuovoStato = accettaDaCollega(statoMese);
    await supabase.from("richieste_swap").update(rigaDaSwap({ stato: nuovoStato })).eq("id", id);
    await ricaricaRichieste();
    if (nuovoStato === STATI_SWAP.APPLICATA) {
      await applicaSwapEffettivo(richiesta);
      inviaPush(richiesta.daEmpId, "Cambio turno accettato", `${collega?.nome ?? "Il collega"} ha accettato il cambio turno.`);
    } else if (nuovoStato === STATI_SWAP.IN_ATTESA_ADMIN) {
      dipendenti.filter((d) => d.isAdmin).forEach((admin) =>
        inviaPush(admin.id, "Cambio turno da approvare", "Un cambio turno tra colleghi è in attesa della tua approvazione.")
      );
    }
  }

  // L'admin risponde, solo quando la richiesta è in attesa sua (mese Definitivo).
  async function rispondiSwapAdmin(id, approva, motivoRifiuto) {
    const richiesta = richiesteSwap.find((r) => r.id === id);
    if (!richiesta) return;
    const nuovoStato = approva ? approvaSwapAdmin() : rifiutaSwapAdmin();
    await supabase
      .from("richieste_swap")
      .update(rigaDaSwap({ stato: nuovoStato, motivoRifiuto: approva ? null : motivoRifiuto }))
      .eq("id", id);
    await ricaricaRichieste();
    if (nuovoStato === STATI_SWAP.APPLICATA) {
      await applicaSwapEffettivo(richiesta);
      inviaPush(richiesta.daEmpId, "Cambio turno accettato", "L'admin ha approvato il tuo cambio turno.");
    } else {
      inviaPush(richiesta.daEmpId, "Cambio turno rifiutato", `L'admin ha rifiutato il tuo cambio turno. Motivo: ${motivoRifiuto}`);
    }
  }

  // ---------- Richieste ferie/permessi ----------

  async function richiediAssenza(empId, giorno, annoRichiesta, meseRichiesta, tipo, turnoInteressato, dettagli) {
    const nuovaRiga = rigaDaAssenza({
      empId,
      giorno,
      anno: annoRichiesta,
      mese: meseRichiesta,
      tipo,
      turnoInteressato: turnoInteressato || null,
      nota: dettagli?.nota || "",
      ore: dettagli?.ore || null,
      oraInizio: dettagli?.oraInizio || "",
      oraFine: dettagli?.oraFine || "",
      stato: "in sospeso",
    });
    const { error } = await supabase.from("richieste_assenza").insert(nuovaRiga);
    if (error) {
      alert(`Errore nell'invio della richiesta: ${error.message}`);
      return;
    }
    await ricaricaRichieste();
    const richiedente = dipendenti.find((d) => d.id === empId);
    const tipoLabel = tipo === "F" ? "ferie" : "un permesso";
    dipendenti.filter((d) => d.isAdmin).forEach((admin) =>
      inviaPush(admin.id, "Nuova richiesta", `${richiedente?.nome ?? "Un dipendente"} ha richiesto ${tipoLabel}.`)
    );
  }

  async function gestisciAssenza(id, decisione, motivoRifiuto) {
    const r = richiesteAssenza.find((r) => r.id === id);
    await supabase
      .from("richieste_assenza")
      .update(rigaDaAssenza({ stato: decisione, motivoRifiuto: decisione === "approvata" ? null : motivoRifiuto }))
      .eq("id", id);
    if (decisione === "approvata" && r) {
      const k = keyTurno(r.empId, r.anno, r.mese, r.giorno);
      const esito = canModifyShift(turni[k]);
      if (!esito.allowed) {
        alert(`Impossibile applicare l'assenza approvata: ${esito.reason}`);
      } else {
        const nuovoValore = { code: r.tipo, dnm: false };
        setTurni((prev) => ({ ...prev, [k]: nuovoValore }));
        sincronizzaTurnoSingolo(k, nuovoValore);
      }
    }
    await ricaricaRichieste();
    if (r) {
      const tipoLabel = r.tipo === "F" ? "Ferie" : "Permesso";
      const corpo = decisione === "approvata" ? "La tua richiesta è stata approvata." : `La tua richiesta è stata rifiutata. Motivo: ${motivoRifiuto}`;
      inviaPush(r.empId, decisione === "approvata" ? `${tipoLabel} approvate` : `${tipoLabel} rifiutate`, corpo);
    }
  }

  // ---------- Pre-assegnazione turni (richiesta dipendente, conferma admin) ----------

  // "giorno libero" (LIBERO) equivale a un riposo; altrimenti si usa il codice turno scelto.
  // In entrambi i casi, una volta applicata la pre-assegnazione il turno si blocca (DNM).
  // FIX #5: anche qui, non si può più sovrascrivere incondizionatamente uno slot già bloccato.
  function applicaPreassegnazioneTurno(empId, giorno, annoTarget, meseTarget, turno) {
    const codice = turno === "LIBERO" ? "R" : turno;
    const k = keyTurno(empId, annoTarget, meseTarget, giorno);
    const esito = canModifyShift(turni[k]);
    if (!esito.allowed) {
      alert(`Impossibile applicare la pre-assegnazione: ${esito.reason}`);
      return;
    }
    const nuovoValore = { code: codice, dnm: true };
    setTurni((prev) => ({ ...prev, [k]: nuovoValore }));
    sincronizzaTurnoSingolo(k, nuovoValore);
  }

  async function richiediPreassegnazione(empId, giorno, annoRichiesta, meseRichiesta, turno, nota) {
    // L'admin può pre-assegnare turni (anche per altri dipendenti) senza attendere conferma:
    // la richiesta viene applicata subito ed è già "approvata".
    const statoIniziale = isAdmin ? "approvata" : "in sospeso";
    const nuovaRiga = rigaDaPreassegnazione({
      empId,
      giorno,
      anno: annoRichiesta,
      mese: meseRichiesta,
      turno,
      nota: nota || "",
      stato: statoIniziale,
    });
    const { error } = await supabase.from("richieste_preassegnazione").insert(nuovaRiga);
    if (error) {
      alert(`Errore nell'invio della richiesta: ${error.message}`);
      return;
    }
    await ricaricaRichieste();
    if (isAdmin) {
      applicaPreassegnazioneTurno(empId, giorno, annoRichiesta, meseRichiesta, turno);
    } else {
      const richiedente = dipendenti.find((d) => d.id === empId);
      dipendenti.filter((d) => d.isAdmin).forEach((admin) =>
        inviaPush(admin.id, "Nuova pre-assegnazione richiesta", `${richiedente?.nome ?? "Un dipendente"} ha richiesto una pre-assegnazione.`)
      );
    }
  }

  async function gestisciPreassegnazione(id, decisione, motivoRifiuto) {
    const r = richiestePreassegnazione.find((r) => r.id === id);
    await supabase
      .from("richieste_preassegnazione")
      .update(rigaDaPreassegnazione({ stato: decisione, motivoRifiuto: decisione === "approvata" ? null : motivoRifiuto }))
      .eq("id", id);
    if (decisione === "approvata" && r) {
      applicaPreassegnazioneTurno(r.empId, r.giorno, r.anno, r.mese, r.turno);
    }
    await ricaricaRichieste();
    if (r) {
      const corpo = decisione === "approvata" ? "La tua richiesta è stata approvata." : `La tua richiesta è stata rifiutata. Motivo: ${motivoRifiuto}`;
      inviaPush(r.empId, decisione === "approvata" ? "Pre-assegnazione approvata" : "Pre-assegnazione rifiutata", corpo);
    }
  }

  // ---------- Export calendario (.ics) ----------

  // Esporta i turni di un intero anno solare del dipendente in un file .ics scaricabile,
  // importabile in Google Calendar / Outlook / Proton Calendar / Apple Calendar. Non è un
  // abbonamento che si aggiorna da solo: va riscaricato quando i turni cambiano.
  function esportaCalendarioICS(dipendente, annoTarget) {
    const eventiTurno = [];
    for (let m = 0; m < 12; m++) {
      const numGiorniMese = giorniDelMese(annoTarget, m);
      for (let g = 1; g <= numGiorniMese; g++) {
        const t = turni[keyTurno(dipendente.id, annoTarget, m, g)];
        if (t) eventiTurno.push({ anno: annoTarget, mese: m, giorno: g, code: t.code });
      }
    }
    const ics = generaICS(dipendente, eventiTurno);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `turni-${dipendente.cognome}-${dipendente.nome}-${annoTarget}.ics`.replace(/\s+/g, "-");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- Preferenze ----------

  function aggiornaPreferenza(empId, campo, valore) {
    setPreferenze((prev) => ({
      ...prev,
      [empId]: { ...prev[empId], [campo]: valore },
    }));
  }

  // ---------- Regole di copertura (quantità richiesta per turno, editabile dall'admin) ----------

  function aggiornaQuantitaRegola(codice, nuovaQuantita) {
    const q = Math.max(0, Math.min(9, nuovaQuantita));
    setCoperturaRegole((prev) => ({ ...prev, [codice]: q }));
  }

  function aggiungiRegolaCopertura(codice, quantita) {
    if (!codice || coperturaRegole[codice] !== undefined) return;
    setCoperturaRegole((prev) => ({ ...prev, [codice]: Math.max(1, Math.min(9, quantita)) }));
  }

  function rimuoviRegolaCopertura(codice) {
    setCoperturaRegole((prev) => {
      const next = { ...prev };
      delete next[codice];
      return next;
    });
  }

  // ---------- Stili ----------

  const styles = {
    page: {
      fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: COLORI.mist,
      minHeight: "100vh",
      color: COLORI.ink,
    },
    header: {
      background: "transparent",
      color: COLORI.ink,
      padding: isMobile ? "14px 14px" : "26px 28px 6px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: isMobile ? "center" : "flex-start",
      flexWrap: isMobile ? "nowrap" : "wrap",
      gap: "12px",
      maxWidth: "1180px",
      margin: "0 auto",
    },
    logoRow: { display: "flex", alignItems: "center", gap: isMobile ? "10px" : "14px" },
    logoMark: {
      width: "44px",
      height: "44px",
      borderRadius: "50%",
      background: COLORI.ottone,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Roboto', sans-serif",
      fontSize: "15px",
      fontWeight: 700,
      color: "white",
      flexShrink: 0,
    },
    title: {
      fontFamily: "'Roboto', sans-serif",
      fontSize: isMobile ? "21px" : "28px",
      fontWeight: 700,
      margin: 0,
      letterSpacing: "-0.01em",
      color: COLORI.ink,
    },
    subtitle: {
      fontSize: "13px",
      color: COLORI.muted,
      marginTop: "2px",
      fontWeight: 500,
    },
    navWrapper: {
      maxWidth: "1180px",
      margin: isMobile ? "12px auto 14px" : "18px auto 22px",
      padding: isMobile ? "0 14px" : "0 28px",
    },
    nav: {
      display: "flex",
      gap: "2px",
      background: COLORI.inkDark,
      padding: "6px",
      borderRadius: "12px",
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
    },
    navBtn: (active) => ({
      border: "none",
      background: active ? "#FFFFFF" : "transparent",
      color: active ? COLORI.ink : "rgba(255,255,255,0.65)",
      padding: isMobile ? "9px 14px" : "10px 18px",
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: isMobile ? "12.5px" : "13px",
      fontWeight: active ? 700 : 500,
      fontFamily: "inherit",
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }),
    container: { padding: isMobile ? "0 14px 28px" : "0 28px 40px", maxWidth: "1180px", margin: "0 auto" },
    card: {
      background: COLORI.card,
      borderRadius: isMobile ? "14px" : "20px",
      border: "none",
      padding: isMobile ? "16px 14px" : "22px 24px",
      boxShadow: "0 8px 24px rgba(28,30,46,0.06)",
      marginBottom: "18px",
    },
    sectionTitle: {
      fontFamily: "'Roboto', sans-serif",
      fontSize: isMobile ? "16px" : "18px",
      fontWeight: 700,
      margin: "0 0 4px",
      color: COLORI.ink,
    },
    table: { borderCollapse: "collapse", width: "100%", fontSize: "12.5px" },
    th: {
      padding: "6px 4px",
      textAlign: "center",
      background: COLORI.mist,
      color: COLORI.muted,
      fontWeight: 600,
      fontSize: "11px",
      position: "sticky",
      top: 0,
      minWidth: "28px",
      borderBottom: `1px solid ${COLORI.hairlineForte}`,
    },
    thWeekend: {
      background: "#E1E4F5",
    },
    tdEmp: {
      padding: "9px 12px",
      fontWeight: 600,
      whiteSpace: "nowrap",
      background: COLORI.card,
      position: "sticky",
      left: 0,
      borderBottom: `1px solid ${COLORI.hairline}`,
      fontSize: "13px",
    },
    tdCell: {
      padding: "2px",
      textAlign: "center",
      borderBottom: `1px solid ${COLORI.hairline}`,
      borderRight: `1px solid #F3F4F2`,
      cursor: "pointer",
      minWidth: "28px",
      height: "30px",
    },
    tdCellWeekend: {
      background: "#FAFBF9",
    },
    tdCellSelezionata: {
      filter: "brightness(0.88)",
      borderRadius: "6px",
    },
    tdCellSelezionataVuota: {
      background: hexRgba(COLORI.selezione, 0.09),
      borderRadius: "6px",
    },
    badge: (colore) => ({
      display: "inline-block",
      minWidth: "24px",
      padding: "3px 6px",
      borderRadius: "6px",
      color: testoContrastante(colore),
      background: colore,
      fontSize: "10.5px",
      fontWeight: 700,
      letterSpacing: "0.02em",
      textAlign: "center",
    }),
    badgeCalendario: (colore) => ({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "18px",
      padding: "1px 4px",
      borderRadius: "4px",
      color: testoContrastante(colore),
      background: colore,
      fontSize: "9px",
      fontWeight: 700,
      letterSpacing: "0.01em",
    }),
    input: {
      padding: "10px 12px",
      borderRadius: "10px",
      border: `1px solid ${COLORI.hairlineForte}`,
      // 16px su mobile evita lo zoom automatico di iOS Safari al focus su un campo.
      fontSize: isMobile ? "16px" : "13px",
      width: "100%",
      boxSizing: "border-box",
      fontFamily: "inherit",
      background: COLORI.card,
      color: COLORI.ink,
    },
    select: {
      padding: "10px 12px",
      borderRadius: "10px",
      border: `1px solid ${COLORI.hairlineForte}`,
      fontSize: isMobile ? "16px" : "13px",
      fontFamily: "inherit",
      background: COLORI.card,
      color: COLORI.ink,
      cursor: "pointer",
    },
    datePickerTrigger: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      background: COLORI.card,
      border: `1px solid ${COLORI.hairlineForte}`,
      borderRadius: "10px",
      padding: "10px 12px",
      fontSize: "13px",
      fontWeight: 600,
      color: COLORI.ink,
      cursor: "pointer",
      fontFamily: "inherit",
    },
    datePickerPannello: {
      position: "absolute",
      top: "calc(100% + 6px)",
      left: 0,
      zIndex: 50,
      background: COLORI.card,
      borderRadius: "14px",
      boxShadow: "0 12px 32px rgba(28,30,46,0.16)",
      padding: "14px",
      width: "270px",
    },
    datePickerHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "10px",
    },
    datePickerFreccia: {
      border: "none",
      background: COLORI.mist,
      borderRadius: "50%",
      width: "26px",
      height: "26px",
      cursor: "pointer",
      fontSize: "14px",
      color: COLORI.ink,
      lineHeight: 1,
    },
    datePickerMeseAnno: {
      border: "none",
      background: "transparent",
      fontSize: "13.5px",
      fontWeight: 700,
      color: COLORI.ink,
      cursor: "pointer",
      textTransform: "capitalize",
      fontFamily: "inherit",
    },
    datePickerAnniRiga: {
      display: "flex",
      gap: "6px",
      justifyContent: "center",
      marginBottom: "10px",
    },
    datePickerAnnoBtn: (attivo) => ({
      border: "none",
      background: attivo ? COLORI.teal : COLORI.mist,
      color: attivo ? "white" : COLORI.ink,
      borderRadius: "8px",
      padding: "6px 10px",
      fontSize: "12px",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
    }),
    datePickerGrigliaSettimana: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      marginBottom: "4px",
    },
    datePickerGiornoSettimana: {
      textAlign: "center",
      fontSize: "9.5px",
      fontWeight: 700,
      color: COLORI.muted,
      textTransform: "uppercase",
    },
    datePickerGriglia: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: "2px",
    },
    datePickerGiorno: (fuoriMese, selezionato) => ({
      border: "none",
      background: selezionato ? COLORI.teal : "transparent",
      color: selezionato ? "white" : fuoriMese ? COLORI.hairlineForte : COLORI.ink,
      borderRadius: "8px",
      height: "30px",
      fontSize: "12px",
      fontWeight: selezionato ? 700 : 500,
      cursor: "pointer",
      fontFamily: "inherit",
    }),
    gruppoOra: {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      background: COLORI.card,
      border: `1px solid ${COLORI.hairlineForte}`,
      borderRadius: "10px",
      padding: "3px 8px",
    },
    selectOra: {
      border: "none",
      background: "transparent",
      fontSize: "13px",
      fontFamily: "inherit",
      color: COLORI.ink,
      cursor: "pointer",
      padding: "7px 2px",
    },
    grigliaMensile: {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: "6px",
      marginTop: "12px",
    },
    grigliaMensileIntestazione: {
      textAlign: "center",
      fontSize: "10.5px",
      fontWeight: 700,
      color: COLORI.muted,
      textTransform: "uppercase",
      letterSpacing: "0.03em",
      paddingBottom: "4px",
    },
    cellaGiornoMensile: (fuoriMese, eOggi) => ({
      minHeight: "76px",
      borderRadius: "12px",
      padding: "8px",
      background: eOggi ? hexRgba(COLORI.teal, 0.08) : fuoriMese ? "transparent" : COLORI.mist,
      border: eOggi ? `1.5px solid ${COLORI.teal}` : "1px solid transparent",
      opacity: fuoriMese ? 0.35 : 1,
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    }),
    rigaCollega: (selezionata, disabilitata) => ({
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "6px 10px",
      padding: "10px 12px",
      borderRadius: "12px",
      background: selezionata ? hexRgba(COLORI.teal, 0.1) : COLORI.mist,
      border: selezionata ? `1.5px solid ${COLORI.teal}` : "1.5px solid transparent",
      cursor: disabilitata ? "not-allowed" : "pointer",
      opacity: disabilitata ? 0.55 : 1,
      width: "100%",
      textAlign: "left",
      fontFamily: "inherit",
      marginBottom: "6px",
    }),
    rigaRegola: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "14px",
      padding: "12px 0",
      borderBottom: `1px solid ${COLORI.hairline}`,
    },
    toggleTraccia: (attivo) => ({
      width: "40px",
      height: "22px",
      borderRadius: "999px",
      background: attivo ? COLORI.teal : COLORI.hairlineForte,
      border: "none",
      cursor: "pointer",
      position: "relative",
      flexShrink: 0,
      padding: 0,
    }),
    toggleCerchio: (attivo) => ({
      position: "absolute",
      top: "2px",
      left: attivo ? "20px" : "2px",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      background: "white",
      transition: "left 0.15s ease",
      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
    }),
    button: {
      background: COLORI.teal,
      color: "white",
      border: "none",
      padding: "10px 20px",
      borderRadius: "10px",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: "13px",
      fontFamily: "inherit",
    },
    buttonSecondary: {
      background: COLORI.mist,
      color: COLORI.ink,
      border: "none",
      padding: "9px 18px",
      borderRadius: "10px",
      cursor: "pointer",
      fontWeight: 600,
      fontSize: "13px",
      fontFamily: "inherit",
    },
    iconBtn: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      padding: "8px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    badgeNotifiche: {
      position: "absolute",
      top: "2px",
      right: "2px",
      minWidth: "15px",
      height: "15px",
      padding: "0 3px",
      borderRadius: "999px",
      background: "#D64545",
      color: "white",
      fontSize: "9.5px",
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1,
      boxShadow: "0 0 0 2px #fff",
    },
    // Su mobile è ancorato alla viewport (non al bottone che lo apre): un bottone
    // qualunque nell'header può trovarsi vicino al bordo, e un pannello ancorato lì
    // rischierebbe di uscire dallo schermo. Fissarlo a destra della viewport lo tiene
    // sempre visibile, indipendentemente da dove si trovi il bottone che lo apre.
    // Ancorato subito sotto il bottone che lo apre (mai sopra, mai a coprirlo): stesso
    // comportamento su mobile e desktop, solo più stretto su mobile per non uscire dallo
    // schermo dato che i bottoni che lo aprono sono vicini al bordo destro dell'header.
    pannelloNotifiche: (isMobile) => ({
      position: "absolute",
      top: "calc(100% + 8px)",
      right: 0,
      left: "auto",
      width: isMobile ? "260px" : "320px",
      maxHeight: isMobile ? "70vh" : "360px",
      overflowY: "auto",
      background: COLORI.card,
      borderRadius: "14px",
      boxShadow: "0 12px 32px rgba(28,30,46,0.18)",
      zIndex: 50,
      padding: "8px",
      boxSizing: "border-box",
    }),
    rigaNotifica: {
      display: "flex",
      gap: "8px",
      alignItems: "flex-start",
      padding: "9px 10px",
      borderRadius: "10px",
      background: COLORI.mist,
      marginBottom: "6px",
      fontSize: "12.5px",
      color: COLORI.ink,
      lineHeight: 1.4,
    },
    navFreccia: {
      background: COLORI.mist,
      color: COLORI.ink,
      border: "none",
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontSize: "15px",
      fontWeight: 600,
      fontFamily: "inherit",
      flexShrink: 0,
    },
    statoPill: (stato) => ({
      padding: "5px 14px",
      borderRadius: "999px",
      fontSize: "11.5px",
      fontWeight: 700,
      letterSpacing: "0.02em",
      background: stato === "bozza" ? COLORI.bozzaBg : COLORI.definitivoBg,
      color: stato === "bozza" ? COLORI.bozzaTesto : COLORI.definitivoTesto,
    }),
    avviso: {
      marginTop: "10px",
      background: COLORI.avvisoBg,
      border: `1px solid ${COLORI.avvisoBordo}`,
      borderRadius: "8px",
      padding: "12px 14px",
    },
    avvisoTitolo: { fontSize: "12.5px", color: COLORI.avvisoTesto, fontWeight: 700 },
    avvisoLieve: {
      marginTop: "10px",
      background: "#EAF1F1",
      border: `1px solid #BFD6D6`,
      borderRadius: "8px",
      padding: "12px 14px",
    },
    avvisoLieveTitolo: { fontSize: "12.5px", color: COLORI.tealScuro, fontWeight: 700 },
    label: { fontSize: "11.5px", display: "block", color: COLORI.muted, fontWeight: 600, marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.03em" },
  };

  // ---------- Login screen ----------

  if (!sessionePronta) {
    return (
      <div className="planner-turni-app" style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{GLOBAL_STYLE}</style>
      </div>
    );
  }

  if (impostaNuovoPinDopoRecupero) {
    return (
      <div className="planner-turni-app" style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }}>
        <style>{GLOBAL_STYLE}</style>
        <div style={{ ...styles.card, width: "100%", maxWidth: "340px", boxSizing: "border-box", textAlign: "center" }}>
          <img src={logoPlannerTurni} alt="Planner Turni" style={{ width: "100%", maxWidth: "280px", height: "auto", margin: "0 auto 18px" }} />
          <p style={{ fontSize: "12px", color: COLORI.muted, marginTop: 0, marginBottom: "20px" }}>
            Scegli il tuo nuovo PIN.
          </p>
          <div style={{ marginBottom: "16px", textAlign: "left" }}>
            <label style={styles.label}>Nuovo PIN</label>
            <input
              style={styles.input}
              type="password"
              autoComplete="new-password"
              value={nuovoPinRecupero}
              onChange={(e) => setNuovoPinRecupero(e.target.value)}
              placeholder="il tuo nuovo PIN"
              onKeyDown={(e) => e.key === "Enter" && confermaNuovoPinRecupero()}
            />
          </div>
          {messaggioNuovoPinRecupero && (
            <p style={{ color: messaggioNuovoPinRecupero.startsWith("Errore") ? COLORI.avvisoTesto : COLORI.tealScuro, fontSize: "12px" }}>
              {messaggioNuovoPinRecupero}
            </p>
          )}
          <button style={{ ...styles.button, width: "100%" }} onClick={confermaNuovoPinRecupero}>
            Salva nuovo PIN
          </button>
        </div>
      </div>
    );
  }

  if (!utenteLoggato) {
    return (
      <div className="planner-turni-app" style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }}>
        <style>{GLOBAL_STYLE}</style>
        <div style={{ ...styles.card, width: "100%", maxWidth: "340px", boxSizing: "border-box", textAlign: "center" }}>
          <img src={logoPlannerTurni} alt="Planner Turni" style={{ width: "100%", maxWidth: "280px", height: "auto", margin: "0 auto 18px" }} />
          {modalitaRecupero ? (
            <>
              <p style={{ fontSize: "12px", color: COLORI.muted, marginTop: 0, marginBottom: "20px" }}>
                Inserisci la tua email: ti mandiamo un link per scegliere un nuovo PIN.
              </p>
              <div style={{ marginBottom: "16px", textAlign: "left" }}>
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  type="email"
                  autoComplete="username"
                  value={emailRecupero}
                  onChange={(e) => setEmailRecupero(e.target.value)}
                  placeholder="nome@esempio.it"
                  onKeyDown={(e) => e.key === "Enter" && inviaRecuperoPin()}
                />
              </div>
              {messaggioRecupero && (
                <p style={{ color: messaggioRecupero.startsWith("Errore") ? COLORI.avvisoTesto : COLORI.tealScuro, fontSize: "12px" }}>
                  {messaggioRecupero}
                </p>
              )}
              <button style={{ ...styles.button, width: "100%" }} disabled={recuperoInCorso} onClick={inviaRecuperoPin}>
                {recuperoInCorso ? "Invio…" : "Invia link di recupero"}
              </button>
              <button
                type="button"
                style={{ ...styles.buttonSecondary, width: "100%", marginTop: "10px", background: "transparent" }}
                onClick={() => { setModalitaRecupero(false); setMessaggioRecupero(""); }}
              >
                Torna al login
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: "12px", color: COLORI.muted, marginTop: 0, marginBottom: "20px" }}>
                Accedi con l'email e il PIN che ti ha fornito l'amministratore.
              </p>
              <div style={{ marginBottom: "12px", textAlign: "left" }}>
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  type="email"
                  autoComplete="username"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="nome@esempio.it"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <div style={{ marginBottom: "12px", textAlign: "left" }}>
                <label style={styles.label}>PIN</label>
                <input
                  style={styles.input}
                  type="password"
                  autoComplete="current-password"
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value)}
                  placeholder="il tuo PIN"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: COLORI.ink, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={restaConnesso}
                    onChange={(e) => setRestaConnesso(e.target.checked)}
                    style={{ accentColor: COLORI.teal, width: "15px", height: "15px", cursor: "pointer" }}
                  />
                  Resta connesso
                </label>
                <button
                  type="button"
                  onClick={() => { setModalitaRecupero(true); setEmailRecupero(loginEmail); }}
                  style={{ border: "none", background: "transparent", color: COLORI.tealScuro, fontSize: "12px", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  PIN dimenticato?
                </button>
              </div>
              {loginErrore && <p style={{ color: COLORI.avvisoTesto, fontSize: "12px" }}>{loginErrore}</p>}
              <button style={{ ...styles.button, width: "100%" }} onClick={handleLogin}>
                Entra
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const empCorrente = dipendenti.find((d) => d.id === utenteLoggato.id);

  if (!empCorrente) {
    return (
      <div className="planner-turni-app" style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }}>
        <style>{GLOBAL_STYLE}</style>
        <div style={{ ...styles.card, width: "100%", maxWidth: "340px", boxSizing: "border-box", textAlign: "center" }}>
          <p style={{ fontSize: "13px", color: COLORI.ink }}>
            Il tuo account esiste ma non ha ancora un profilo dipendente collegato. Contatta l'amministratore.
          </p>
          <button style={{ ...styles.buttonSecondary, marginTop: "14px" }} onClick={handleLogout}>Esci</button>
        </div>
      </div>
    );
  }

  const notifiche = calcolaNotifiche({ empCorrente, isAdmin, richiesteSwap, richiesteAssenza, richiestePreassegnazione, dipendenti });
  const idNotificheLette = new Set(notificheLette[empCorrente?.id] ?? []);
  const notificheNonLette = notifiche.filter((n) => !idNotificheLette.has(n.id)).length;

  function toggleNotifiche() {
    setPannelloNotificheAperto((prev) => {
      const next = !prev;
      if (next) {
        setNotificheLette((letturePrev) => ({ ...letturePrev, [empCorrente.id]: notifiche.map((n) => n.id) }));
      }
      return next;
    });
  }

  const vociNav = [
    { id: "calendario", label: "Calendario" },
    { id: "mieiturni", label: "I miei turni" },
    ...(isAdmin ? [{ id: "dipendenti", label: "Dipendenti" }, { id: "copertura", label: "Regole copertura" }] : []),
    { id: "preferenze", label: "Le mie preferenze" },
    { id: "swap", label: "Cambi turno" },
    { id: "assenze", label: "Ferie / Permessi" },
    { id: "preassegnazioni", label: "Pre-assegnazioni" },
  ];

  // Swipe orizzontale per cambiare tab: ignora il gesto se parte da dentro un elemento che
  // scorre a sua volta in orizzontale (es. la tabella del calendario), altrimenti uno scroll
  // laterale nella tabella cambierebbe tab invece di scorrere la tabella.
  const touchInizioRef = useRef(null);
  function alTouchStartContenuto(e) {
    const tocco = e.touches[0];
    touchInizioRef.current = {
      x: tocco.clientX,
      y: tocco.clientY,
      suScrollabile: !!trovaAntenatoScrollabileOrizzontale(e.target),
    };
  }
  function alTouchEndContenuto(e) {
    const inizio = touchInizioRef.current;
    touchInizioRef.current = null;
    if (!inizio || inizio.suScrollabile) return;
    const tocco = e.changedTouches[0];
    const deltaX = tocco.clientX - inizio.x;
    const deltaY = tocco.clientY - inizio.y;
    const SOGLIA = 60;
    if (Math.abs(deltaX) < SOGLIA || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
    const indiceAttuale = vociNav.findIndex((v) => v.id === tab);
    if (indiceAttuale === -1) return;
    const prossimoIndice = deltaX < 0 ? indiceAttuale + 1 : indiceAttuale - 1;
    if (prossimoIndice < 0 || prossimoIndice >= vociNav.length) return;
    setTab(vociNav[prossimoIndice].id);
  }

  return (
    <div className="planner-turni-app" style={styles.page}>
      <style>{GLOBAL_STYLE}</style>
      <div style={styles.header}>
        <div style={styles.logoRow}>
          <img src={logoIcona} alt="Planner Turni" style={{ width: isMobile ? "34px" : "44px", height: isMobile ? "34px" : "44px", flexShrink: 0 }} />
          {!isMobile && (
            <div>
              <h1 style={styles.title}>Ciao, {empCorrente?.nome?.split(" ")[0]}</h1>
              <div style={styles.subtitle}>{TIPI_DIPENDENTE[empCorrente?.tipo]?.label} · {nomeMese}</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px" }}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuAvatarAperto((prev) => !prev)}
              title={`${empCorrente?.cognome} ${empCorrente?.nome}${isAdmin ? " · Admin" : ""}`}
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "50%",
                background: empCorrente?.colore,
                color: testoContrastante(empCorrente?.colore || "#000000"),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "13px",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              {empCorrente?.nome?.[0]}{empCorrente?.cognome?.[0]}
            </button>
            {menuAvatarAperto && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(20,21,35,0.45)" }} onClick={() => setMenuAvatarAperto(false)} />
                <div style={styles.pannelloNotifiche(isMobile)}>
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: COLORI.muted, padding: "4px 8px 8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    {empCorrente?.nome} {empCorrente?.cognome}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMenuAvatarAperto(false); handleLogout(); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                      padding: "9px 8px",
                      background: "none",
                      border: "none",
                      borderRadius: "10px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: COLORI.ink,
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}
                  >
                    <IconEsci dimensione={16} colore={COLORI.muted} />
                    Esci
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={toggleNotifiche}
              title="Notifiche"
              style={styles.iconBtn}
            >
              <IconCampanella dimensione={19} colore={COLORI.muted} />
              {notificheNonLette > 0 && (
                <span style={styles.badgeNotifiche}>{notificheNonLette > 9 ? "9+" : notificheNonLette}</span>
              )}
            </button>
            {pannelloNotificheAperto && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(20,21,35,0.45)" }} onClick={() => setPannelloNotificheAperto(false)} />
                <div style={styles.pannelloNotifiche(isMobile)}>
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: COLORI.muted, padding: "4px 8px 8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Notifiche
                  </div>
                  {notifiche.length === 0 ? (
                    <p style={{ fontSize: "13px", color: COLORI.muted, padding: "6px 8px 10px" }}>Nessuna notifica.</p>
                  ) : (
                    notifiche.map((n) => (
                      <div key={n.id} style={styles.rigaNotifica}>
                        <span style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          marginTop: "4px",
                          flexShrink: 0,
                          background: n.positivo === true ? "#2E9B5C" : n.positivo === false ? "#D64545" : "#C99A3B",
                        }} />
                        <span>{n.testo}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => { setPannelloAccountAperto((prev) => !prev); setMessaggioAccount(""); }}
              title="Il mio account"
              style={styles.iconBtn}
            >
              <IconIngranaggio dimensione={19} colore={COLORI.muted} />
            </button>
            {pannelloAccountAperto && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(20,21,35,0.45)" }} onClick={() => setPannelloAccountAperto(false)} />
                <div style={styles.pannelloNotifiche(isMobile)}>
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: COLORI.muted, padding: "4px 8px 10px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Il mio account
                  </div>
                  <p style={{ fontSize: "12px", color: COLORI.muted, padding: "0 8px", marginBottom: "10px" }}>
                    Email attuale: <strong style={{ color: COLORI.ink }}>{utenteLoggato.email}</strong>
                  </p>
                  <div style={{ padding: "0 8px", marginBottom: "10px" }}>
                    <label style={styles.label}>Nuova email</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="email"
                        style={styles.input}
                        value={nuovaEmailAccount}
                        onChange={(e) => setNuovaEmailAccount(e.target.value)}
                        placeholder="nuova@email.it"
                      />
                      <button type="button" style={styles.buttonSecondary} onClick={aggiornaEmailAccount}>Salva</button>
                    </div>
                  </div>
                  <div style={{ padding: "0 8px", marginBottom: "10px" }}>
                    <label style={styles.label}>Nuovo PIN</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="password"
                        style={styles.input}
                        value={nuovoPinAccount}
                        onChange={(e) => setNuovoPinAccount(e.target.value)}
                        placeholder="nuovo PIN"
                      />
                      <button type="button" style={styles.buttonSecondary} onClick={aggiornaPinAccount}>Salva</button>
                    </div>
                  </div>
                  <div style={{ padding: "0 8px", marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <div>
                      <label style={styles.label}>Notifiche push</label>
                      <p style={{ fontSize: "11px", color: COLORI.muted, margin: 0 }}>Solo su questo dispositivo</p>
                    </div>
                    <button
                      type="button"
                      disabled={notifichePushCaricamento}
                      style={styles.toggleTraccia(notifichePushAttive)}
                      onClick={() => (notifichePushAttive ? disattivaNotifichePush() : attivaNotifichePush())}
                    >
                      <span style={styles.toggleCerchio(notifichePushAttive)} />
                    </button>
                  </div>
                  {messaggioAccount && (
                    <p style={{ fontSize: "12px", color: messaggioAccount.startsWith("Errore") ? COLORI.avvisoTesto : COLORI.tealScuro, padding: "0 8px" }}>
                      {messaggioAccount}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={styles.navWrapper}>
        <div className="ptn-nav-scroll" style={styles.nav}>
          {vociNav.map((v) => (
            <button key={v.id} style={styles.navBtn(tab === v.id)} onClick={() => setTab(v.id)}>{v.label}</button>
          ))}
        </div>
      </div>

      <div style={styles.container} onTouchStart={alTouchStartContenuto} onTouchEnd={alTouchEndContenuto}>
        {tab === "calendario" && (
          <>
            <div style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    style={styles.navFreccia}
                    onClick={() => {
                      const { anno: a, mese: m } = mesePrecedente(anno, mese);
                      setAnno(a);
                      setMese(m);
                    }}
                  >
                    ←
                  </button>
                  <strong style={{ textTransform: "capitalize", fontFamily: "'Roboto', sans-serif", fontSize: "16px", fontWeight: 600 }}>{nomeMese}</strong>
                  <button
                    style={styles.navFreccia}
                    onClick={() => {
                      const { anno: a, mese: m } = meseSuccessivo(anno, mese);
                      setAnno(a);
                      setMese(m);
                    }}
                  >
                    →
                  </button>
                  <span style={styles.statoPill(statoMese)}>{statoMese === "bozza" ? "Bozza" : "Definitivo"}</span>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      style={{ ...styles.button, ...(statoMese === "definitivo" ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                      onClick={assegnaAutomaticamente}
                      disabled={statoMese === "definitivo"}
                      title={statoMese === "definitivo" ? "Il mese è Definitivo: riporta a Bozza per rigenerare" : ""}
                    >
                      Assegna automaticamente
                    </button>
                    <button
                      style={styles.buttonSecondary}
                      onClick={() => {
                        impostaRiposiMesiSuccessivi(12);
                        alert("Riposi impostati per i 12 mesi successivi (turni di copertura esclusi).");
                      }}
                    >
                      Imposta riposi mesi successivi
                    </button>
                    <button
                      style={styles.buttonSecondary}
                      onClick={toggleStatoMese}
                    >
                      {statoMese === "bozza" ? "Rendi Definitivo" : "Riporta a Bozza"}
                    </button>
                    <PulsanteSalva
                      onSalva={salvaTurni}
                      disabled={salvandoTurni}
                      styles={styles}
                      testo={salvandoTurni ? "Salvataggio…" : "Salva turni"}
                    />
                  </div>
                )}
              </div>

              <p style={{ fontSize: "11px", color: COLORI.muted, marginTop: "8px" }}>
                Lo stato Bozza/Definitivo riguarda solo {nomeMese}: ogni mese ha il proprio stato indipendente. "Assegna automaticamente" genera i turni solo per {nomeMese}: gli altri mesi non vengono toccati. Ogni click riparte da zero (i turni bloccati con 🔒 restano fissi, il resto viene ricalcolato e può variare). "Imposta riposi mesi successivi" pre-compila solo i giorni di riposo (non i turni di copertura) per i 12 mesi dopo quello visualizzato, applicando la stessa regola di rotazione — utile per fissare in anticipo i weekend/riposi anche se i turni veri e propri verranno assegnati più avanti. Le assegnazioni sul calendario restano solo su questo dispositivo finché non premi "Salva turni": solo allora diventano visibili a tutta la squadra.
              </p>

              {conflitti.length > 0 && (
                <div style={styles.avviso}>
                  <strong style={styles.avvisoTitolo}>Conflitti nell'assegnazione automatica</strong>
                  <ul style={{ fontSize: "12px", margin: "8px 0 0 18px", color: COLORI.ink }}>
                    {conflitti.map((c, i) => (
                      <li key={i}>{c.messaggio}</li>
                    ))}
                  </ul>
                </div>
              )}

              {violazioniSequenza.length > 0 && (
                <div style={styles.avviso}>
                  <strong style={styles.avvisoTitolo}>Sequenza da evitare (C2 seguito da A1)</strong>
                  <ul style={{ fontSize: "12px", margin: "8px 0 0 18px", color: COLORI.ink }}>
                    {violazioniSequenza.map((v, i) => {
                      const emp = dipendenti.find((d) => d.id === v.empId);
                      return (
                        <li key={i}>
                          {emp?.cognome}: C2 il {formattaData(v.giorno, mese, anno)}, A1 il {formattaData(v.giorno + 1, mese, anno)}. Modifica uno dei due turni.
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div style={{ overflowX: "auto", marginTop: "16px", borderRadius: "8px" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, position: "sticky", left: 0, zIndex: 2, textAlign: "left" }}>Dipendente</th>
                      {giorniArray.map((g) => (
                        <th key={g} style={{ ...styles.th, ...(eWeekend(anno, mese, g) ? styles.thWeekend : {}) }}>
                          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px", color: COLORI.ink }}>{g}</div>
                          <div style={{ fontSize: "9px", fontWeight: 400 }}>{nomeGiorno(anno, mese, g)}</div>
                        </th>
                      ))}
                      <th style={styles.th}>Gg lav.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dipendentiOperativi.map((d) => (
                      <tr key={d.id}>
                        <td style={{ ...styles.tdEmp, borderLeft: "none" }}>
                          <div
                            style={{ display: "flex", alignItems: "center", gap: "8px", cursor: isMobile ? "pointer" : "default" }}
                            onClick={isMobile ? () => toggleRigaCalendarioEspansa(d.id) : undefined}
                          >
                            <AvatarDipendente d={d} dimensione={26} />
                            {(!isMobile || righeCalendarioEspanse.has(d.id)) && (
                              <div>
                                {d.cognome} {d.nome}
                                <div style={{ fontSize: "10px", fontWeight: 500, color: COLORI.muted, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                  {TIPI_DIPENDENTE[d.tipo].label}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        {giorniArray.map((g) => {
                          const t = turni[kt(d.id, g)];
                          const weekend = eWeekend(anno, mese, g);
                          const selezionata = cellaSelezionata && cellaSelezionata.empId === d.id && cellaSelezionata.giorno === g;
                          const coloreTurno = t ? (TIPI_TURNO[t.code]?.colore || COLORI.muted) : null;
                          return (
                            <td
                              key={g}
                              className={isAdmin ? "cella-turno-editabile" : undefined}
                              style={{
                                ...styles.tdCell,
                                ...(weekend ? styles.tdCellWeekend : {}),
                                ...(selezionata ? styles.tdCellSelezionata : {}),
                                ...(selezionata && !t ? styles.tdCellSelezionataVuota : {}),
                              }}
                              onClick={() => {
                                if (!isAdmin) return;
                                setCellaSelezionata({ empId: d.id, giorno: g });
                              }}
                              title={t?.dnm ? "Turno bloccato (Do Not Move)" : ""}
                            >
                              {t ? (
                                <span style={styles.badgeCalendario(coloreTurno)}>
                                  {t.code}
                                  {t.dnm && <IconLucchetto dimensione={8} colore={testoContrastante(coloreTurno)} style={{ marginLeft: "2px" }} />}
                                </span>
                              ) : (
                                ""
                              )}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: "center", fontWeight: 700, fontFamily: "ui-monospace, monospace", borderBottom: `1px solid ${COLORI.hairline}` }}>{riepilogoOre[d.id] || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: "16px", fontSize: "11px", color: COLORI.muted, display: "flex", flexWrap: "wrap", gap: "10px 14px" }}>
                {Object.entries(TIPI_TURNO).map(([k, v]) => (
                  <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <span style={styles.badge(v.colore)}>{k}</span> {v.label} {v.orario && `(${v.orario})`}
                  </span>
                ))}
              </div>
            </div>

            {isAdmin && cellaSelezionata && (
              <div style={styles.card}>
                <h3 style={styles.sectionTitle}>
                  Modifica turno — {dipendenti.find((d) => d.id === cellaSelezionata.empId)?.cognome}, {formattaData(cellaSelezionata.giorno, mese, anno)}
                </h3>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "14px 0" }}>
                  {Object.keys(TIPI_TURNO).map((code) => (
                    <button
                      key={code}
                      style={{
                        ...styles.buttonSecondary,
                        background: TIPI_TURNO[code].colore,
                        color: testoContrastante(TIPI_TURNO[code].colore),
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: 700,
                      }}
                      onClick={() => impostaTurno(cellaSelezionata.empId, cellaSelezionata.giorno, code)}
                    >
                      {code}
                    </button>
                  ))}
                  <button style={styles.buttonSecondary} onClick={() => impostaTurno(cellaSelezionata.empId, cellaSelezionata.giorno, null)}>
                    Svuota
                  </button>
                </div>
                <CheckboxPersonalizzata
                  checked={!!turni[kt(cellaSelezionata.empId, cellaSelezionata.giorno)]?.dnm}
                  onChange={() => toggleDNM(cellaSelezionata.empId, cellaSelezionata.giorno)}
                  label={<><IconLucchetto dimensione={12} colore={COLORI.ink} style={{ marginRight: "4px" }} />Do Not Move (turno bloccato, non modificabile né scambiabile — resta fisso anche rigenerando l'assegnazione automatica)</>}
                />
                <div style={{ marginTop: "14px" }}>
                  <button style={styles.buttonSecondary} onClick={() => setCellaSelezionata(null)}>Chiudi</button>
                </div>
              </div>
            )}

            {isAdmin && avvisiSequenzaPreferibile.length > 0 && (
              <div style={styles.card}>
                <div style={styles.avvisoLieve}>
                  <strong style={styles.avvisoLieveTitolo}>Sequenza da preferire diversamente (non bloccante)</strong>
                  <p style={{ fontSize: "11px", color: COLORI.muted, margin: "4px 0 12px" }}>
                    Visibile solo agli admin. "Correggi" scambia o riassegna automaticamente il turno per risolvere, senza lasciare nessuno scoperto.
                  </p>
                  {Object.entries(
                    avvisiSequenzaPreferibile.reduce((acc, v) => {
                      (acc[v.empId] = acc[v.empId] || []).push(v);
                      return acc;
                    }, {})
                  ).map(([empId, elenco]) => {
                    const emp = dipendenti.find((d) => d.id === Number(empId));
                    return (
                      <div key={empId} style={{ marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          {emp && <AvatarDipendente d={emp} dimensione={20} />}
                          <strong style={{ fontSize: "12.5px", color: COLORI.ink }}>{emp?.cognome} {emp?.nome}</strong>
                        </div>
                        <ul style={{ fontSize: "12px", margin: 0, padding: 0, listStyle: "none", color: COLORI.ink }}>
                          {elenco.map((v, i) => (
                            <li key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "5px 0 5px 28px" }}>
                              <span>{v.oggi} il {formattaData(v.giorno, mese, anno)} → {v.domani} il {formattaData(v.giorno + 1, mese, anno)}</span>
                              <button
                                style={{ ...styles.buttonSecondary, padding: "4px 12px", fontSize: "11px" }}
                                title="Scambia o riassegna automaticamente per risolvere, senza lasciare il turno scoperto"
                                onClick={() => correggiSequenza(v)}
                              >
                                Correggi
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Riepilogo turni per tipo — {nomeMese}</h3>
              <p style={{ fontSize: "12px", color: COLORI.muted, marginTop: "4px", marginBottom: "12px" }}>
                Giorni di A1, A2, C1, C2 e N fatti da ciascun dipendente questo mese — utile per verificare l'equilibrio tra mattine e pomeriggi/sere.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...styles.table, fontSize: "13px" }}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, textAlign: "left" }}>Dipendente</th>
                      {CODICI_RECAP.map((code) => (
                        <th key={code} style={styles.th}>
                          <span style={styles.badge(TIPI_TURNO[code].colore)}>{code}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dipendentiOperativi.map((d) => (
                      <tr key={d.id}>
                        <td style={{ padding: "8px 10px", borderBottom: `1px solid ${COLORI.hairline}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <AvatarDipendente d={d} dimensione={24} />
                            {d.cognome} {d.nome}
                          </div>
                        </td>
                        {CODICI_RECAP.map((code) => (
                          <td key={code} style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", borderBottom: `1px solid ${COLORI.hairline}` }}>
                            {recapTurniTipo[d.id]?.[code] || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === "mieiturni" && (
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={styles.sectionTitle}>I miei turni</h3>
                <p style={{ fontSize: "12px", color: COLORI.muted, marginTop: "2px" }}>
                  {empCorrente?.cognome} {empCorrente?.nome} · {TIPI_DIPENDENTE[empCorrente?.tipo]?.label}
                </p>
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button
                  style={styles.navFreccia}
                  onClick={() => {
                    if (meseMiei === 0) { setMeseMiei(11); setAnnoMiei((a) => a - 1); }
                    else setMeseMiei((m) => m - 1);
                  }}
                >
                  ←
                </button>
                <strong style={{ textTransform: "capitalize", fontSize: "16px", fontWeight: 700 }}>
                  {new Date(annoMiei, meseMiei, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                </strong>
                <button
                  style={styles.navFreccia}
                  onClick={() => {
                    if (meseMiei === 11) { setMeseMiei(0); setAnnoMiei((a) => a + 1); }
                    else setMeseMiei((m) => m + 1);
                  }}
                >
                  →
                </button>
              </div>
              <button
                type="button"
                style={styles.buttonSecondary}
                onClick={() => esportaCalendarioICS(empCorrente, annoMiei)}
                title="Scarica i turni di questo anno in un file .ics da importare in Google/Outlook/Proton Calendar"
              >
                Esporta calendario ({annoMiei}) ⬇
              </button>
            </div>

            <div style={styles.grigliaMensile}>
              {GIORNI_SETTIMANA.map((g) => (
                <div key={g} style={styles.grigliaMensileIntestazione}>{g}</div>
              ))}
              {generaGrigliaMese(annoMiei, meseMiei).map((cella, i) => {
                const oggiReale = new Date();
                const eOggi = !cella.fuoriMese && cella.anno === oggiReale.getFullYear() && cella.mese === oggiReale.getMonth() && cella.giorno === oggiReale.getDate();
                const t = empCorrente ? turni[keyTurno(empCorrente.id, cella.anno, cella.mese, cella.giorno)] : null;
                const coloreTurno = t && !cella.fuoriMese ? (TIPI_TURNO[t.code]?.colore || COLORI.muted) : null;
                return (
                  <div key={i} style={styles.cellaGiornoMensile(cella.fuoriMese, eOggi)}>
                    <span style={{ fontSize: "11px", fontWeight: eOggi ? 700 : 500, color: eOggi ? COLORI.teal : COLORI.muted, fontFamily: "ui-monospace, monospace" }}>
                      {cella.giorno}
                    </span>
                    {t && !cella.fuoriMese && (
                      <span style={styles.badgeCalendario(coloreTurno)}>
                        {t.code}{t.dnm && <IconLucchetto dimensione={8} colore={testoContrastante(coloreTurno)} style={{ marginLeft: "2px" }} />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "18px", display: "flex", flexWrap: "wrap", gap: "10px 14px" }}>
              {Object.entries(TIPI_TURNO).map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: COLORI.muted }}>
                  <span style={styles.badge(v.colore)}>{k}</span> {v.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {tab === "dipendenti" && isAdmin && (
          <SchedaDipendenti dipendenti={dipendentiOperativi} turni={turni} onRicarica={ricaricaDipendenti} styles={styles} />
        )}

        {tab === "copertura" && isAdmin && (
          <>
            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Regole di copertura giornaliera</h3>
              <p style={{ fontSize: "13px", color: COLORI.muted, marginTop: "6px" }}>
                Numero di dipendenti richiesti per ciascun turno, ogni giorno. Modifica le quantità o aggiungi/rimuovi turni dalla copertura richiesta.
              </p>

              <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "16px" }}>
                {Object.entries(coperturaRegole).map(([code, qty]) => (
                  <div key={code} style={{ background: COLORI.mist, borderRadius: "14px", padding: "14px 16px", textAlign: "center", minWidth: "92px", position: "relative" }}>
                    <button
                      onClick={() => rimuoviRegolaCopertura(code)}
                      title="Rimuovi questa regola"
                      style={{ position: "absolute", top: "6px", right: "6px", border: "none", background: "transparent", color: COLORI.muted, cursor: "pointer", fontSize: "13px", lineHeight: 1, padding: "2px" }}
                    >
                      ✕
                    </button>
                    <span style={styles.badge(TIPI_TURNO[code]?.colore || COLORI.muted)}>{code}</span>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "8px" }}>
                      <button style={styles.datePickerFreccia} onClick={() => aggiornaQuantitaRegola(code, qty - 1)}>−</button>
                      <span style={{ fontSize: "20px", fontWeight: 700, fontFamily: "'Roboto', sans-serif", minWidth: "18px" }}>{qty}</span>
                      <button style={styles.datePickerFreccia} onClick={() => aggiornaQuantitaRegola(code, qty + 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: `1px solid ${COLORI.hairline}` }}>
                <label style={styles.label}>Aggiungi regola</label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "6px" }}>
                  <select style={styles.select} value={nuovoCodiceRegola} onChange={(e) => setNuovoCodiceRegola(e.target.value)}>
                    <option value="">Seleziona turno...</option>
                    {Object.keys(TIPI_TURNO)
                      .filter((c) => !["R", "F", "P", "D1", "D2", "F1", "F2"].includes(c) && coperturaRegole[c] === undefined)
                      .map((c) => (
                        <option key={c} value={c}>{c} — {TIPI_TURNO[c].label}</option>
                      ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="9"
                    style={{ ...styles.input, width: "70px" }}
                    value={nuovaQuantitaRegola}
                    onChange={(e) => setNuovaQuantitaRegola(Number(e.target.value))}
                  />
                  <button
                    style={styles.button}
                    disabled={!nuovoCodiceRegola}
                    onClick={() => {
                      aggiungiRegolaCopertura(nuovoCodiceRegola, nuovaQuantitaRegola);
                      setNuovoCodiceRegola("");
                      setNuovaQuantitaRegola(1);
                    }}
                  >
                    Aggiungi
                  </button>
                </div>
                <p style={{ fontSize: "11px", color: COLORI.muted, marginTop: "8px" }}>
                  D1/D2/F1/F2 non sono aggiungibili qui: sono gestiti automaticamente in base a chi è Direttore/FOM (vedi le regole sotto). Bozza: le quantità sono uguali per tutti i giorni del mese, non ancora personalizzabili giorno per giorno.
                </p>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Regole assolute</h3>
              <p style={{ fontSize: "12px", color: COLORI.muted, marginTop: "4px", marginBottom: "6px" }}>
                Vincoli rigidi e indipendenti tra loro: se disattivate, l'assegnazione automatica smette di applicarle senza eccezioni. Non hanno un ordine di priorità da spostare (a differenza delle regole di preferenza sotto): sono controlli distinti, non criteri in competizione fra loro.
              </p>
              <div>
                {[
                  { chiave: "sequenzaC2A1Vietata", testo: <><strong>Sequenza vietata:</strong> un turno C2 non è mai seguito da A1 il giorno dopo.</> },
                  { chiave: "prioritaNotturno", testo: <><strong>Priorità sulla notte (N):</strong> sempre al notturno titolare; il turnante copre solo quando il notturno è a riposo/ferie e solo nei suoi ultimi 2 giorni di lavoro prima del riposo; se anche il turnante non può, tocca al backup.</> },
                  { chiave: "riposoTurnanteDopoNotturno", testo: <><strong>Riposo del turnante:</strong> riposa sempre subito DOPO il notturno (stessa coppia di giorni, spostata di uno).</> },
                  { chiave: "direttoreD1D2Auto", testo: <><strong>Direzione (D1/D2):</strong> nei giorni non di riposo, il Direttore fa sempre automaticamente D1 o D2, alternati per equilibrio.</> },
                  { chiave: "fomF1F2Auto", testo: <><strong>FOM (F1/F2):</strong> nei giorni non di riposo, la FOM fa F1 o F2 — a meno che quel giorno non serva come riserva per un turno diurno scoperto.</> },
                  { chiave: "ceAutomatico", testo: <><strong>Turno Centrale (CE):</strong> assegnato automaticamente ai diurni/turnanti che restano liberi quel giorno, una volta coperti tutti gli altri turni.</> },
                ].map(({ chiave, testo }) => (
                  <div key={chiave} style={styles.rigaRegola}>
                    <span style={{ fontSize: "13px", lineHeight: 1.6, color: COLORI.ink }}>{testo}</span>
                    <button style={styles.toggleTraccia(regoleAttive[chiave])} onClick={() => toggleRegola(chiave)}>
                      <span style={styles.toggleCerchio(regoleAttive[chiave])} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Regole di preferenza</h3>
              <p style={{ fontSize: "12px", color: COLORI.muted, marginTop: "4px", marginBottom: "6px" }}>
                Criteri di equilibrio: usati in ordine per scegliere fra più candidati validi (ma non bloccano mai una copertura se disattivati). Usa le frecce per cambiare quale criterio ha la precedenza.
              </p>
              <div>
                {ordineRegolePreferenza.map((chiave, indice) => {
                  const TESTI_REGOLA_PREFERENZA = {
                    sequenzaPreferibileEvitata: <><strong>Sequenza da evitare:</strong> C1→A1 e C2→A2 vengono evitate quando possibile, usate solo se non c'è alternativa.</>,
                    equitaSequenzeScomode: <><strong>Equità sulle sequenze scomode:</strong> chi ha ricevuto meno C1→A1/C2→A2 finora nel mese viene preferito.</>,
                    equilibrioMattinaPomeriggio: <><strong>Equilibrio mattina/pomeriggio:</strong> la distribuzione di mattine (A1/A2) e pomeriggi/sere (C1/C2) viene bilanciata nel corso del mese.</>,
                    variazioneSettimanale: <><strong>Variazione settimanale:</strong> evita di assegnare lo stesso turno più volte alla stessa persona nella stessa settimana.</>,
                    preferenzePersonali: <><strong>Preferenze personali:</strong> tiene conto dell'ordine di preferenza turni indicato da ciascun dipendente.</>,
                  };
                  return (
                    <div key={chiave} style={styles.rigaRegola}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: COLORI.muted, width: "18px", flexShrink: 0 }}>{indice + 1}°</span>
                      <span style={{ fontSize: "13px", lineHeight: 1.6, color: COLORI.ink, flex: 1 }}>{TESTI_REGOLA_PREFERENZA[chiave]}</span>
                      <button
                        style={{ border: "none", background: COLORI.mist, borderRadius: "6px", width: "24px", height: "24px", cursor: indice === 0 ? "default" : "pointer", opacity: indice === 0 ? 0.4 : 1, marginRight: "4px" }}
                        onClick={() => spostaRegolaPreferenza(chiave, -1)}
                        disabled={indice === 0}
                      >
                        ↑
                      </button>
                      <button
                        style={{ border: "none", background: COLORI.mist, borderRadius: "6px", width: "24px", height: "24px", cursor: indice === ordineRegolePreferenza.length - 1 ? "default" : "pointer", opacity: indice === ordineRegolePreferenza.length - 1 ? 0.4 : 1, marginRight: "10px" }}
                        onClick={() => spostaRegolaPreferenza(chiave, 1)}
                        disabled={indice === ordineRegolePreferenza.length - 1}
                      >
                        ↓
                      </button>
                      <button style={styles.toggleTraccia(regoleAttive[chiave])} onClick={() => toggleRegola(chiave)}>
                        <span style={styles.toggleCerchio(regoleAttive[chiave])} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === "preferenze" && (
          <SchedaPreferenze empCorrente={empCorrente} preferenze={preferenze} onSalva={aggiornaPreferenza} styles={styles} />
        )}

        {tab === "swap" && (
          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>Richiedi cambio turno</h3>
            <p style={{ fontSize: "13px", color: COLORI.muted, marginTop: "6px" }}>
              Scegli un giorno e vedi subito il tuo turno e quello di ogni collega quel giorno, per proporre uno scambio in base al turno che ti serve. Resta soggetto a conferma del collega e, a mese Definitivo, dell'admin.
            </p>
            <div style={{ marginTop: "14px" }}>
              <RichiediSwapForm
                empCorrente={empCorrente}
                dipendenti={dipendentiOperativi}
                annoCorrente={anno}
                meseCorrente={mese}
                turni={turni}
                richiesteSwap={richiesteSwap}
                onRichiedi={richiediSwap}
                keyTurno={keyTurno}
                styles={styles}
                onVaiAPreassegnazioni={() => setTab("preassegnazioni")}
              />
            </div>
            <h4 style={{ fontSize: "13px", color: COLORI.muted, textTransform: "uppercase", letterSpacing: "0.03em", marginTop: "20px" }}>Richieste</h4>
            {richiesteSwap.length === 0 && <p style={{ fontSize: "13px", color: COLORI.muted }}>Nessuna richiesta.</p>}
            {richiesteSwap.map((r) => {
              const da = dipendenti.find((d) => d.id === r.daEmpId);
              const a = dipendenti.find((d) => d.id === r.aEmpId);
              const riguardaMe = r.aEmpId === empCorrente.id;
              const ETICHETTE_STATO = {
                [STATI_SWAP.IN_ATTESA_COLLEGA]: "in attesa del collega",
                [STATI_SWAP.ACCETTATA_COLLEGA]: "accettata dal collega",
                [STATI_SWAP.IN_ATTESA_ADMIN]: "in attesa dell'admin (mese Definitivo)",
                [STATI_SWAP.APPROVATA_ADMIN]: "approvata dall'admin",
                [STATI_SWAP.APPLICATA]: "applicata",
                [STATI_SWAP.RIFIUTATA_COLLEGA]: "rifiutata dal collega",
                [STATI_SWAP.RIFIUTATA_ADMIN]: "rifiutata dall'admin",
              };
              return (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${COLORI.hairline}`, fontSize: "13px" }}>
                  <span>
                    {da?.cognome} ({formattaData(r.giornoDa, r.meseDa, r.annoDa)}{r.turnoDa ? `, turno ${r.turnoDa}` : ""}) ↔{" "}
                    {a?.cognome} ({formattaData(r.giornoA, r.meseA, r.annoA)}{r.turnoA ? `, turno ${r.turnoA}` : ""}) — <em style={{ color: COLORI.muted }}>{ETICHETTE_STATO[r.stato] || r.stato}</em>
                    {r.notaSistema && <><br /><span style={{ fontSize: "11px", color: "#8A4A2B" }}>{r.notaSistema}</span></>}
                    {r.motivoRifiuto && <><br /><em style={{ fontSize: "11px", color: COLORI.avvisoTesto }}>Motivo: {r.motivoRifiuto}</em></>}
                  </span>
                  {riguardaMe && r.stato === STATI_SWAP.IN_ATTESA_COLLEGA && (
                    <span style={{ display: "flex", gap: "6px" }}>
                      <button style={styles.buttonSecondary} onClick={() => rispondiSwapCollega(r.id, true)}>Accetta</button>
                      <button style={styles.buttonSecondary} onClick={() => rispondiSwapCollega(r.id, false)}>Rifiuta</button>
                    </span>
                  )}
                  {isAdmin && r.stato === STATI_SWAP.IN_ATTESA_ADMIN && (
                    <span style={{ display: "flex", gap: "6px" }}>
                      <button style={styles.buttonSecondary} onClick={() => rispondiSwapAdmin(r.id, true)}>Approva</button>
                      <button style={styles.buttonSecondary} onClick={() => { const motivo = richiediMotivoRifiuto(); if (motivo) rispondiSwapAdmin(r.id, false, motivo); }}>Rifiuta</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "assenze" && (
          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>Ferie e permessi</h3>
            <p style={{ fontSize: "13px", color: COLORI.muted, marginTop: "6px" }}>
              Richiedi ferie o un permesso su un giorno specifico, anche di un mese diverso da quello visualizzato nel calendario. Resta soggetto a conferma dell'admin (Direttore o FOM).
            </p>
            <div style={{ marginTop: "14px" }}>
              <RichiediAssenzaForm empCorrente={empCorrente} annoCorrente={anno} meseCorrente={mese} onRichiedi={richiediAssenza} styles={styles} />
            </div>
            <h4 style={{ fontSize: "13px", color: COLORI.muted, textTransform: "uppercase", letterSpacing: "0.03em", marginTop: "20px" }}>
              {isAdmin ? "Tutte le richieste" : "Le mie richieste"}
            </h4>
            {richiesteAssenza
              .filter((r) => isAdmin || r.empId === empCorrente.id)
              .map((r) => {
                const emp = dipendenti.find((d) => d.id === r.empId);
                return (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${COLORI.hairline}`, fontSize: "13px" }}>
                    <span>
                      {emp?.cognome} — {r.tipo === "F" ? "Ferie" : "Permesso"}, {formattaData(r.giorno, r.mese, r.anno)}
                      {r.turnoInteressato ? `, turno ${r.turnoInteressato}` : " (giornata intera)"}
                      {r.ore ? `, ${r.ore}h` : ""}
                      {r.oraInizio && r.oraFine ? ` (${r.oraInizio}-${r.oraFine})` : ""}
                      {r.nota ? <><br /><em style={{ color: COLORI.muted }}>Nota: {r.nota}</em></> : null}
                      {" — "}<em style={{ color: COLORI.muted }}>{r.stato}</em>
                      {r.motivoRifiuto ? <><br /><em style={{ color: COLORI.avvisoTesto }}>Motivo: {r.motivoRifiuto}</em></> : null}
                    </span>
                    {isAdmin && r.stato === "in sospeso" && (
                      <span style={{ display: "flex", gap: "6px" }}>
                        <button style={styles.buttonSecondary} onClick={() => gestisciAssenza(r.id, "approvata")}>Approva</button>
                        <button style={styles.buttonSecondary} onClick={() => { const motivo = richiediMotivoRifiuto(); if (motivo) gestisciAssenza(r.id, "rifiutata", motivo); }}>Rifiuta</button>
                      </span>
                    )}
                  </div>
                );
              })}
            {richiesteAssenza.filter((r) => isAdmin || r.empId === empCorrente.id).length === 0 && (
              <p style={{ fontSize: "13px", color: COLORI.muted }}>Nessuna richiesta.</p>
            )}

            <h4 style={{ fontSize: "13px", color: COLORI.muted, textTransform: "uppercase", letterSpacing: "0.03em", marginTop: "24px" }}>
              Ferie e permessi rimanenti — {anno}
            </h4>
            <p style={{ fontSize: "11px", color: COLORI.muted, marginTop: "2px", marginBottom: "10px" }}>
              Calcolati sulle ferie già impostate a calendario in tutto l'anno e sui permessi con richiesta approvata. Quote annue di bozza (26 giorni ferie, 88 ore permessi): da rendere modificabili in seguito.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...styles.table, fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, textAlign: "left" }}>Dipendente</th>
                    <th style={styles.th}>Ferie usate</th>
                    <th style={styles.th}>Ferie residue</th>
                    <th style={styles.th}>Permessi usati (h)</th>
                    <th style={styles.th}>Permessi residui (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {dipendentiOperativi.filter((d) => isAdmin || d.id === empCorrente.id).map((d) => {
                    const r = recapFeriePermessi[d.id] || {};
                    return (
                      <tr key={d.id}>
                        <td style={{ padding: "8px 10px", borderBottom: `1px solid ${COLORI.hairline}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <AvatarDipendente d={d} dimensione={24} />
                            {d.cognome} {d.nome}
                          </div>
                        </td>
                        <td style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", borderBottom: `1px solid ${COLORI.hairline}` }}>{r.ferieUsate ?? 0}</td>
                        <td style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", borderBottom: `1px solid ${COLORI.hairline}` }}>{r.ferieResidue ?? QUOTA_FERIE_DEFAULT}</td>
                        <td style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", borderBottom: `1px solid ${COLORI.hairline}` }}>{r.permessiOreUsate ?? 0}</td>
                        <td style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", borderBottom: `1px solid ${COLORI.hairline}` }}>{r.permessiOreResidue ?? QUOTA_PERMESSI_ORE_DEFAULT}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "preassegnazioni" && (
          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>Pre-assegnazione turni</h3>
            <p style={{ fontSize: "13px", color: COLORI.muted, marginTop: "6px" }}>
              {isAdmin
                ? "Assegna direttamente un turno specifico (o un giorno libero) a un dipendente, anche di un mese diverso da quello visualizzato: viene applicato subito, senza bisogno di conferma, e si blocca automaticamente (🔒 Do Not Move)."
                : "Proponi di esserti assegnato un turno specifico (o un giorno libero) in un giorno specifico, anche di un mese diverso da quello visualizzato nel calendario. Resta soggetto a conferma dell'admin (Direttore o FOM); una volta accettata, il turno viene bloccato automaticamente (🔒 Do Not Move)."}
            </p>
            <div style={{ marginTop: "14px" }}>
              <RichiediPreassegnazioneForm empCorrente={empCorrente} dipendenti={dipendentiOperativi} isAdmin={isAdmin} annoCorrente={anno} meseCorrente={mese} onRichiedi={richiediPreassegnazione} styles={styles} />
            </div>
            <h4 style={{ fontSize: "13px", color: COLORI.muted, textTransform: "uppercase", letterSpacing: "0.03em", marginTop: "20px" }}>
              {isAdmin ? "Tutte le richieste" : "Le mie richieste"}
            </h4>
            {richiestePreassegnazione
              .filter((r) => isAdmin || r.empId === empCorrente.id)
              .map((r) => {
                const emp = dipendenti.find((d) => d.id === r.empId);
                return (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${COLORI.hairline}`, fontSize: "13px" }}>
                    <span>
                      {emp?.cognome} — {r.turno === "LIBERO" ? "giorno libero" : `turno ${r.turno}`}, {formattaData(r.giorno, r.mese, r.anno)}
                      {r.nota ? <><br /><em style={{ color: COLORI.muted }}>Nota: {r.nota}</em></> : null}
                      {" — "}<em style={{ color: COLORI.muted }}>{r.stato === "approvata" ? "assegnata" : r.stato}</em>
                      {r.motivoRifiuto ? <><br /><em style={{ color: COLORI.avvisoTesto }}>Motivo: {r.motivoRifiuto}</em></> : null}
                    </span>
                    {isAdmin && r.stato === "in sospeso" && (
                      <span style={{ display: "flex", gap: "6px" }}>
                        <button style={styles.buttonSecondary} onClick={() => gestisciPreassegnazione(r.id, "approvata")}>Approva</button>
                        <button style={styles.buttonSecondary} onClick={() => { const motivo = richiediMotivoRifiuto(); if (motivo) gestisciPreassegnazione(r.id, "rifiutata", motivo); }}>Rifiuta</button>
                      </span>
                    )}
                  </div>
                );
              })}
            {richiestePreassegnazione.filter((r) => isAdmin || r.empId === empCorrente.id).length === 0 && (
              <p style={{ fontSize: "13px", color: COLORI.muted }}>Nessuna richiesta.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SelettoreOra({ valore, onChange, styles }) {
  const [oreVal, minVal] = valore ? valore.split(":") : ["", ""];
  const ORE = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const MINUTI = ["00", "15", "30", "45"];

  return (
    <div style={styles.gruppoOra}>
      <select
        style={styles.selectOra}
        value={oreVal}
        onChange={(e) => onChange(`${e.target.value}:${minVal || "00"}`)}
      >
        <option value="">--</option>
        {ORE.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span style={{ color: COLORI.muted, fontWeight: 700 }}>:</span>
      <select
        style={styles.selectOra}
        value={minVal}
        onChange={(e) => onChange(`${oreVal || "00"}:${e.target.value}`)}
      >
        <option value="">--</option>
        {MINUTI.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

function DatePicker({ anno, mese, giorno, onChange, annoCorrente, styles }) {
  const [aperto, setAperto] = useState(false);
  const [selettoreAnno, setSelettoreAnno] = useState(false);
  const [vistaAnno, setVistaAnno] = useState(anno);
  const [vistaMese, setVistaMese] = useState(mese);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    function chiudiSeFuori(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setAperto(false);
        setSelettoreAnno(false);
      }
    }
    document.addEventListener("mousedown", chiudiSeFuori);
    return () => document.removeEventListener("mousedown", chiudiSeFuori);
  }, []);

  function apri() {
    setVistaAnno(anno);
    setVistaMese(mese);
    setSelettoreAnno(false);
    setAperto((v) => !v);
  }

  function meseSuccessivo() {
    if (vistaMese === 11) { setVistaMese(0); setVistaAnno((a) => a + 1); }
    else setVistaMese((m) => m + 1);
  }
  function mesePrecedente() {
    if (vistaMese === 0) { setVistaMese(11); setVistaAnno((a) => a - 1); }
    else setVistaMese((m) => m - 1);
  }

  const celle = generaGrigliaMese(vistaAnno, vistaMese);
  const nomeMeseVista = new Date(vistaAnno, vistaMese, 1).toLocaleDateString("it-IT", { month: "long" });

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" style={styles.datePickerTrigger} onClick={apri}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={COLORI.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="3" />
          <line x1="3" y1="9.5" x2="21" y2="9.5" />
          <line x1="7.5" y1="2.5" x2="7.5" y2="6.5" />
          <line x1="16.5" y1="2.5" x2="16.5" y2="6.5" />
        </svg>
        <span>{formattaData(giorno, mese, anno)}</span>
      </button>
      {aperto && (
        <div style={styles.datePickerPannello}>
          <div style={styles.datePickerHeader}>
            <button type="button" style={styles.datePickerFreccia} onClick={mesePrecedente}>‹</button>
            <button type="button" style={styles.datePickerMeseAnno} onClick={() => setSelettoreAnno((v) => !v)}>
              {nomeMeseVista} {vistaAnno}
            </button>
            <button type="button" style={styles.datePickerFreccia} onClick={meseSuccessivo}>›</button>
          </div>

          {selettoreAnno && (
            <div style={styles.datePickerAnniRiga}>
              {[annoCorrente - 1, annoCorrente, annoCorrente + 1].map((a) => (
                <button
                  key={a}
                  type="button"
                  style={styles.datePickerAnnoBtn(a === vistaAnno)}
                  onClick={() => { setVistaAnno(a); setSelettoreAnno(false); }}
                >
                  {a}
                </button>
              ))}
            </div>
          )}

          <div style={styles.datePickerGrigliaSettimana}>
            {GIORNI_SETTIMANA.map((g) => (
              <div key={g} style={styles.datePickerGiornoSettimana}>{g}</div>
            ))}
          </div>
          <div style={styles.datePickerGriglia}>
            {celle.map((c, i) => {
              const selezionato = !c.fuoriMese && c.anno === anno && c.mese === mese && c.giorno === giorno;
              return (
                <button
                  key={i}
                  type="button"
                  style={styles.datePickerGiorno(c.fuoriMese, selezionato)}
                  onClick={() => {
                    onChange(c.anno, c.mese, c.giorno);
                    setAperto(false);
                  }}
                >
                  {c.giorno}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RichiediSwapForm({ empCorrente, dipendenti, annoCorrente, meseCorrente, turni, richiesteSwap, onRichiedi, keyTurno, styles, onVaiAPreassegnazioni }) {
  const [anno, setAnno] = useState(annoCorrente);
  const [mese, setMese] = useState(meseCorrente);
  const [giorno, setGiorno] = useState(1);
  const [collega, setCollega] = useState("");

  const giornoSicuro = Math.min(giorno, giorniDelMese(anno, mese));

  const mioTurno = turni[keyTurno(empCorrente.id, anno, mese, giornoSicuro)];
  const ieri = giornoPrecedente(anno, mese, giornoSicuro);
  const mioTurnoIeri = turni[keyTurno(empCorrente.id, ieri.anno, ieri.mese, ieri.giorno)];

  const turnoCollega = collega ? turni[keyTurno(Number(collega), anno, mese, giornoSicuro)] : null;

  // quante volte ciascun collega ha accettato/rifiutato una richiesta di cambio ricevuta finora
  // (conta "applicata" come accettata: è l'esito finale positivo, sia in Bozza che dopo
  // l'eventuale approvazione admin in Definitivo)
  function statSwap(empId) {
    let accettati = 0, rifiutati = 0;
    (richiesteSwap || []).forEach((r) => {
      if (r.aEmpId === empId) {
        if (r.stato === STATI_SWAP.APPLICATA || r.stato === STATI_SWAP.ACCETTATA_COLLEGA || r.stato === STATI_SWAP.APPROVATA_ADMIN) accettati++;
        if (r.stato === STATI_SWAP.RIFIUTATA_COLLEGA) rifiutati++;
      }
    });
    return { accettati, rifiutati };
  }

  return (
    <div>
      <div style={{ marginBottom: "6px" }}>
        <label style={styles.label}>Giorno</label>
        <p style={{ fontSize: "12px", color: COLORI.muted, margin: "2px 0 0" }}>
          Scegli la data: sotto vedi subito il tuo turno e quello di ogni collega quel giorno, per scegliere in base al turno che ti serve.
        </p>
      </div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "8px" }}>
        <DatePicker anno={anno} mese={mese} giorno={giorno} onChange={(a, m, g) => { setAnno(a); setMese(m); setGiorno(g); setCollega(""); }} annoCorrente={annoCorrente} styles={styles} />
        <div style={{ fontSize: "11px", color: "#6B7680", paddingBottom: "9px" }}>
          {mioTurno ? <>Il mio turno: {mioTurno.code}{mioTurno.dnm && <IconLucchetto dimensione={9} style={{ marginLeft: "3px" }} />}</> : "Non ho ancora un turno assegnato in questa data"}
          <br />
          <span style={{ color: COLORI.muted }}>Il giorno prima: {mioTurnoIeri ? mioTurnoIeri.code : "—"}</span>
        </div>
      </div>

      <div style={{ margin: "18px 0 10px" }}>
        <label style={styles.label}>Con chi vuoi scambiare</label>
      </div>
      <div>
        {dipendenti.filter((d) => d.id !== empCorrente.id).map((d) => {
          const t = turni[keyTurno(d.id, anno, mese, giornoSicuro)];
          const tIeri = turni[keyTurno(d.id, ieri.anno, ieri.mese, ieri.giorno)];
          const { accettati, rifiutati } = statSwap(d.id);
          const selezionato = collega === String(d.id);
          const disabilitato = !t || t.dnm;
          return (
            <button
              type="button"
              key={d.id}
              style={styles.rigaCollega(selezionato, disabilitato)}
              disabled={disabilitato}
              onClick={() => setCollega(String(d.id))}
            >
              <AvatarDipendente d={d} dimensione={26} />
              <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: COLORI.ink }}>{d.cognome} {d.nome}</span>
              <span style={{ fontSize: "11px", color: COLORI.muted, minWidth: "90px" }}>ieri: {tIeri ? tIeri.code : "—"}</span>
              {t ? (
                <span style={styles.badge(TIPI_TURNO[t.code]?.colore || COLORI.muted)}>{t.code}{t.dnm ? <IconLucchetto dimensione={9} style={{ marginLeft: "3px" }} /> : ""}</span>
              ) : (
                <span style={{ fontSize: "11px", color: COLORI.muted }}>nessun turno</span>
              )}
              <span style={{ fontSize: "10.5px", color: COLORI.muted, minWidth: "110px", textAlign: "right" }}>
                ✓ {accettati} · ✕ {rifiutati}
              </span>
            </button>
          );
        })}
      </div>

      <button
        style={{ ...styles.button, marginTop: "10px" }}
        disabled={!collega || !mioTurno || !turnoCollega || mioTurno?.dnm || turnoCollega?.dnm}
        onClick={() => {
          onRichiedi(empCorrente.id, anno, mese, giornoSicuro, Number(collega), anno, mese, giornoSicuro);
          setCollega("");
        }}
      >
        Invia richiesta
      </button>
      {(mioTurno?.dnm || turnoCollega?.dnm) && (
        <p style={{ fontSize: "12px", color: "#8A4A2B", marginTop: "10px" }}>🔒 Uno dei due turni è bloccato, non scambiabile.</p>
      )}
      {!mioTurno && (
        <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <p style={{ fontSize: "12px", color: "#8A4A2B", margin: 0 }}>
            Non è possibile scambiare un turno che non esiste ancora. Il tuo giorno non ha ancora un turno assegnato: serve prima una pre-assegnazione.
          </p>
          {onVaiAPreassegnazioni && (
            <button type="button" style={styles.buttonSecondary} onClick={onVaiAPreassegnazioni}>
              Vai a Pre-assegnazioni
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RichiediAssenzaForm({ empCorrente, annoCorrente, meseCorrente, onRichiedi, styles }) {
  const [anno, setAnno] = useState(annoCorrente);
  const [mese, setMese] = useState(meseCorrente);
  const [giorno, setGiorno] = useState(1);
  const [tipo, setTipo] = useState("F");
  const [turnoInteressato, setTurnoInteressato] = useState("");
  const [ore, setOre] = useState("");
  const [oraInizio, setOraInizio] = useState("");
  const [oraFine, setOraFine] = useState("");
  const [nota, setNota] = useState("");

  const turniAmmessi = turniAmmessiDipendente(empCorrente);
  const numGiorniMese = giorniDelMese(anno, mese);
  const giornoSicuro = Math.min(giorno, numGiorniMese);

  function invia() {
    onRichiedi(empCorrente.id, giornoSicuro, anno, mese, tipo, turnoInteressato || null, {
      ore: ore ? Number(ore) : null,
      oraInizio,
      oraFine,
      nota,
    });
    setOre("");
    setOraInizio("");
    setOraFine("");
    setNota("");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={styles.label}>Giorno</label>
          <DatePicker anno={anno} mese={mese} giorno={giorno} onChange={(a, m, g) => { setAnno(a); setMese(m); setGiorno(g); }} annoCorrente={annoCorrente} styles={styles} />
        </div>
        <div>
          <label style={styles.label}>Tipo</label>
          <select style={styles.select} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="F">Ferie</option>
            <option value="P">Permesso</option>
          </select>
        </div>
        <div>
          <label style={styles.label}>Turno interessato</label>
          <select style={styles.select} value={turnoInteressato} onChange={(e) => setTurnoInteressato(e.target.value)}>
            <option value="">Giornata intera</option>
            {turniAmmessi.map((code) => (
              <option key={code} value={code}>{code} ({TIPI_TURNO[code].orario})</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "14px" }}>
        {tipo === "P" && (
          <>
            <div>
              <label style={styles.label}>Ore richieste</label>
              <input
                type="number"
                min="0"
                step="0.5"
                style={{ ...styles.input, width: "80px" }}
                value={ore}
                onChange={(e) => setOre(e.target.value)}
                placeholder="es. 4"
              />
            </div>
            <div>
              <label style={styles.label}>Dalle</label>
              <SelettoreOra valore={oraInizio} onChange={setOraInizio} styles={styles} />
            </div>
            <div>
              <label style={styles.label}>Alle</label>
              <SelettoreOra valore={oraFine} onChange={setOraFine} styles={styles} />
            </div>
          </>
        )}
        <div style={{ flex: 1, minWidth: "180px" }}>
          <label style={styles.label}>Nota (facoltativa)</label>
          <input
            type="text"
            style={styles.input}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="es. visita medica"
          />
        </div>
        <button style={styles.button} onClick={invia}>
          Invia richiesta
        </button>
      </div>
      <p style={{ fontSize: "11px", color: "#6B7680", marginTop: "10px" }}>
        Se il permesso copre solo una parte del turno, indica ore e orario e a quale turno si riferisce; altrimenti lascia "Giornata intera".
      </p>
    </div>
  );
}

function RichiediPreassegnazioneForm({ empCorrente, dipendenti, isAdmin, annoCorrente, meseCorrente, onRichiedi, styles }) {
  const [empSelezionatoId, setEmpSelezionatoId] = useState(empCorrente.id);
  const [anno, setAnno] = useState(annoCorrente);
  const [mese, setMese] = useState(meseCorrente);
  const [giorno, setGiorno] = useState(1);
  const [turno, setTurno] = useState("");
  const [nota, setNota] = useState("");

  const empTarget = isAdmin ? (dipendenti.find((d) => d.id === Number(empSelezionatoId)) || empCorrente) : empCorrente;
  // L'admin può pre-assegnare qualunque tipologia di turno, non solo quelle "proprie"
  // del ruolo del dipendente (es. dare una Direzione a un diurno per un giorno) — chi
  // non è admin resta invece limitato ai turni ammessi per il proprio ruolo.
  const turniAmmessi = isAdmin ? Object.keys(TIPI_TURNO).filter((c) => c !== "R") : turniAmmessiDipendente(empTarget);
  const numGiorniMese = giorniDelMese(anno, mese);
  const giornoSicuro = Math.min(giorno, numGiorniMese);

  function invia() {
    if (!turno) return;
    onRichiedi(empTarget.id, giornoSicuro, anno, mese, turno, nota);
    setNota("");
    setTurno("");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
        {isAdmin && (
          <div>
            <label style={styles.label}>Dipendente</label>
            <select style={styles.select} value={empSelezionatoId} onChange={(e) => { setEmpSelezionatoId(e.target.value); setTurno(""); }}>
              {dipendenti.map((d) => (
                <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label style={styles.label}>Giorno</label>
          <DatePicker anno={anno} mese={mese} giorno={giorno} onChange={(a, m, g) => { setAnno(a); setMese(m); setGiorno(g); }} annoCorrente={annoCorrente} styles={styles} />
        </div>
        <div>
          <label style={styles.label}>Turno</label>
          <select style={styles.select} value={turno} onChange={(e) => setTurno(e.target.value)}>
            <option value="">Seleziona...</option>
            <option value="LIBERO">Giorno libero</option>
            {turniAmmessi.map((code) => (
              <option key={code} value={code}>{code} — {TIPI_TURNO[code].label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: "180px" }}>
          <label style={styles.label}>Nota (facoltativa)</label>
          <input
            type="text"
            style={styles.input}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="es. preferirei chiudere quel giorno"
          />
        </div>
        <button style={styles.button} disabled={!turno} onClick={invia}>
          {isAdmin ? "Assegna" : "Invia richiesta"}
        </button>
      </div>
      <p style={{ fontSize: "11px", color: "#6B7680", marginTop: "10px" }}>
        {isAdmin
          ? "Puoi scegliere solo tra i turni ammessi per il ruolo del dipendente selezionato. Viene assegnato subito, senza bisogno di conferma, e si blocca automaticamente (🔒 Do Not Move)."
          : "Puoi scegliere solo tra i turni ammessi per il tuo ruolo. La richiesta resta in sospeso finché l'admin non la conferma; una volta accettata, il turno si blocca automaticamente (🔒 Do Not Move)."}
      </p>
    </div>
  );
}

function PulsanteSalva({ onSalva, disabled, styles, testo = "Salva" }) {
  const [salvato, setSalvato] = useState(false);

  function handleClick() {
    onSalva();
    setSalvato(true);
    setTimeout(() => setSalvato(false), 1800);
  }

  return (
    <button
      style={{
        ...styles.button,
        background: salvato ? COLORI.definitivoTesto : styles.button.background,
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        transition: "background 0.2s ease",
      }}
      disabled={disabled}
      onClick={handleClick}
    >
      {salvato ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Salvato
        </>
      ) : (
        testo
      )}
    </button>
  );
}

function CheckboxPersonalizzata({ checked, onChange, label }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: COLORI.ink, userSelect: "none" }}>
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "6px",
          border: checked ? "none" : `1.5px solid ${COLORI.hairlineForte}`,
          background: checked ? COLORI.teal : COLORI.card,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      {label}
    </label>
  );
}

function IconLucchetto({ dimensione = 10, colore = "currentColor", style }) {
  return (
    <svg
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colore}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "-1px", flexShrink: 0, ...style }}
      aria-label="bloccato"
    >
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
    </svg>
  );
}

function IconCampanella({ dimensione = 20, colore = "currentColor", style }) {
  return (
    <svg
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colore}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconEsci({ dimensione = 19, colore = "currentColor", style }) {
  return (
    <svg
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colore}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconIngranaggio({ dimensione = 19, colore = "currentColor", style }) {
  return (
    <svg
      width={dimensione}
      height={dimensione}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colore}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}


function AvatarDipendente({ d, dimensione = 26 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${dimensione}px`,
        height: `${dimensione}px`,
        minWidth: `${dimensione}px`,
        borderRadius: "50%",
        background: d.colore,
        color: testoContrastante(d.colore),
        fontSize: `${Math.max(9, dimensione * 0.38)}px`,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {d.nome?.[0]}{d.cognome?.[0]}
    </span>
  );
}

function SchedaDipendenti({ dipendenti, turni, onRicarica, styles }) {
  const [bozza, setBozza] = useState(dipendenti);
  const [nuovo, setNuovo] = useState({ cognome: "", nome: "", tipo: "diurno", email: "", pin: "", isAdmin: false });
  const [confermaEliminazione, setConfermaEliminazione] = useState(null); // id in attesa di conferma
  const [salvando, setSalvando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [erroreCreazione, setErroreCreazione] = useState("");
  const [trascinato, setTrascinato] = useState(null); // indice della riga in trascinamento

  // Form inline "Imposta email/PIN": completa un account creato senza credenziali (o
  // cambia quelle di un dipendente esistente). Un solo form aperto alla volta.
  const [credenzialiApertoPer, setCredenzialiApertoPer] = useState(null); // id del dipendente
  const [emailCredenziali, setEmailCredenziali] = useState("");
  const [pinCredenziali, setPinCredenziali] = useState("");
  const [salvandoCredenziali, setSalvandoCredenziali] = useState(false);
  const [erroreCredenziali, setErroreCredenziali] = useState("");

  function apriCredenziali(d) {
    setCredenzialiApertoPer(d.id);
    setEmailCredenziali(d.credenzialiDaImpostare ? "" : d.email ?? "");
    setPinCredenziali("");
    setErroreCredenziali("");
  }

  async function salvaCredenziali(id) {
    if (!emailCredenziali.trim() || !pinCredenziali.trim()) {
      setErroreCredenziali("Inserisci sia email che PIN.");
      return;
    }
    setSalvandoCredenziali(true);
    setErroreCredenziali("");
    const { data, error } = await supabase.functions.invoke("update-employee-credentials", {
      body: { id, email: emailCredenziali.trim(), pin: pinCredenziali.trim() },
    });
    setSalvandoCredenziali(false);
    if (error || data?.ok === false) {
      setErroreCredenziali(data?.error || error?.message || "Errore durante l'aggiornamento.");
      return;
    }
    setCredenzialiApertoPer(null);
    await onRicarica();
  }

  // Il componente non possiede più i dati: `dipendenti` arriva da Supabase (tramite il
  // genitore) e può cambiare sotto i piedi (un altro admin modifica, o dopo un salvataggio
  // proprio) — la bozza locale si riallinea quando cambia la fonte.
  useEffect(() => {
    setBozza(dipendenti);
  }, [dipendenti]);

  const modificato = JSON.stringify(bozza) !== JSON.stringify(dipendenti);

  function aggiornaCampo(id, campo, valore) {
    setBozza((prev) => prev.map((x) => (x.id === id ? { ...x, [campo]: valore } : x)));
  }

  // Trascina una riga dalla posizione "da" alla posizione "a": riassegna "ordine" in
  // sequenza a tutta la bozza, così lo spostamento si salva col normale pulsante Salva
  // (viene rilevato come modifica su ogni riga la cui posizione è cambiata).
  function riordina(da, a) {
    if (da === a) return;
    setBozza((prev) => {
      const nuovo = [...prev];
      const [spostato] = nuovo.splice(da, 1);
      nuovo.splice(a, 0, spostato);
      return nuovo.map((d, i) => ({ ...d, ordine: i }));
    });
  }

  // La creazione crea un vero account (Supabase Auth + riga profiles) tramite una Edge
  // Function con privilegi elevati: il client non ha mai accesso diretto a quel livello.
  async function creaDipendente() {
    if (!nuovo.cognome.trim() || !nuovo.nome.trim()) return;
    // Email e PIN sono opzionali, ma vanno dati insieme o non dati affatto: non avrebbe
    // senso salvare solo uno dei due (vedi "Imposta email/PIN" per completarli più avanti).
    if ((nuovo.email.trim() && !nuovo.pin.trim()) || (!nuovo.email.trim() && nuovo.pin.trim())) {
      setErroreCreazione("Inserisci sia email che PIN, oppure lasciali entrambi vuoti per impostarli più avanti.");
      return;
    }
    setCreando(true);
    setErroreCreazione("");
    // FIX #3: rotationSlot stabile assegnato UNA VOLTA alla creazione — il primo intero
    // libero, non derivato dall'id né dalla posizione nell'array (che può cambiare).
    const rotationSlot = prossimoRotationSlotLibero(bozza);
    const colore = COLORI_DIPENDENTE[bozza.length % COLORI_DIPENDENTE.length];
    const { data, error } = await supabase.functions.invoke("create-employee", {
      body: {
        email: nuovo.email.trim() || null,
        pin: nuovo.pin.trim() || null,
        cognome: nuovo.cognome.trim(),
        nome: nuovo.nome.trim(),
        tipo: nuovo.tipo,
        colore,
        rotationSlot,
        riposoTipo: "rotante",
        isAdmin: nuovo.isAdmin,
      },
    });
    setCreando(false);
    if (error || data?.ok === false) {
      setErroreCreazione(data?.error || error?.message || "Errore durante la creazione.");
      return;
    }
    setNuovo({ cognome: "", nome: "", tipo: "diurno", email: "", pin: "", isAdmin: false });
    await onRicarica();
  }

  // FIX #10: l'eliminazione fisica resta disponibile solo per correggere errori (dipendente
  // aggiunto per sbaglio, zero turni storici) — se esiste anche un solo turno storico
  // collegato, l'eliminazione viene rifiutata e va usata "Disattiva" al suo posto.
  // Nota: elimina la riga profilo; l'account di accesso resta (per ora) — servirà una
  // seconda Edge Function per rimuoverlo del tutto, come per la creazione.
  async function eliminaDipendente(id) {
    if (confermaEliminazione !== id) {
      setConfermaEliminazione(id);
      return;
    }
    if (!puoEliminareDefinitivamente(turni, id)) {
      alert("Questo dipendente ha turni storici collegati: non può essere eliminato definitivamente. Usa 'Disattiva' per rimuoverlo dalla rotazione mantenendo lo storico.");
      setConfermaEliminazione(null);
      return;
    }
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) alert(`Errore: ${error.message}`);
    setConfermaEliminazione(null);
    await onRicarica();
  }

  function toggleAttivo(id, attivoAttuale) {
    setBozza((prev) => (attivoAttuale ? disattivaDipendente(prev, id) : attivaDipendente(prev, id)));
  }

  async function salva() {
    setSalvando(true);
    const originali = new Map(dipendenti.map((d) => [d.id, d]));
    const cambiati = bozza.filter((d) => JSON.stringify(d) !== JSON.stringify(originali.get(d.id)));
    const risultati = await Promise.all(
      cambiati.map((d) => supabase.from("profiles").update(rigaDaProfiloParziale(d)).eq("id", d.id))
    );
    setSalvando(false);
    const primoErrore = risultati.find((r) => r.error)?.error;
    if (primoErrore) alert(`Errore nel salvataggio: ${primoErrore.message}`);
    await onRicarica();
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.sectionTitle}>Dipendenti</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...styles.table, fontSize: "13px", marginTop: "12px" }}>
          <thead>
            <tr>
              <th style={styles.th}></th>
              <th style={{ ...styles.th, textAlign: "left" }}>Nome</th>
              <th style={styles.th}>Tipo</th>
              <th style={styles.th}>Riposo</th>
              <th style={styles.th}>Coppia fissa</th>
              <th style={styles.th}>Admin</th>
              <th style={styles.th}>Accesso</th>
              <th style={styles.th}>Stato</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {bozza.map((d, indice) => {
              const attivo = d.active !== false;
              return (
              <tr
                key={d.id}
                draggable
                onDragStart={() => setTrascinato(indice)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (trascinato !== null) riordina(trascinato, indice); setTrascinato(null); }}
                onDragEnd={() => setTrascinato(null)}
                style={{ opacity: trascinato === indice ? 0.4 : attivo ? 1 : 0.5 }}
              >
                <td style={{ padding: "9px 4px", borderBottom: `1px solid ${COLORI.hairline}`, textAlign: "center", cursor: "grab", color: COLORI.muted, fontSize: "14px" }} title="Trascina per riordinare">
                  ⠿
                </td>
                <td style={{ padding: "9px 10px", borderBottom: `1px solid ${COLORI.hairline}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <AvatarDipendente d={d} dimensione={28} />
                    {d.cognome} {d.nome}
                  </div>
                </td>
                <td style={{ textAlign: "center", borderBottom: `1px solid ${COLORI.hairline}` }}>
                  <select
                    style={styles.select}
                    value={d.tipo}
                    onChange={(e) => aggiornaCampo(d.id, "tipo", e.target.value)}
                  >
                    {Object.entries(TIPI_DIPENDENTE).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </td>
                <td style={{ textAlign: "center", borderBottom: `1px solid ${COLORI.hairline}` }}>
                  <select
                    style={styles.select}
                    value={d.riposoTipo ?? "rotante"}
                    onChange={(e) => aggiornaCampo(d.id, "riposoTipo", e.target.value)}
                  >
                    <option value="rotante">Rotante</option>
                    <option value="fisso">Fisso</option>
                  </select>
                </td>
                <td style={{ textAlign: "center", borderBottom: `1px solid ${COLORI.hairline}` }}>
                  {d.riposoTipo === "fisso" ? (
                    <select
                      style={styles.select}
                      value={d.riposoFissoGiorno ?? 5}
                      onChange={(e) => aggiornaCampo(d.id, "riposoFissoGiorno", Number(e.target.value))}
                    >
                      {GIORNI_SETTIMANA.map((nome, indice) => (
                        <option key={indice} value={indice}>{nome} + {GIORNI_SETTIMANA[(indice + 1) % 7]}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ color: COLORI.muted, fontSize: "12px" }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: "center", borderBottom: `1px solid ${COLORI.hairline}` }}>
                  <input
                    type="checkbox"
                    checked={!!d.isAdmin}
                    onChange={(e) => aggiornaCampo(d.id, "isAdmin", e.target.checked)}
                    title="Dipendente admin: può gestire dipendenti, turni e regole per tutta la squadra"
                    style={{ accentColor: COLORI.teal, width: "16px", height: "16px", cursor: "pointer" }}
                  />
                </td>
                <td style={{ textAlign: "center", borderBottom: `1px solid ${COLORI.hairline}`, minWidth: "180px" }}>
                  {credenzialiApertoPer === d.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "center", padding: "6px 0" }}>
                      <input
                        type="email"
                        style={{ ...styles.input, width: "160px", fontSize: "12px", padding: "5px 8px" }}
                        placeholder="Email"
                        value={emailCredenziali}
                        onChange={(e) => setEmailCredenziali(e.target.value)}
                      />
                      <input
                        style={{ ...styles.input, width: "160px", fontSize: "12px", padding: "5px 8px", fontFamily: "ui-monospace, monospace" }}
                        placeholder="Nuovo PIN"
                        value={pinCredenziali}
                        onChange={(e) => setPinCredenziali(e.target.value)}
                      />
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          style={{ ...styles.button, padding: "5px 10px", fontSize: "11px" }}
                          disabled={salvandoCredenziali}
                          onClick={() => salvaCredenziali(d.id)}
                        >
                          {salvandoCredenziali ? "Salvataggio…" : "Salva"}
                        </button>
                        <button
                          style={{ ...styles.buttonSecondary, padding: "5px 10px", fontSize: "11px" }}
                          onClick={() => setCredenzialiApertoPer(null)}
                        >
                          Annulla
                        </button>
                      </div>
                      {erroreCredenziali && <p style={{ color: COLORI.avvisoTesto, fontSize: "11px", margin: 0 }}>{erroreCredenziali}</p>}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                      {d.credenzialiDaImpostare ? (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: COLORI.avvisoTesto }}>Email da impostare</span>
                      ) : (
                        <span style={{ fontSize: "11px", color: COLORI.muted, maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }} title={d.email ?? ""}>{d.email}</span>
                      )}
                      <button
                        style={{ ...styles.buttonSecondary, padding: "4px 9px", fontSize: "11px" }}
                        onClick={() => apriCredenziali(d)}
                      >
                        {d.credenzialiDaImpostare ? "Imposta email/PIN" : "Modifica"}
                      </button>
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "center", borderBottom: `1px solid ${COLORI.hairline}` }}>
                  <button
                    style={{ ...styles.buttonSecondary, padding: "5px 10px", fontSize: "11px" }}
                    onClick={() => toggleAttivo(d.id, attivo)}
                  >
                    {attivo ? "Disattiva" : "Attiva"}
                  </button>
                </td>
                <td style={{ textAlign: "center", borderBottom: `1px solid ${COLORI.hairline}` }}>
                  <button
                    style={{
                      ...styles.buttonSecondary,
                      padding: "5px 10px",
                      fontSize: "11px",
                      color: confermaEliminazione === d.id ? COLORI.avvisoTesto : COLORI.muted,
                    }}
                    onClick={() => eliminaDipendente(d.id)}
                    onBlur={() => setConfermaEliminazione(null)}
                    title="Consentito solo se il dipendente non ha turni storici collegati"
                  >
                    {confermaEliminazione === d.id ? "Conferma?" : "Elimina"}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: `1px solid ${COLORI.hairline}` }}>
        <label style={styles.label}>Crea dipendente</label>
        <p style={{ fontSize: "11px", color: COLORI.muted, marginTop: "2px", marginBottom: "6px" }}>
          Email e PIN sono quelli con cui il dipendente accederà. Puoi lasciarli vuoti e impostarli più avanti (dalla colonna "Accesso"): il dipendente comparirà comunque in squadra, ma non potrà accedere finché non li imposti.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            style={{ ...styles.input, width: "150px" }}
            placeholder="Cognome"
            value={nuovo.cognome}
            onChange={(e) => setNuovo({ ...nuovo, cognome: e.target.value })}
          />
          <input
            style={{ ...styles.input, width: "150px" }}
            placeholder="Nome"
            value={nuovo.nome}
            onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })}
          />
          <select
            style={styles.select}
            value={nuovo.tipo}
            onChange={(e) => setNuovo({ ...nuovo, tipo: e.target.value })}
          >
            {Object.entries(TIPI_DIPENDENTE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <input
            type="email"
            style={{ ...styles.input, width: "170px" }}
            placeholder="Email (opzionale)"
            value={nuovo.email}
            onChange={(e) => setNuovo({ ...nuovo, email: e.target.value })}
          />
          <input
            style={{ ...styles.input, width: "110px", fontFamily: "ui-monospace, monospace" }}
            placeholder="PIN (opzionale)"
            value={nuovo.pin}
            onChange={(e) => setNuovo({ ...nuovo, pin: e.target.value })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: COLORI.ink, paddingBottom: "10px" }}>
            <input
              type="checkbox"
              checked={nuovo.isAdmin}
              onChange={(e) => setNuovo({ ...nuovo, isAdmin: e.target.checked })}
              style={{ accentColor: COLORI.teal, width: "16px", height: "16px", cursor: "pointer" }}
            />
            Admin
          </label>
          <button
            style={styles.button}
            disabled={creando || !nuovo.cognome.trim() || !nuovo.nome.trim()}
            onClick={creaDipendente}
          >
            {creando ? "Creazione…" : "Crea"}
          </button>
        </div>
        {erroreCreazione && <p style={{ color: COLORI.avvisoTesto, fontSize: "12px", marginTop: "8px" }}>{erroreCreazione}</p>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "18px" }}>
        <PulsanteSalva onSalva={salva} disabled={!modificato || salvando} styles={styles} testo={salvando ? "Salvataggio…" : "Salva"} />
      </div>
      <p style={{ fontSize: "11px", color: COLORI.muted, marginTop: "12px" }}>
        Bozza: il riposo "Fisso" ora è impostabile per chiunque, non solo Direttore/FOM — è un flag accanto a ciascun dipendente che indica se partecipa alla rotazione o ha una coppia di riposo fissa (scegli solo il giorno di inizio della coppia, es. "Sab + Dom"). "Rotante" (il default) resta la stessa regola di sempre: coppia di 2 giorni consecutivi che scala indietro di 1 ogni mese.
      </p>
    </div>
  );
}

function PreferenzeGiorniSettimana({ turniAmmessi, preferenzeGiorno, onCambia, styles }) {
  function toggleTurno(giornoIdx, codice) {
    const attuali = preferenzeGiorno[giornoIdx] || [];
    const nuovo = attuali.includes(codice) ? attuali.filter((c) => c !== codice) : [...attuali, codice];
    onCambia({ ...preferenzeGiorno, [giornoIdx]: nuovo });
  }

  function sposta(giornoIdx, indice, direzione) {
    const attuali = [...(preferenzeGiorno[giornoIdx] || [])];
    const target = indice + direzione;
    if (target < 0 || target >= attuali.length) return;
    [attuali[indice], attuali[target]] = [attuali[target], attuali[indice]];
    onCambia({ ...preferenzeGiorno, [giornoIdx]: attuali });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {GIORNI_SETTIMANA.map((nomeGiorno, giornoIdx) => {
        const selezionati = preferenzeGiorno[giornoIdx] || [];
        return (
          <div key={giornoIdx} style={{ background: COLORI.mist, borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ fontSize: "11.5px", fontWeight: 700, color: COLORI.ink, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {nomeGiorno}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {turniAmmessi.map((codice) => {
                const posizione = selezionati.indexOf(codice);
                const selezionato = posizione !== -1;
                const colore = TIPI_TURNO[codice].colore;
                return (
                  <button
                    key={codice}
                    type="button"
                    onClick={() => toggleTurno(giornoIdx, codice)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      border: "none",
                      borderRadius: "7px",
                      padding: "5px 9px",
                      background: selezionato ? colore : COLORI.card,
                      color: selezionato ? testoContrastante(colore) : COLORI.muted,
                      fontSize: "11.5px",
                      fontWeight: 700,
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {selezionato && <span style={{ fontSize: "9.5px", opacity: 0.85 }}>{posizione + 1}°</span>}
                    {codice}
                  </button>
                );
              })}
            </div>
            {selezionati.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
                {selezionati.map((codice, i) => (
                  <span key={codice} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: COLORI.muted }}>
                    {i + 1}. {codice}
                    <button
                      type="button"
                      onClick={() => sposta(giornoIdx, i, -1)}
                      disabled={i === 0}
                      style={{ border: "none", background: COLORI.card, borderRadius: "5px", width: "18px", height: "18px", fontSize: "10px", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.4 : 1 }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => sposta(giornoIdx, i, 1)}
                      disabled={i === selezionati.length - 1}
                      style={{ border: "none", background: COLORI.card, borderRadius: "5px", width: "18px", height: "18px", fontSize: "10px", cursor: i === selezionati.length - 1 ? "default" : "pointer", opacity: i === selezionati.length - 1 ? 0.4 : 1 }}
                    >
                      ↓
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SchedaPreferenze({ empCorrente, preferenze, onSalva, styles }) {
  const turniAmmessi = turniAmmessiDipendente(empCorrente);
  const [ordineLocale, setOrdineLocale] = useState(preferenze[empCorrente.id]?.ordinePreferenza || turniAmmessi);
  const [evitaLocale, setEvitaLocale] = useState(!!preferenze[empCorrente.id]?.evitaSequenzeScomode);
  const [preferenzeGiornoLocale, setPreferenzeGiornoLocale] = useState(preferenze[empCorrente.id]?.preferenzeGiorno || {});

  function salva() {
    onSalva(empCorrente.id, "ordinePreferenza", ordineLocale);
    onSalva(empCorrente.id, "evitaSequenzeScomode", evitaLocale);
    onSalva(empCorrente.id, "preferenzeGiorno", preferenzeGiornoLocale);
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.sectionTitle}>Le mie preferenze</h3>
      <p style={{ fontSize: "13px", color: COLORI.muted, marginTop: "6px", marginBottom: "18px" }}>
        Indica le tue preferenze: verranno tenute in considerazione dall'assegnazione automatica, bilanciandole con quelle degli altri colleghi. Ricordati di salvare per renderle effettive.
      </p>
      <label style={styles.label}>Ordine di preferenza turni (generale)</label>
      <p style={{ fontSize: "12px", color: COLORI.muted, margin: "2px 0 10px" }}>
        Metti in cima il turno che preferisci di più. Usa le frecce per riordinare. Vale come base, a meno che tu non imposti una preferenza più specifica per un giorno della settimana qui sotto.
      </p>
      <OrdinePreferenzaTurni
        turniAmmessi={turniAmmessi}
        ordine={ordineLocale}
        onCambia={setOrdineLocale}
        styles={styles}
      />

      <label style={{ ...styles.label, marginTop: "22px", display: "block" }}>Preferenze per giorno della settimana</label>
      <p style={{ fontSize: "12px", color: COLORI.muted, margin: "2px 0 12px" }}>
        Es. "il lunedì preferisco C2, poi C1". Seleziona uno o più turni per ciascun giorno, poi ordina la priorità con le frecce. Se imposti una preferenza qui, ha la precedenza su quella generale per quel giorno.
      </p>
      <PreferenzeGiorniSettimana
        turniAmmessi={turniAmmessi}
        preferenzeGiorno={preferenzeGiornoLocale}
        onCambia={setPreferenzeGiornoLocale}
        styles={styles}
      />

      <div style={{ marginTop: "16px" }}>
        <CheckboxPersonalizzata
          checked={evitaLocale}
          onChange={setEvitaLocale}
          label="Evita sequenze scomode (es. notte seguita da mattina presto)"
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "18px" }}>
        <PulsanteSalva onSalva={salva} styles={styles} />
      </div>
      <p style={{ fontSize: "11px", color: COLORI.muted, marginTop: "14px", lineHeight: 1.6 }}>
        Bozza: la priorità di ciascun dipendente viene poi bilanciata con quella degli altri colleghi dall'assegnazione automatica — non è una garanzia assoluta, ma un criterio di scelta tra i candidati validi.
      </p>
    </div>
  );
}

function OrdinePreferenzaTurni({ turniAmmessi, ordine, onCambia, styles }) {
  const lista = ordine && ordine.length > 0 ? ordine.filter((c) => turniAmmessi.includes(c)) : turniAmmessi;
  const listaCompleta = [...lista, ...turniAmmessi.filter((c) => !lista.includes(c))];

  function sposta(indice, direzione) {
    const nuova = [...listaCompleta];
    const target = indice + direzione;
    if (target < 0 || target >= nuova.length) return;
    [nuova[indice], nuova[target]] = [nuova[target], nuova[indice]];
    onCambia(nuova);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px", maxWidth: "340px" }}>
      {listaCompleta.map((code, i) => (
        <div
          key={code}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 12px",
            borderRadius: "7px",
            background: "#F1F3F1",
            border: "1px solid #E1E5E1",
          }}
        >
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#6B7680", width: "14px", fontFamily: "ui-monospace, monospace" }}>{i + 1}</span>
          <span style={styles.badge(TIPI_TURNO[code].colore)}>{code}</span>
          <span style={{ fontSize: "12px", color: "#1C2B33", flex: 1 }}>{TIPI_TURNO[code].label}</span>
          <button
            style={{ border: "1px solid #CBD1CC", background: "white", borderRadius: "6px", width: "26px", height: "26px", cursor: "pointer", color: "#1C2B33" }}
            onClick={() => sposta(i, -1)}
            disabled={i === 0}
          >
            ↑
          </button>
          <button
            style={{ border: "1px solid #CBD1CC", background: "white", borderRadius: "6px", width: "26px", height: "26px", cursor: "pointer", color: "#1C2B33" }}
            onClick={() => sposta(i, 1)}
            disabled={i === listaCompleta.length - 1}
          >
            ↓
          </button>
        </div>
      ))}
    </div>
  );
}
