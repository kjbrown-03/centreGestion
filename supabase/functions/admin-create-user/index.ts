import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

type CreateUserBody = {
  email: string;
  role: string;
  full_name: string;
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

function generatePassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const specials = "@#$%";
  const all = alphabet + specials;
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += all[bytes[i] % all.length];
  }
  // ensure at least one special
  if (![...out].some((c) => specials.includes(c))) {
    out = out.slice(0, -1) + specials[bytes[0] % specials.length];
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    // Supabase Dashboard forbids user-created secrets starting with SUPABASE_.
    // SUPABASE_URL / SUPABASE_ANON_KEY are usually injected by the platform automatically.
    // For custom secrets, use URL / ANON_KEY / SERVICE_ROLE_KEY (or legacy names).
    const url =
      Deno.env.get("SUPABASE_URL") ??
      Deno.env.get("URL") ??
      Deno.env.get("SUPABASE_FUNCTION_URL") ??
      "";
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("ANON_KEY") ??
      Deno.env.get("SUPABASE_FUNCTION_ANON_KEY") ??
      "";
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_FUNCTION_SERVICE_ROLE_KEY") ??
      "";
    const gmailUser = Deno.env.get("GMAIL_USER") ?? "";
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";

    if (!url || !anonKey || !serviceRoleKey) {
      return json(500, {
        error:
          "Missing Supabase env vars. Expected SUPABASE_URL + SUPABASE_ANON_KEY (platform) and SERVICE_ROLE_KEY (secret).",
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json(401, { error: "Missing Authorization header" });

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: callerUserData, error: callerUserErr } = await callerClient.auth.getUser();
    if (callerUserErr) return json(401, { error: callerUserErr.message });
    const caller = callerUserData.user;
    if (!caller?.id) return json(401, { error: "Not authenticated" });

    const { data: profile, error: profileErr } = await callerClient
      .schema("app")
      .from("profiles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (profileErr) return json(403, { error: profileErr.message });
    if (profile?.role !== "admin") return json(403, { error: "Admin only" });

    const body = (await req.json()) as Partial<CreateUserBody>;
    const email = (body.email ?? "").trim().toLowerCase();
    const role = (body.role ?? "").trim();
    const full_name = (body.full_name ?? "").trim();

    if (!email || !role || !full_name) {
      return json(400, { error: "Missing email/role/full_name" });
    }

    const password = generatePassword();

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        full_name,
      },
    });

    if (createErr) return json(400, { error: createErr.message });

    let emailSent = false;
    let emailError: string | null = null;

    if (gmailUser && gmailAppPassword) {
      try {
        const client = new SmtpClient();
        await client.connectTLS({
          hostname: "smtp.gmail.com",
          port: 465,
          username: gmailUser,
          password: gmailAppPassword,
        });

        const frenchRole =
          role === "admin"
            ? "Administrateur"
            : role === "medecin"
            ? "Médecin"
            : role === "infirmier"
            ? "Infirmier"
            : role === "pharmacien"
            ? "Pharmacien"
            : role === "secretaire"
            ? "Secrétaire"
            : role === "comptable"
            ? "Comptable"
            : role === "directeur"
            ? "Directeur"
            : role;

        await client.send({
          from: gmailUser,
          to: email,
          subject: "[Centre de Santé] Création de votre compte",
          content: `Bonjour ${full_name},\n\nUn compte a été créé pour vous sur l'application de Gestion du Centre de Santé avec le rôle : ${frenchRole}.\n\nVoici vos identifiants de connexion :\n- Email : ${email}\n- Mot de passe : ${password}\n\nPour des raisons de sécurité, nous vous conseillons de modifier votre mot de passe dès votre première connexion.\n\nCordialement,\nL'administration du Centre de Santé`,
        });

        await client.close();
        emailSent = true;
      } catch (err: any) {
        console.error("Failed to send email via SMTP:", err);
        emailError = err?.message ?? String(err);
      }
    } else {
      console.warn("Gmail SMTP credentials missing. Skipping email send.");
      emailError = "SMTP credentials missing";
    }

    return json(200, {
      user: { id: created.user?.id, email: created.user?.email },
      password,
      emailSent,
      emailError,
    });
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Unknown error" });
  }
});
