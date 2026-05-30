import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getSupabaseAsync } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";

export const Route = createFileRoute("/admin/utilisateurs")({
  component: AdminUsers,
});

type RoleId = (typeof ROLES)[number]["id"];

type CreateUserResponse = {
  user: { id: string | null; email: string | null };
  password: string;
  emailSent?: boolean;
  emailError?: string | null;
};

function AdminUsers() {
  const roleOptions = useMemo(() => ROLES, []);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RoleId>("medecin");
  const [loading, setLoading] = useState(false);
  const [patientFirstName, setPatientFirstName] = useState("");
  const [patientLastName, setPatientLastName] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [patientSex, setPatientSex] = useState("");
  const [patientBirthDate, setPatientBirthDate] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    if (!cleanEmail || !cleanName) return;
    if (role === "patient") {
      if (!patientFirstName.trim() || !patientLastName.trim()) {
        toast.error("Renseigne le prénom et le nom du patient.");
        return;
      }
      if (!bloodType) {
        toast.error("Sélectionne le groupe sanguin.");
        return;
      }
      if (!patientSex) {
        toast.error("Sélectionne le sexe (M/F).");
        return;
      }
      if (!patientBirthDate) {
        toast.error("Saisis la date de naissance.");
        return;
      }
    }

    setLoading(true);
    try {
      const supabase = await getSupabaseAsync();
      const { data, error } = await supabase.functions.invoke<CreateUserResponse>("admin-create-user", {
        body: {
          email: cleanEmail,
          role,
          full_name: cleanName,
          // pass patient metadata so the trigger can create the record on invite
          first_name: role === "patient" ? patientFirstName.trim() : undefined,
          last_name: role === "patient" ? patientLastName.trim() : undefined,
          sex: role === "patient" ? patientSex : undefined,
          birth_date: role === "patient" ? patientBirthDate : undefined,
          blood_type: role === "patient" ? bloodType : undefined,
        },
      });

      if (error) throw error;
      if (!data?.password) throw new Error("Réponse invalide.");

      setCreatedEmail(cleanEmail);
      setCreatedPassword(data.password);

      if (data.emailSent) {
        toast.success("Utilisateur créé et email envoyé !");
      } else {
        toast.warning(
          `Utilisateur créé mais l'email n'a pas pu être envoyé: ${data.emailError || "Erreur SMTP unknown"}`
        );
      }

      // Patient record/link is handled by DB trigger using user_metadata on create.

      setEmail("");
      setFullName("");
      setRole("medecin");
      setPatientFirstName("");
      setPatientLastName("");
      setBloodType("");
      setPatientSex("");
      setPatientBirthDate("");
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de créer l'utilisateur.");
    } finally {
      setLoading(false);
    }
  }

type ProfileRow = { user_id: string; role: RoleId; full_name: string };

function ManageUsersSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleId | "">("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const locationSearch = (window?.location?.search ?? "");

  // Initialize q from ?q=
  useEffect(() => {
    try {
      const params = new URLSearchParams(locationSearch);
      const initial = params.get("q") ?? "";
      setQ(initial);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      (async () => {
        setLoading(true);
        try {
          const supabase = await getSupabaseAsync();
          let qb: any = supabase.from("profiles").select("user_id, full_name, role").order("full_name");
          if (q.trim()) qb = qb.ilike("full_name", `%${q.trim()}%`);
          if (role) qb = qb.eq("role", role);
          const { data, error } = await qb;
          if (error) throw error;
          if (!alive) return;
          setRows((data ?? []) as any);
        } catch (e: any) {
          if (alive) toast.error(e?.message ?? "Chargement impossible.");
        } finally {
          if (alive) setLoading(false);
        }
      })();
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, role]);

  async function saveRow(r: ProfileRow) {
    setSavingId(r.user_id);
    try {
      const supabase = await getSupabaseAsync();
      const { error } = await supabase.from("profiles").update({ full_name: r.full_name, role: r.role }).eq("user_id", r.user_id);
      if (error) throw error;
      toast.success("Modifications enregistrées.");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la sauvegarde.");
    } finally {
      setSavingId(null);
    }
  }

  async function resetPassword(user_id: string) {
    setActionMsg(null);
    try {
      const supabase = await getSupabaseAsync();
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { op: "reset_password", user_id },
      });
      if (error) throw error;
      const pwd = (data as any)?.password as string | undefined;
      if (!pwd) throw new Error("Réponse invalide");
      setActionMsg(`Nouveau mot de passe: ${pwd}`);
      toast.success("Mot de passe réinitialisé.");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la réinitialisation.");
    }
  }

  async function deleteUser(user_id: string) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      const supabase = await getSupabaseAsync();
      await supabase.schema("app").from("patient_accounts").delete().eq("user_id", user_id);
      await supabase.from("profiles").delete().eq("user_id", user_id);
      const { error } = await supabase.functions.invoke("admin-manage-user", { body: { op: "delete_user", user_id } });
      if (error) throw error;
      setRows((prev) => prev.filter((x) => x.user_id !== user_id));
      toast.success("Utilisateur supprimé.");
    } catch (e: any) {
      toast.error(e?.message ?? "Suppression impossible.");
    }
  }

  return (
    <div className="mt-8 rounded-3xl border bg-card p-7">
      <h3 className="text-lg font-bold text-[color:var(--navy)]">Gérer les utilisateurs</h3>
      <div className="mt-4 grid sm:grid-cols-3 gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom…"
          className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RoleId | "")}
          className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
        >
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        <div className="text-sm text-muted-foreground flex items-center">{loading ? "Chargement…" : `${rows.length} utilisateur(s)`}</div>
      </div>

      {actionMsg && (
        <div className="mt-4 rounded-2xl border bg-muted/30 p-4 text-sm break-all">{actionMsg}</div>
      )}

      <div className="mt-4 space-y-3">
        {(rows ?? []).map((r) => (
          <div key={r.user_id} className="rounded-2xl border p-4 bg-muted/20 grid md:grid-cols-4 gap-3 items-center">
            <input
              value={r.full_name}
              onChange={(e) => {
                const v = e.target.value;
                setRows((prev) => prev.map((x) => (x.user_id === r.user_id ? { ...x, full_name: v } : x)));
              }}
              className="rounded-xl border bg-background px-3 py-2 text-sm outline-none"
            />
            <select
              value={r.role}
              onChange={(e) => {
                const v = e.target.value as RoleId;
                setRows((prev) => prev.map((x) => (x.user_id === r.user_id ? { ...x, role: v } : x)));
              }}
              className="rounded-xl border bg-background px-3 py-2 text-sm outline-none"
            >
              {ROLES.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={savingId === r.user_id}
                onClick={() => void saveRow(r)}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => void resetPassword(r.user_id)}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-muted"
              >
                Réinit. MDP
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void deleteUser(r.user_id)}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-muted text-red-600 border-red-200"
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SeedUsersSection() {
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function seed() {
    if (!confirm("Créer des utilisateurs de démonstration (5 par rôle) ?")) return;
    setLoading(true);
    setResult(null);
    try {
      const supabase = await getSupabaseAsync();
      const { data, error } = await supabase.functions.invoke("admin-manage-user", { body: { op: "seed", perRole: count } });
      if (error) throw error;
      setResult(JSON.stringify(data));
      toast.success("Création terminée.");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de création.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 rounded-3xl border bg-card p-7">
      <h3 className="text-lg font-bold text-[color:var(--navy)]">Créer des utilisateurs par rôle</h3>
      <p className="text-sm text-muted-foreground mt-1">Crée des comptes de démonstration pour augmenter le volume.</p>
      <div className="mt-4 flex items-center gap-3">
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          className="w-28 rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void seed()}
          className="rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold px-4 py-2.5 disabled:opacity-60"
        >
          Lancer
        </button>
      </div>
      {result && <div className="mt-4 rounded-2xl border bg-muted/30 p-4 text-xs break-all">{result}</div>}
    </div>
  );
}

  return (
    <DashboardLayout allow="admin" title="Utilisateurs">
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border bg-card p-7">
          <h3 className="text-lg font-bold text-[color:var(--navy)]">Créer un utilisateur</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Un mot de passe est généré automatiquement. Communique-le à l'utilisateur.
          </p>

          <form onSubmit={createUser} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Nom complet</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: Dr Karim Cissé"
                className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@domaine.com"
                className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Rôle</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RoleId)}
                className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
              >
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {role === "patient" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Prénom (patient)</label>
                  <input
                    value={patientFirstName}
                    onChange={(e) => setPatientFirstName(e.target.value)}
                    placeholder="Ex: Chantal"
                    className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Nom (patient)</label>
                  <input
                    value={patientLastName}
                    onChange={(e) => setPatientLastName(e.target.value)}
                    placeholder="Ex: Ndzi"
                    className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Sexe</label>
                  <select
                    value={patientSex}
                    onChange={(e) => setPatientSex(e.target.value)}
                    className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none"
                    required
                  >
                    <option value="">— Sélectionner —</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Date de naissance</label>
                  <input
                    type="date"
                    value={patientBirthDate}
                    onChange={(e) => setPatientBirthDate(e.target.value)}
                    className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none"
                    required
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Groupe sanguin</label>
                  <select
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                    className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none"
                    required
                  >
                    <option value="">— Sélectionner —</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-4 shadow-mint hover:brightness-110 transition disabled:opacity-60"
            >
              Créer l'utilisateur
            </button>
          </form>
        </div>

        <div className="rounded-3xl border bg-card p-7">
          <h3 className="text-lg font-bold text-[color:var(--navy)]">Mot de passe généré</h3>
          <p className="text-sm text-muted-foreground mt-1">Le mot de passe s’affiche une seule fois ici.</p>

          {createdPassword ? (
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Utilisateur</p>
                <p className="text-sm font-semibold text-[color:var(--navy)] break-all">{createdEmail}</p>
              </div>
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Mot de passe</p>
                <p className="text-sm font-mono font-semibold text-[color:var(--navy)] break-all">{createdPassword}</p>
              </div>
              <button
                type="button"
                className="w-full rounded-2xl border py-3 text-sm font-semibold hover:bg-muted"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createdPassword);
                    toast.success("Mot de passe copié.");
                  } catch {
                    toast.error("Impossible de copier.");
                  }
                }}
              >
                Copier le mot de passe
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border bg-muted/30 p-6 text-sm text-muted-foreground">
              Crée un utilisateur pour voir le mot de passe ici.
            </div>
          )}
        </div>
      </div>

      <LinkUserPatientSection />

      <ManageUsersSection />
      <SeedUsersSection />
    </DashboardLayout>
  );
}

type PatientRow = { id: string; first_name: string; last_name: string; patient_code: string };
type PatientUser = { user_id: string; full_name: string; role: string };
type AccountRow = { user_id: string; patient_id: string; created_at: string };

function LinkUserPatientSection() {
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [patientUsers, setPatientUsers] = useState<PatientUser[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const [selUserId, setSelUserId] = useState("");
  const [selPatientId, setSelPatientId] = useState("");
  const [linking, setLinking] = useState(false);
  const [qUser, setQUser] = useState("");
  const [qPatient, setQPatient] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        const sb: any = supabase;
        const [u, p, a] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name, role").eq("role", "patient"),
          sb.schema("app").from("patients").select("id, first_name, last_name, patient_code").order("last_name", { ascending: true }),
          sb.schema("app").from("patient_accounts").select("user_id, patient_id, created_at"),
        ]);
        if (u.error) throw u.error;
        if (p.error) throw p.error;
        if (a.error) throw a.error;
        if (!alive) return;
        setPatientUsers((u.data ?? []) as any);
        setPatients((p.data ?? []) as any);
        setAccounts((a.data ?? []) as any);
      } catch (err: any) {
        toast.error(err?.message ?? "Erreur de chargement (liaison patient)");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const linkedUserIds = useMemo(() => new Set(accounts.map((x) => x.user_id)), [accounts]);
  const linkedPatientIds = useMemo(() => new Set(accounts.map((x) => x.patient_id)), [accounts]);

  const filteredUsers = useMemo(() => {
    const q = qUser.trim().toLowerCase();
    return patientUsers
      .filter((u) => !linkedUserIds.has(u.user_id))
      .filter((u) => (q ? u.full_name.toLowerCase().includes(q) : true));
  }, [patientUsers, linkedUserIds, qUser]);

  const filteredPatients = useMemo(() => {
    const q = qPatient.trim().toLowerCase();
    return patients
      .filter((p) => !linkedPatientIds.has(p.id))
      .filter((p) =>
        q ? `${p.patient_code} ${p.first_name} ${p.last_name}`.toLowerCase().includes(q) : true,
      );
  }, [patients, linkedPatientIds, qPatient]);

  async function linkNow() {
    if (!selUserId || !selPatientId) {
      toast.error("Sélectionne un utilisateur et un patient.");
      return;
    }
    if (linkedUserIds.has(selUserId)) {
      toast.error("Cet utilisateur est déjà lié.");
      return;
    }
    if (linkedPatientIds.has(selPatientId)) {
      toast.error("Ce patient est déjà lié à un autre utilisateur.");
      return;
    }
    setLinking(true);
    try {
      const supabase = await getSupabaseAsync();
      const sb: any = supabase;
      const { error } = await sb
        .schema("app")
        .from("patient_accounts")
        .insert({ user_id: selUserId, patient_id: selPatientId });
      if (error) throw error;
      toast.success("Liaison effectuée.");
      setAccounts((prev) => [...prev, { user_id: selUserId, patient_id: selPatientId, created_at: new Date().toISOString() }]);
      setSelUserId("");
      setSelPatientId("");
      setQUser("");
      setQPatient("");
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de lier.");
    } finally {
      setLinking(false);
    }
  }

  async function unlink(user_id: string) {
    try {
      const supabase = await getSupabaseAsync();
      const sb: any = supabase;
      const { error } = await sb.schema("app").from("patient_accounts").delete().eq("user_id", user_id);
      if (error) throw error;
      toast.success("Liaison supprimée.");
      setAccounts((prev) => prev.filter((x) => x.user_id !== user_id));
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  function nameOfPatient(p: PatientRow) {
    return `${p.last_name} ${p.first_name}`;
  }

  return (
    <div className="mt-8 rounded-3xl border bg-card p-7">
      <h3 className="text-lg font-bold text-[color:var(--navy)]">Lier un utilisateur Patient à une fiche</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Cette opération remplit <code>app.patient_accounts</code> et active les accès Patient (RLS).
      </p>

      <div className="mt-6 grid lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Utilisateur (rôle patient)</label>
          <input
            value={qUser}
            onChange={(e) => setQUser(e.target.value)}
            placeholder="Rechercher par nom…"
            className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
          />
          <select
            value={selUserId}
            onChange={(e) => setSelUserId(e.target.value)}
            className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
          >
            <option value="">— Sélectionner —</option>
            {(loading ? [] : filteredUsers).map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">Fiche patient</label>
          <input
            value={qPatient}
            onChange={(e) => setQPatient(e.target.value)}
            placeholder="Rechercher (code, nom)…"
            className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
          />
          <select
            value={selPatientId}
            onChange={(e) => setSelPatientId(e.target.value)}
            className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
          >
            <option value="">— Sélectionner —</option>
            {(loading ? [] : filteredPatients).map((p) => (
              <option key={p.id} value={p.id}>
                {p.patient_code} · {nameOfPatient(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            disabled={linking || !selUserId || !selPatientId}
            onClick={() => void linkNow()}
            className="w-full rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-3 disabled:opacity-60"
          >
            Lier
          </button>
        </div>
      </div>

      <div className="mt-8">
        <h4 className="font-semibold text-[color:var(--navy)]">Liaisons existantes</h4>
        <div className="mt-3 space-y-2">
          {(loading ? [] : accounts).length === 0 ? (
            <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">Aucune liaison.</div>
          ) : (
            (accounts ?? []).map((acc) => {
              const u = patientUsers.find((x) => x.user_id === acc.user_id);
              const p = patients.find((x) => x.id === acc.patient_id);
              return (
                <div key={`${acc.user_id}-${acc.patient_id}`} className="flex items-center justify-between gap-4 rounded-2xl border p-4 bg-muted/20">
                  <div>
                    <p className="font-semibold text-[color:var(--navy)]">{u?.full_name ?? acc.user_id}</p>
                    <p className="text-xs text-muted-foreground">{p ? `${p.patient_code} · ${nameOfPatient(p)}` : acc.patient_id}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border px-3 py-1.5 text-xs hover:bg-muted"
                    onClick={() => void unlink(acc.user_id)}
                  >
                    Délier
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
