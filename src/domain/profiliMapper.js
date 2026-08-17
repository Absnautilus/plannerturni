// Converte tra le colonne snake_case della tabella `profiles` di Supabase e la forma
// camelCase usata in tutto il resto dell'app (che risale a quando i dipendenti erano
// un array locale in memoria).

export function profiloDaRiga(riga) {
  return {
    id: riga.id,
    cognome: riga.cognome,
    nome: riga.nome,
    tipo: riga.tipo,
    riposoTipo: riga.riposo_tipo,
    riposoFissoGiorno: riga.riposo_fisso_giorno,
    rotationSlot: riga.rotation_slot,
    active: riga.active,
    colore: riga.colore,
    turniExtra: riga.turni_extra ?? [],
    quotaFerieAnnua: riga.quota_ferie_annua,
    quotaPermessiOreAnnue: riga.quota_permessi_ore_annue,
    isAdmin: riga.is_admin,
  };
}

// Solo i campi passati vengono convertiti: usata per costruire il payload di un
// update parziale (es. dopo una modifica in "Dipendenti") senza dover rispecificare
// l'intera riga.
export function rigaDaProfiloParziale(patch) {
  const mappa = {
    cognome: "cognome",
    nome: "nome",
    tipo: "tipo",
    riposoTipo: "riposo_tipo",
    riposoFissoGiorno: "riposo_fisso_giorno",
    rotationSlot: "rotation_slot",
    active: "active",
    colore: "colore",
    turniExtra: "turni_extra",
    quotaFerieAnnua: "quota_ferie_annua",
    quotaPermessiOreAnnue: "quota_permessi_ore_annue",
    isAdmin: "is_admin",
  };
  const riga = {};
  Object.entries(patch).forEach(([chiave, valore]) => {
    if (mappa[chiave]) riga[mappa[chiave]] = valore;
  });
  return riga;
}
