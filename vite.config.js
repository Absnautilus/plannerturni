import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const moduleBuild = process.env.BUILD_MODULE === "1";

export default defineConfig({
  plugins: [react()],
  build: moduleBuild
    ? {
        lib: {
          entry: "src/module-entry.jsx",
          formats: ["es"],
          fileName: () => "turni-module.js",
        },
        rollupOptions: {
          external: ["react", "react-dom", "react/jsx-runtime", "@supabase/supabase-js"],
        },
      }
    : undefined,
});
