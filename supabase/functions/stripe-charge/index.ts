import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
declare const Deno: any;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// XAF → EUR (taux fixe CFA : 1 EUR = 655.957 XAF)
// Stripe ne supporte pas XAF — on charge en EUR centimes
function xafToEurCents(xaf: number): number {
  const eur = xaf / 655.957;
  return Math.max(50, Math.round(eur * 100)); // minimum 0.50 EUR
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const stripeKey = Deno.env.get("strip_key") ?? "";
    if (!stripeKey) return json(500, { error: "Stripe key not configured." });

    const url     = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const svcKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json(401, { error: "Missing Authorization header" });

    // Vérification caller (doit être connecté)
    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user?.id) return json(401, { error: "Non authentifié." });

    const body = await req.json();
    const { card_number, exp_month, exp_year, cvc, holder_name, amount_xaf, invoice_id } = body;

    if (!card_number || !exp_month || !exp_year || !cvc) {
      return json(400, { error: "Données de carte incomplètes." });
    }
    if (!amount_xaf || amount_xaf <= 0) {
      return json(400, { error: "Montant invalide." });
    }

    const cleanCard = String(card_number).replace(/\s/g, "");
    const amountCents = xafToEurCents(Number(amount_xaf));

    // Étape 1 : créer le PaymentMethod avec les données carte
    const pmParams = new URLSearchParams({
      "type": "card",
      "card[number]": cleanCard,
      "card[exp_month]": String(exp_month),
      "card[exp_year]": String(exp_year),
      "card[cvc]": String(cvc),
    });
    if (holder_name) pmParams.set("billing_details[name]", holder_name);

    const pmRes = await fetch("https://api.stripe.com/v1/payment_methods", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: pmParams.toString(),
    });
    const pm = await pmRes.json();
    if (!pmRes.ok) {
      return json(400, { error: pm?.error?.message ?? "Carte refusée par Stripe." });
    }

    // Étape 2 : créer et confirmer le PaymentIntent
    const piParams = new URLSearchParams({
      amount: String(amountCents),
      currency: "eur",
      payment_method: pm.id,
      confirm: "true",
      description: invoice_id ? `Facture ${invoice_id} - Centre 2KC` : "Paiement Centre 2KC",
      "automatic_payment_methods[enabled]": "false",
    });

    const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: piParams.toString(),
    });
    const pi = await piRes.json();

    if (!piRes.ok || (pi.status !== "succeeded" && pi.status !== "requires_capture")) {
      return json(400, {
        error: pi?.error?.message ?? pi?.last_payment_error?.message ?? "Paiement refusé par Stripe.",
      });
    }

    // Étape 3 : mettre à jour la facture dans Supabase
    if (invoice_id && svcKey) {
      const adminClient = createClient(url, svcKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      await (adminClient as any)
        .schema("app")
        .from("invoices")
        .update({ status: "payee" })
        .eq("id", invoice_id);

      await (adminClient as any)
        .schema("app")
        .from("payments")
        .insert({
          invoice_id,
          method: "card",
          amount: Number(amount_xaf),
          transaction_ref: pi.id,
          received_by: user.id,
        });
    }

    return json(200, {
      ok: true,
      payment_intent_id: pi.id,
      status: pi.status,
      amount_eur: (amountCents / 100).toFixed(2),
    });
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Erreur serveur." });
  }
});
