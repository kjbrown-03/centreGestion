import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
declare const Deno: any;

type RoleId =
  | "admin"
  | "medecin"
  | "infirmier"
  | "secretaire"
  | "comptable"
  | "pharmacien"
  | "directeur"
  | "patient";

const DEMO: Record<string, { role: RoleId; name: string; password: string }> = {
  "admin@2kc.fr": { role: "admin", name: "Administrateur", password: "admin123" },
  "medecin@2kc.fr": { role: "medecin", name: "Dr Karim Cisse", password: "medecin123" },
  "infirmier@2kc.fr": { role: "infirmier", name: "Nadia Benali", password: "infirmier123" },
  "secretaire@2kc.fr": { role: "secretaire", name: "Accueil Secretariat", password: "secretaire123" },
  "comptable@2kc.fr": { role: "comptable", name: "Service Comptabilite", password: "comptable123" },
  "pharmacien@2kc.fr": { role: "pharmacien", name: "Pharmacie 2KC", password: "pharmacien123" },
  "directeur@2kc.fr": { role: "directeur", name: "Direction", password: "directeur123" },
  "patient@2kc.fr": { role: "patient", name: "Pierre Durand", password: "patient123" },
};

const STOCK_SEED = [
  { name: "Paracetamol 500mg", category: "Antalgique", stock: 240, threshold: 50, unit_price: 500, expiry_date: "2027-08-12" },
  { name: "Amoxicilline 1g", category: "Antibiotique", stock: 38, threshold: 40, unit_price: 2500, expiry_date: "2027-03-04" },
  { name: "Ibuprofene 400mg", category: "Anti-inflammatoire", stock: 180, threshold: 60, unit_price: 750, expiry_date: "2027-01-22" },
  { name: "Doliprane sirop", category: "Antalgique", stock: 64, threshold: 30, unit_price: 1800, expiry_date: "2027-05-30" },
  { name: "Ventoline aerosol", category: "Bronchodilatateur", stock: 22, threshold: 25, unit_price: 3500, expiry_date: "2027-09-18" },
  { name: "Insuline rapide", category: "Endocrinologie", stock: 14, threshold: 20, unit_price: 9000, expiry_date: "2027-02-10" },
  { name: "Aspirine 100mg", category: "Cardiologie", stock: 320, threshold: 80, unit_price: 400, expiry_date: "2028-06-01" },
  { name: "Omeprazole 20mg", category: "Gastro", stock: 110, threshold: 40, unit_price: 1600, expiry_date: "2027-11-15" },
  { name: "Serum physiologique", category: "Soins", stock: 540, threshold: 100, unit_price: 300, expiry_date: "2028-01-01" },
  { name: "Artemether/Lumefantrine", category: "Antipaludique", stock: 90, threshold: 25, unit_price: 2200, expiry_date: "2027-12-01" },
];

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

async function findUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email);
    if (user) return user;
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

async function seedStock(adminClient: any) {
  for (const item of STOCK_SEED) {
    const existing = await adminClient
      .schema("app")
      .from("stock_items")
      .select("id")
      .eq("kind", "pharmacy")
      .eq("name", item.name)
      .maybeSingle();
    if (!existing.data?.id) {
      await adminClient.schema("app").from("stock_items").insert({ kind: "pharmacy", ...item });
    }
  }
}

async function seedSecretaryQueue(adminClient: any, createdBy: string) {
  const existing = await adminClient
    .schema("app")
    .from("appointments")
    .select("id")
    .eq("reason", "Consultation de demonstration")
    .maybeSingle();
  if (existing.data?.id) return;

  const patient = await adminClient
    .schema("app")
    .from("patients")
    .insert({
      first_name: "Chantal",
      last_name: "Ndem",
      sex: "F",
      birth_date: "1994-06-12",
      blood_type: "O+",
      phone: "693904197",
      address: "Douala",
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (patient.error) throw patient.error;

  const when = new Date();
  when.setHours(Math.max(9, when.getHours() + 1), 0, 0, 0);
  await adminClient.schema("app").from("appointments").insert({
    patient_id: patient.data.id,
    scheduled_at: when.toISOString(),
    status: "en_attente",
    reason: "Consultation de demonstration",
    created_by: createdBy,
  });
}

async function ensureDemoUser(adminClient: any, email: string) {
  const demo = DEMO[email];
  let user = await findUserByEmail(adminClient, email);
  if (!user?.id) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: demo.password,
      email_confirm: true,
      user_metadata: {
        role: demo.role,
        full_name: demo.name,
        first_name: demo.role === "patient" ? "Pierre" : undefined,
        last_name: demo.role === "patient" ? "Durand" : undefined,
        sex: demo.role === "patient" ? "M" : undefined,
        birth_date: demo.role === "patient" ? "1990-01-01" : undefined,
        blood_type: demo.role === "patient" ? "O+" : undefined,
      },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      password: demo.password,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata ?? {}), role: demo.role, full_name: demo.name },
    });
    if (error) throw error;
  }

  if (!user?.id) throw new Error(`Demo user unavailable: ${email}`);

  const profile = await (adminClient as any)
    .schema("app")
    .from("profiles")
    .upsert(
      { user_id: user.id, role: demo.role, full_name: demo.name },
      { onConflict: "user_id" },
    );
  if (profile.error) throw profile.error;

  return user;
}

async function seedAllDemoUsers(adminClient: any) {
  const users: Record<string, any> = {};
  for (const email of Object.keys(DEMO)) {
    users[email] = await ensureDemoUser(adminClient, email);
  }
  return users;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("URL") ?? "";
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_FUNCTION_SERVICE_ROLE_KEY") ??
      "";
    if (!url || !serviceRoleKey) return json(500, { error: "Missing Supabase service env vars" });

    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const demo = DEMO[email];
    if (!demo || password !== demo.password) return json(403, { error: "Demo account not allowed" });

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const allUsers = await seedAllDemoUsers(adminClient);
    const user = allUsers[email];
    if (!user?.id) return json(500, { error: "Demo user unavailable" });

    await seedStock(adminClient as any);
    await seedSecretaryQueue(adminClient as any, user.id);

    if (demo.role === "patient") {
      const existing = await (adminClient as any)
        .schema("app")
        .from("patient_accounts")
        .select("patient_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing.data?.patient_id) {
        const patient = await (adminClient as any)
          .schema("app")
          .from("patients")
          .insert({
            first_name: "Pierre",
            last_name: "Durand",
            sex: "M",
            birth_date: "1990-01-01",
            blood_type: "O+",
            phone: "693904197",
            address: "Douala",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (patient.error) throw patient.error;

        await (adminClient as any)
          .schema("app")
          .from("patient_accounts")
          .insert({ user_id: user.id, patient_id: patient.data.id });
      }
    }

    return json(200, { ok: true, user_id: user.id, role: demo.role });
  } catch (e) {
    return json(500, { error: (e as any)?.message ?? "Unknown error" });
  }
});
