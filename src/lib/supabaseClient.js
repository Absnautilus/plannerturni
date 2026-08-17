import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Finché le variabili d'ambiente non sono impostate (fase di transizione dalla demo
// solo-localStorage al backend reale) l'app deve continuare a funzionare: supabase
// resta null e chi lo usa deve prevedere il fallback.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
