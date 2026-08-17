// Crea un nuovo dipendente: account di autenticazione (email + password) e riga in
// `profiles`. Gira lato server perché serve la service_role key di Supabase, che non
// deve MAI arrivare al browser — Supabase la inietta automaticamente come variabile
// d'ambiente in ogni Edge Function, non va configurata a mano.
//
// Chi chiama deve essere autenticato E avere is_admin = true sul proprio profilo:
// controllo fatto qui, lato server, non fidandosi di nessun flag mandato dal client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Client "per conto di chi chiama": serve solo a verificare chi è, con i suoi permessi.
    const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAsCaller.auth.getUser();
    if (userError || !user) throw new Error("Sessione non valida.");

    // Client con privilegi elevati: usato solo qui, lato server, mai esposto al browser.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profiloChiamante, error: profiloError } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (profiloError || !profiloChiamante?.is_admin) {
      throw new Error("Solo l'admin può creare nuovi dipendenti.");
    }

    const body = await req.json();
    const { email, pin, cognome, nome, tipo, colore, rotationSlot, riposoTipo, isAdmin } = body;
    if (!email || !pin || !cognome || !nome || !tipo) {
      throw new Error("Email, PIN, cognome, nome e tipo sono obbligatori.");
    }

    const { data: nuovoUtente, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
    });
    if (createError) throw createError;

    const { error: insertError } = await supabaseAdmin.from("profiles").insert({
      id: nuovoUtente.user.id,
      cognome,
      nome,
      tipo,
      colore,
      rotation_slot: rotationSlot ?? null,
      riposo_tipo: riposoTipo ?? "rotante",
      is_admin: !!isAdmin,
    });
    if (insertError) {
      // Il profilo non si è creato: non lasciare un account di login orfano senza profilo.
      await supabaseAdmin.auth.admin.deleteUser(nuovoUtente.user.id);
      throw insertError;
    }

    return new Response(JSON.stringify({ ok: true, id: nuovoUtente.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
