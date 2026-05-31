import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Mail, Pencil, Plus, RefreshCw, Save, Trash2, UserRound } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { getSupabaseAsync } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";
import { downloadCredentialsTxt } from "@/lib/credentials-file";

export const Route = createFileRoute("/admin/utilisateurs")({
  component: AdminUsers,
});

type RoleId = (typeof ROLES)[number]["id"];

type AppUser = {
  id: string;
  email: string;
  role: RoleId;
  full_name: string;
  phone?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

type CreateUserResponse = {
  user: { id: string | null; email: string | null };
  password: string;
  emailSent?: boolean;
  emailError?: string | null;
};

type ListUsersResponse = {
  users: AppUser[];
};

type ResetPasswordResponse = {
  password: string;
  emailSent?: boolean;
  emailError?: string | null;
};

function AdminUsers() {
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RoleId>("medecin");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ email: "", full_name: "", role: "patient" as RoleId });

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => `${u.email} ${u.full_name} ${u.role}`.toLowerCase().includes(needle));
  }, [query, users]);

  const hasSecretary = useMemo(() => users.some((u) => u.role === "secretaire"), [users]);
  const hasPharmacien = useMemo(() => users.some((u) => u.role === "pharmacien"), [users]);
  const hasDirecteur = useMemo(() => users.some((u) => u.role === "directeur"), [users]);
  const hasComptable = useMemo(() => users.some((u) => u.role === "comptable"), [users]);
  const secretaryEmail = "secretaire@gmail.com";
  const pharmacienEmail = "patientdjappa@gmail.com";
  const directeurEmail = "taffb6866@gmail.com";
  const comptableEmail = "kemzeugillesparfait@gmail.com";

  useEffect(() => {
    void loadUsers();
  }, []);

  async function invokeAdmin<T>(body: Record<string, unknown>) {
    const supabase = await getSupabaseAsync();
    const { data, error } = await supabase.functions.invoke<T>("admin-create-user", { body });
    if (error) {
      const context = (error as any)?.context;
      const payload = typeof context?.json === "function" ? await context.json().catch(() => null) : null;
      throw new Error(payload?.error ?? error.message ?? "Erreur fonction Supabase.");
    }
    return data;
  }

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await invokeAdmin<ListUsersResponse>({ op: "list_users" });
      setUsers(data?.users ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de charger les utilisateurs.");
    } finally {
      setLoading(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    if (!cleanEmail || !cleanName) return;

    if (role === "secretaire") {
      if (cleanEmail !== secretaryEmail) return toast.error(`Le compte secrétaire doit utiliser l'email ${secretaryEmail}.`);
      if (hasSecretary) return toast.error("Un compte secrétaire existe déjà.");
    }
    if (role === "pharmacien") {
      if (cleanEmail !== pharmacienEmail) return toast.error(`Le compte pharmacien doit utiliser l'email ${pharmacienEmail}.`);
      if (hasPharmacien) return toast.error("Un compte pharmacien existe déjà.");
    }
    if (role === "directeur") {
      if (cleanEmail !== directeurEmail) return toast.error(`Le compte directeur doit utiliser l'email ${directeurEmail}.`);
      if (hasDirecteur) return toast.error("Un compte directeur existe déjà.");
    }
    if (role === "comptable") {
      if (cleanEmail !== comptableEmail) return toast.error(`Le compte comptable doit utiliser l'email ${comptableEmail}.`);
      if (hasComptable) return toast.error("Un compte comptable existe déjà.");
    }

    setCreating(true);
    setActionMsg(null);
    try {
      const data = await invokeAdmin<CreateUserResponse>({
        op: "create_user",
        email: cleanEmail,
        role,
        full_name: cleanName,
      });
      if (!data?.password) throw new Error("Réponse invalide.");

      downloadCredentialsTxt({
        email: cleanEmail,
        password: data.password,
        role,
        fullName: cleanName,
        source: "admin_creation",
      });

      if (data.emailSent) {
        toast.success("Utilisateur créé. Email envoyé et fichier d'identifiants téléchargé.");
        setActionMsg(`Compte créé pour ${cleanEmail}. Mot de passe envoyé par email et ajouté au fichier txt.`);
      } else {
        toast.warning(data.emailError ?? "Utilisateur créé, mais l'email n'a pas été envoyé.");
        setActionMsg(`Mot de passe pour ${cleanEmail}: ${data.password}. Il a aussi été ajouté au fichier txt.`);
      }

      setEmail("");
      setFullName("");
      setRole("medecin");
      await loadUsers();
    } catch (err: any) {
      const message = String(err?.message ?? "Création impossible.");
      toast.error(
        message.includes("Failed to send a request")
          ? "Edge Function admin-create-user indisponible. Déployez-la dans Supabase puis réessayez."
          : message,
      );
    } finally {
      setCreating(false);
    }
  }

  function startEdit(user: AppUser) {
    setEditingId(user.id);
    setEditForm({ email: user.email, full_name: user.full_name, role: user.role });
  }

  async function saveEdit(userId: string) {
    setWorkingId(userId);
    try {
      const newEmail = editForm.email.trim().toLowerCase();
      if (editForm.role === "secretaire") {
        if (newEmail !== secretaryEmail) throw new Error(`Le compte secrétaire doit utiliser l'email ${secretaryEmail}.`);
        if (users.some((u) => u.id !== userId && u.role === "secretaire")) throw new Error("Un compte secrétaire existe déjà.");
      }
      if (editForm.role === "pharmacien") {
        if (newEmail !== pharmacienEmail) throw new Error(`Le compte pharmacien doit utiliser l'email ${pharmacienEmail}.`);
        if (users.some((u) => u.id !== userId && u.role === "pharmacien")) throw new Error("Un compte pharmacien existe déjà.");
      }
      if (editForm.role === "directeur") {
        if (newEmail !== directeurEmail) throw new Error(`Le compte directeur doit utiliser l'email ${directeurEmail}.`);
        if (users.some((u) => u.id !== userId && u.role === "directeur")) throw new Error("Un compte directeur existe déjà.");
      }
      if (editForm.role === "comptable") {
        if (newEmail !== comptableEmail) throw new Error(`Le compte comptable doit utiliser l'email ${comptableEmail}.`);
        if (users.some((u) => u.id !== userId && u.role === "comptable")) throw new Error("Un compte comptable existe déjà.");
      }
      await invokeAdmin({ op: "update_user", user_id: userId, ...editForm });
      toast.success("Utilisateur mis à jour.");
      setEditingId(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message ?? "Mise à jour impossible.");
    } finally {
      setWorkingId(null);
    }
  }

  async function resetPassword(user: AppUser) {
    setWorkingId(user.id);
    try {
      const data = await invokeAdmin<ResetPasswordResponse>({ op: "reset_password", user_id: user.id });
      if (!data?.password) throw new Error("Mot de passe non reçu.");
      downloadCredentialsTxt({
        email: user.email,
        password: data.password,
        role: user.role,
        fullName: user.full_name,
        source: "admin_reset",
      });
      if (data.emailSent) {
        toast.success("Mot de passe réinitialisé et envoyé par email.");
      } else {
        toast.warning(data.emailError ?? "Mot de passe réinitialisé, mais email non envoyé.");
      }
      setActionMsg(`Nouveau mot de passe pour ${user.email}: ${data.password}. Ajouté au fichier txt.`);
    } catch (err: any) {
      toast.error(err?.message ?? "Réinitialisation impossible.");
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteUser(user: AppUser) {
    if (["secretaire", "pharmacien", "directeur", "comptable"].includes(user.role as any)) {
      toast.error("Ce compte est requis par le système et ne peut pas être supprimé.");
      return;
    }
    if (!window.confirm(`Supprimer ${user.email} ?`)) return;
    setWorkingId(user.id);
    try {
      await invokeAdmin({ op: "delete_user", user_id: user.id });
      toast.success("Utilisateur supprimé.");
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <DashboardLayout allow="admin" title="Utilisateurs">
      <div className="grid gap-6">
        <section className="mx-auto w-full max-w-2xl rounded-2xl sm:rounded-3xl border bg-card p-4 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="size-11 rounded-2xl gradient-mint text-[color:var(--navy)] grid place-items-center shrink-0">
              <UserRound className="size-5" />
            </span>
            <div>
              <h3 className="text-xl font-bold text-[color:var(--navy)]">Créer un utilisateur</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Le mot de passe est généré, envoyé par email si possible, puis ajouté au fichier txt cumulatif.
              </p>
            </div>
          </div>

          <form onSubmit={createUser} className="mt-6 space-y-4">
            <Field label="Nom complet">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex: Dr Karim Cisse" className={inputClass} required />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@domaine.com" className={inputClass} required />
            </Field>
            <Field label="Rôle">
              <select value={role} onChange={(e) => setRole(e.target.value as RoleId)} className={inputClass}>
                {ROLES.map((r) => {
                  if (r.id === "secretaire" && hasSecretary) return null;
                  if (r.id === "pharmacien" && hasPharmacien) return null;
                  if (r.id === "directeur" && hasDirecteur) return null;
                  if (r.id === "comptable" && hasComptable) return null;
                  return (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  );
                })}
              </select>
            </Field>

            {actionMsg ? <div className="rounded-2xl border bg-muted/30 p-4 text-sm break-all">{actionMsg}</div> : null}

            <button
              type="submit"
              disabled={creating}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-4 shadow-mint hover:brightness-110 transition disabled:opacity-60"
            >
              {creating ? <Mail className="size-4 animate-pulse" /> : <Plus className="size-4" />}
              {creating ? "Création et envoi..." : "Créer et envoyer"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl sm:rounded-3xl border bg-card p-4 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-bold text-[color:var(--navy)]">Liste des utilisateurs</h3>
              <p className="mt-1 text-sm text-muted-foreground">Modifier, réinitialiser ou supprimer les comptes.</p>
            </div>
            <button type="button" onClick={() => void loadUsers()} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-muted">
              <RefreshCw className="size-4" />
              Actualiser
            </button>
          </div>

          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrer par nom, email ou rôle..." className={`${inputClass} mt-5`} />

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-3">Nom</th>
                  <th className="py-3 pr-3">Email</th>
                  <th className="py-3 pr-3">Rôle</th>
                  <th className="py-3 pr-3">Dernière connexion</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Chargement...</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Aucun utilisateur.</td></tr>
                ) : (
                  filteredUsers.map((user) => {
                    const editing = editingId === user.id;
                    const busy = workingId === user.id;
                    return (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="py-3 pr-3">
                          {editing ? <input value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} className={smallInputClass} /> : <span className="font-semibold text-[color:var(--navy)]">{user.full_name}</span>}
                        </td>
                        <td className="py-3 pr-3">
                          {editing ? <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className={smallInputClass} /> : user.email}
                        </td>
                        <td className="py-3 pr-3">
                          {editing ? (
                            <select
                              value={editForm.role}
                              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as RoleId }))}
                              className={smallInputClass}
                            >
                              {ROLES.map((r) => {
                                // Empêcher d'assigner ces rôles s'ils existent déjà
                                if (r.id === "secretaire" && hasSecretary && users.find((u) => u.id !== editingId && u.role === "secretaire")) return null;
                                if (r.id === "pharmacien" && hasPharmacien && users.find((u) => u.id !== editingId && u.role === "pharmacien")) return null;
                                if (r.id === "directeur" && hasDirecteur && users.find((u) => u.id !== editingId && u.role === "directeur")) return null;
                                if (r.id === "comptable" && hasComptable && users.find((u) => u.id !== editingId && u.role === "comptable")) return null;
                                return (
                                  <option key={r.id} value={r.id}>{r.label}</option>
                                );
                              })}
                            </select>
                          ) : (
                            <span className="rounded-full border bg-muted/40 px-2 py-1 text-xs">{ROLES.find((r) => r.id === user.role)?.label ?? user.role}</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">
                          {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("fr-FR") : "-"}
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            {editing ? (
                              <button type="button" disabled={busy} onClick={() => void saveEdit(user.id)} className={iconButtonClass} title="Enregistrer">
                                <Save className="size-4" />
                              </button>
                            ) : (
                              <button type="button" disabled={busy} onClick={() => startEdit(user)} className={iconButtonClass} title="Modifier">
                                <Pencil className="size-4" />
                              </button>
                            )}
                            <button type="button" disabled={busy} onClick={() => void resetPassword(user)} className={iconButtonClass} title="Réinitialiser le mot de passe">
                              <KeyRound className="size-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy || ["secretaire","pharmacien","directeur","comptable"].includes(user.role as any)}
                              onClick={() => void deleteUser(user)}
                              className={`${iconButtonClass} text-red-600`}
                              title="Supprimer"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

const inputClass =
  "w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition";
const smallInputClass =
  "w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-2 focus:ring-[color:var(--mint)]/20 transition";
const iconButtonClass =
  "inline-grid size-9 place-items-center rounded-xl border bg-background hover:bg-muted disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">{label}</span>
      {children}
    </label>
  );
}
