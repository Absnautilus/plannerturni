import PlannerTurni from "./PlannerTurni.jsx";
import { configureSupabaseClient } from "./lib/supabaseClient.js";
import "./module.css";

/**
 * Embeddable Turni entry point for the Hotsflow shell.
 *
 * The shell owns authentication and the Supabase client. Planner Turni keeps
 * its existing standalone entry point; this adapter only swaps in the shared
 * client and removes duplicate app chrome through scoped embedded CSS.
 */
export function TurniModule({ supabaseClient }) {
  configureSupabaseClient(supabaseClient);

  return (
    <div className="ptn-embedded">
      <PlannerTurni />
    </div>
  );
}

export default TurniModule;
