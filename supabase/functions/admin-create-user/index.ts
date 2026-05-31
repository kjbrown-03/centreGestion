import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
declare const Deno: any;

type CreateUserBody = {
  op?: "create_user" | "list_users" | "update_user" | "reset_password" | "delete_user";
  user_id?: string;
  email?: string;
  role?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  sex?: string;
  birth_date?: string;
  blood_type?: string;
};

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

function generatePassword(length = 14) {
  const all = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += all[bytes[i] % all.length];
  return out;
}

async function findUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email);
    if (found) return found;
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

function base64(input: string) {
  return btoa(unescape(encodeURIComponent(input)));
}

async function readSmtpLine(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
    if (out.includes("\n")) {
      const lines = out.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? out;
      if (/^\d{3}\s/.test(last)) return out;
    }
  }
  return out;
}

async function smtp(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  command: string | null,
  expected: number[],
) {
  const encoder = new TextEncoder();
  if (command != null) await writer.write(encoder.encode(`${command}\r\n`));
  const line = await readSmtpLine(reader);
  const code = Number(line.slice(0, 3));
  if (!expected.includes(code)) throw new Error(`SMTP: ${line.trim()}`);
}

async function sendPasswordEmail(params: { to: string; fullName: string; role: string; password: string }) {
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail = Deno.env.get("MAIL_FROM") ?? "Centre 2KC <onboarding@resend.dev>";
  const errors: string[] = [];

  if (resendKey) {
    const subject = "Votre compte 2KC Centre de Sante";
    const text = [
      `Bonjour ${params.fullName},`,
      "",
      "Votre compte sur la plateforme 2KC Centre de Sante a ete cree.",
      "",
      `Email: ${params.to}`,
      `Role: ${params.role}`,
      `Mot de passe temporaire: ${params.password}`,
      "",
      "Connectez-vous puis changez votre mot de passe si necessaire.",
      "",
      "Centre de Sante 2KC",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject,
        text,
      }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      errors.push(`Resend: ${payload?.message ?? payload?.error ?? "Email non envoye par Resend."}`);
    } else {
      return { sent: true, error: null };
    }
  }

  const gmailUser = Deno.env.get("GMAIL_USER") ?? "";
  const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
  if (!gmailUser || !gmailPassword) {
    return {
      sent: false,
      error: errors.join(" | ") || "Secrets email manquants. Configurez RESEND_API_KEY/MAIL_FROM ou GMAIL_USER/GMAIL_APP_PASSWORD.",
    };
  }

  let conn: any = null;
  try {
    conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });
    const reader = conn.readable.getReader();
    const writer = conn.writable.getWriter();

    await smtp(reader, writer, null, [220]);
    await smtp(reader, writer, "EHLO 2kc-sante.cm", [250]);
    await smtp(reader, writer, "AUTH LOGIN", [334]);
    await smtp(reader, writer, base64(gmailUser), [334]);
    await smtp(reader, writer, base64(gmailPassword), [235]);
    await smtp(reader, writer, `MAIL FROM:<${gmailUser}>`, [250]);
    await smtp(reader, writer, `RCPT TO:<${params.to}>`, [250, 251]);
    await smtp(reader, writer, "DATA", [354]);

    const body = [
      `Bonjour ${params.fullName},`,
      "",
      "Votre compte sur la plateforme 2KC Centre de Sante a ete cree.",
      "",
      `Email: ${params.to}`,
      `Role: ${params.role}`,
      `Mot de passe temporaire: ${params.password}`,
      "",
      "Connectez-vous puis changez votre mot de passe si necessaire.",
      "",
      "Centre de Sante 2KC",
    ].join("\r\n");

    const message = [
      `From: Centre 2KC <${gmailUser}>`,
      `To: ${params.to}`,
      "Subject: Votre compte 2KC Centre de Sante",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
      ".",
    ].join("\r\n");

    await smtp(reader, writer, message, [250]);
    await smtp(reader, writer, "QUIT", [221]);
    return { sent: true, error: null };
  } catch (e) {
    errors.push(`Gmail: ${(e as any)?.message ?? "Email non envoye."}`);
    return { sent: false, error: errors.join(" | ") };
  } finally {
    try { conn?.close?.(); } catch {}
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("URL") ?? Deno.env.get("SUPABASE_FUNCTION_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_FUNCTION_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_FUNCTION_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anonKey || !serviceRoleKey) return json(500, { error: "Missing Supabase env vars." });

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

    const body = (await req.json()) as CreateUserBody;
    const op = body.op ?? "create_user";
    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: profile, error: profileErr } = await (adminClient as any)
      .schema("app")
      .from("profiles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (profileErr) return json(403, { error: profileErr.message });
    const callerRole = profile?.role ?? caller.user_metadata?.role ?? "patient";
    if (callerRole !== "admin") return json(403, { error: "Admin only" });

    if (op === "list_users") {
      const authUsers: any[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return json(400, { error: error.message });
        authUsers.push(...(data?.users ?? []));
        if (!data?.users || data.users.length < 1000) break;
      }

      const { data: profiles, error: profilesError } = await (adminClient as any)
        .schema("app")
        .from("profiles")
        .select("user_id, role, full_name, phone, created_at, updated_at");
      if (profilesError) return json(400, { error: profilesError.message });

      const byId = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      const users = authUsers
        .map((u: any) => {
          const profile = byId.get(u.id) as any;
          return {
            id: u.id,
            email: u.email ?? "",
            role: profile?.role ?? u.user_metadata?.role ?? "patient",
            full_name: profile?.full_name ?? u.user_metadata?.full_name ?? (u.email ?? "").split("@")[0],
            phone: profile?.phone ?? null,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at ?? null,
          };
        })
        .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

      return json(200, { users });
    }

    if (op === "reset_password") {
      const userId = (body.user_id ?? "").trim();
      if (!userId) return json(400, { error: "Missing user_id" });
      const password = generatePassword();
      const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (error) return json(400, { error: error.message });
      const prof = await (adminClient as any).schema("app").from("profiles").select("full_name, role").eq("user_id", userId).maybeSingle();
      const email = data.user?.email ?? "";
      const mail = email
        ? await sendPasswordEmail({ to: email, fullName: prof.data?.full_name ?? email, role: prof.data?.role ?? "utilisateur", password })
        : { sent: false, error: "Email utilisateur introuvable." };
      return json(200, { password, emailSent: mail.sent, emailError: mail.error });
    }

    if (op === "update_user") {
      const userId = (body.user_id ?? "").trim();
      const email = (body.email ?? "").trim().toLowerCase();
      const role = (body.role ?? "").trim();
      const fullName = (body.full_name ?? "").trim();
      if (!userId || !email || !role || !fullName) return json(400, { error: "Missing user_id/email/role/full_name" });

      const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
        user_metadata: {
          role,
          full_name: fullName,
          first_name: body.first_name ?? "",
          last_name: body.last_name ?? "",
          sex: body.sex ?? "",
          birth_date: body.birth_date ?? "",
          blood_type: body.blood_type ?? "",
        },
      });
      if (authErr) return json(400, { error: authErr.message });

      const { error: profileErr } = await (adminClient as any)
        .schema("app")
        .from("profiles")
        .upsert({ user_id: userId, role, full_name: fullName }, { onConflict: "user_id" });
      if (profileErr) return json(400, { error: profileErr.message });

      return json(200, { ok: true });
    }

    if (op === "delete_user") {
      const userId = (body.user_id ?? "").trim();
      if (!userId) return json(400, { error: "Missing user_id" });

      // Appel de la fonction de nettoyage (gère tous les FK NOT NULL)
      const { error: cleanupErr } = await adminClient.rpc("delete_user_cascade", { p_user_id: userId });
      if (cleanupErr) {
        // Fallback manuel si la fonction n'est pas encore déployée
        try {
          await (adminClient as any).schema("app").from("patient_accounts").delete().eq("user_id", userId);
          await (adminClient as any).schema("app").from("profiles").delete().eq("user_id", userId);
        } catch { /* ignore */ }
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) return json(400, { error: `Database error deleting user: ${error.message}` });
      return json(200, { ok: true });
    }

    const email = (body.email ?? "").trim().toLowerCase();
    const role = (body.role ?? "").trim();
    const fullName = (body.full_name ?? "").trim();
    if (!email || !role || !fullName) return json(400, { error: "Missing email/role/full_name" });

    const password = generatePassword();
    const userMetadata = {
      role,
      full_name: fullName,
      first_name: body.first_name ?? "",
      last_name: body.last_name ?? "",
      sex: body.sex ?? "",
      birth_date: body.birth_date ?? "",
      blood_type: body.blood_type ?? "",
    };

    const existingUser = await findUserByEmail(adminClient, email);
    const userId = existingUser?.id;
    const result = userId
      ? await adminClient.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { ...(existingUser.user_metadata ?? {}), ...userMetadata },
        })
      : await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        });

    if (result.error) return json(400, { error: result.error.message });
    const authUser = result.data?.user;
    if (!authUser?.id) return json(500, { error: "Utilisateur auth introuvable apres creation." });

    const profileWrite = await (adminClient as any)
      .schema("app")
      .from("profiles")
      .upsert(
        {
          user_id: authUser.id,
          role,
          full_name: fullName,
        },
        { onConflict: "user_id" },
      );
    if (profileWrite.error) return json(400, { error: profileWrite.error.message });

    const mail = await sendPasswordEmail({ to: email, fullName, role, password });
    return json(200, {
      user: { id: authUser.id, email: authUser.email ?? email },
      password,
      emailSent: mail.sent,
      emailError: mail.error,
      existed: !!existingUser,
    });
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Unknown error" });
  }
});
