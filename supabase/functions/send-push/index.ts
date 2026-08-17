// Invia una notifica push a tutte le sottoscrizioni (dispositivi) di un dipendente.
// Chi chiama deve solo essere autenticato (qualunque dipendente può far scattare una
// notifica per un collega, es. "ho accettato il tuo cambio turno") — usa comunque la
// service_role key perché deve leggere le sottoscrizioni push di un ALTRO utente,
// cosa che la RLS non permette al client normale.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autenticato.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAsCaller.auth.getUser();
    if (userError || !user) throw new Error("Sessione non valida.");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { profileId, titolo, corpo, url } = body;
    if (!profileId || !titolo) throw new Error("profileId e titolo sono obbligatori.");

    const { data: sottoscrizioni, error: subError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("profile_id", profileId);
    if (subError) throw subError;

    webpush.setVapidDetails("mailto:notifiche@plannerturni.app", vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({ title: titolo, body: corpo || "", url: url || "/" });

    const risultati = await Promise.allSettled(
      (sottoscrizioni ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        } catch (err) {
          // 404/410: la sottoscrizione non è più valida (browser disinstallato, permesso
          // revocato...) — la puliamo invece di ritentare per sempre.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
          throw err;
        }
      })
    );

    return new Response(
      JSON.stringify({ ok: true, inviati: risultati.filter((r) => r.status === "fulfilled").length, totali: risultati.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
