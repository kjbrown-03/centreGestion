import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!url || !anonKey || !serviceRoleKey) {
      return json(500, { error: "Missing Supabase env vars" });
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

    return json(200, {
      user: { id: created.user?.id, email: created.user?.email },
      password,
    });
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Unknown error" });
  }
});
