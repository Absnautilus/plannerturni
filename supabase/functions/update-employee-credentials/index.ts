// Imposta (o cambia) l'email e il PIN di accesso di un dipendente ESISTENTE, per conto
// dell'admin. Serve soprattutto a completare un account creato senza email/PIN (vedi
// create-employee): finché non si passa da qui, quell'account ha solo credenziali
// segnaposto generate a caso, con cui nessuno può accedere davvero.
//
// Come create-employee, gira lato server con la service_role key perché un utente non può
// mai cambiare l'email/password di un ALTRO utente tramite l'API pubblica — solo la propria
// (auth.updateUser, già usato per il cambio email/PIN "personale" dal client).
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

    const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAsCaller.auth.getUser();
    if (userError || !user) throw new Error("Sessione non valida.");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profiloChiamante, error: profiloError } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (profiloError || !profiloChiamante?.is_admin) {
      throw new Error("Solo l'admin può modificare le credenziali di un dipendente.");
    }

    const body = await req.json();
    const { id, email, pin } = body;
    if (!id || !email?.trim() || !pin?.trim()) {
      throw new Error("Email e PIN sono obbligatori.");
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: email.trim(),
      password: pin.trim(),
      email_confirm: true,
    });
    if (updateError) throw updateError;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ email: email.trim(), credenziali_da_impostare: false })
      .eq("id", id);
    if (profileError) throw profileError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
