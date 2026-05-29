import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Deno global for TS
declare const Deno: any;

type ManageBody = {
  op: "reset_password" | "delete_user" | "seed";
  user_id?: string;
  perRole?: number;
};

type RoleId =
  | "admin"
  | "medecin"
  | "infirmier"
  | "secretaire"
  | "comptable"
  | "pharmacien"
  | "directeur"
  | "patient";

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
  if (![...out].some((c) => specials.includes(c))) {
    out = out.slice(0, -1) + specials[bytes[0] % specials.length];
  }
  return out;
}

Deno.serve(async (req: Request) => {
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

    const body = (await req.json()) as Partial<ManageBody>;
    const op = body.op;

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    if (op === "reset_password") {
      const user_id = (body.user_id ?? "").trim();
      if (!user_id) return json(400, { error: "Missing user_id" });
      const password = generatePassword();
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
      if (error) return json(400, { error: error.message });
      return json(200, { password });
    }

    if (op === "delete_user") {
      const user_id = (body.user_id ?? "").trim();
      if (!user_id) return json(400, { error: "Missing user_id" });

      // Best-effort cleanup of linking rows; ignore errors
      try {
        await (adminClient as any).schema("app").from("patient_accounts").delete().eq("user_id", user_id);
        await (adminClient as any).schema("app").from("profiles").delete().eq("user_id", user_id);
      } catch {}

      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    if (op === "seed") {
      const perRole = Math.max(1, Math.min(100, Number(body.perRole ?? 5)));
      const roles: RoleId[] = [
        "admin",
        "medecin",
        "infirmier",
        "secretaire",
        "comptable",
        "pharmacien",
        "directeur",
        "patient",
      ];

      const results: Array<{ id: string | null; email: string; password: string; role: RoleId }> = [];
      const ts = Date.now();

      for (const r of roles) {
        for (let i = 0; i < perRole; i++) {
          const rnd = Math.random().toString(36).slice(2, 8);
          const email = `${r}.${i}.${ts}.${rnd}@example.com`;
          const full_name = `Demo ${r.charAt(0).toUpperCase() + r.slice(1)} ${i + 1}`;
          const password = generatePassword();

          const user_metadata: Record<string, unknown> = { role: r, full_name };
          if (r === "patient") {
            const first = `Patient${i + 1}`;
            const last = `Demo${i + 1}`;
            user_metadata.first_name = first;
            user_metadata.last_name = last;
            user_metadata.sex = i % 2 === 0 ? "M" : "F";
            user_metadata.birth_date = "1990-01-01";
            user_metadata.blood_type = ["A+","A-","B+","B-","AB+","AB-","O+","O-"][i % 8];
          }

          const { data, error } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata,
          });
          if (!error) {
            results.push({ id: data.user?.id ?? null, email, password, role: r });
          }
        }
      }

      return json(200, { created: results.length, users: results.slice(0, 50) });
    }

    return json(400, { error: "Unknown op" });
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Unknown error" });
  }
});
