import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configurazione minima: nessuna personalizzazione necessaria per ora.
// La aggiorneremo nelle fasi successive se servirà (es. variabili d'ambiente Supabase).
export default defineConfig({
  plugins: [react()],
});
