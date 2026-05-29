import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CreateUserBody = {
  email: string;
  role: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  sex?: string;
  birth_date?: string;
  blood_type?: string;
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
    const first_name = (body.first_name ?? "").trim();
    const last_name = (body.last_name ?? "").trim();
    const sex = (body.sex ?? "").trim();
    const birth_date = (body.birth_date ?? "").trim();
    const blood_type = (body.blood_type ?? "").trim();

    if (!email || !role || !full_name) {
      return json(400, { error: "Missing email/role/full_name" });
    }

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const userMetadata = {
      role,
      full_name,
      first_name,
      last_name,
      sex,
      birth_date,
      blood_type,
    } as Record<string, unknown>;

    const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: userMetadata,
    });

    if (inviteErr) return json(400, { error: inviteErr.message });

    return json(200, {
      user: { id: invited.user?.id ?? null, email: invited.user?.email ?? email },
      invited: true,
      emailSent: true,
      emailError: null,
    });
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Unknown error" });
  }
});
