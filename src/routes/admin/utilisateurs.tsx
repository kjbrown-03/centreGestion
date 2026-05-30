import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Plus, UserRound } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { getSupabaseAsync } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";
import { downloadCredentialsTxt } from "@/lib/credentials-file";

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
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RoleId>("medecin");

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    if (!cleanEmail || !cleanName) return;

    setCreating(true);
    setActionMsg(null);
    try {
      const supabase = await getSupabaseAsync();
      const { data, error } = await supabase.functions.invoke<CreateUserResponse>("admin-create-user", {
        body: {
          op: "create_user",
          email: cleanEmail,
          role,
          full_name: cleanName,
        },
      });
      if (error) throw error;
      if (!data?.password) throw new Error("Reponse invalide.");

      downloadCredentialsTxt({
        email: cleanEmail,
        password: data.password,
        role,
        fullName: cleanName,
        source: "admin_creation",
      });

      if (data.emailSent) {
        toast.success("Utilisateur créé. Email envoyé et fichier d'identifiants téléchargé.");
        setActionMsg(`Compte créé pour ${cleanEmail}. Le mot de passe a été envoyé par email et téléchargé en fichier txt.`);
      } else {
        toast.warning(data.emailError ?? "Utilisateur créé, mais l'email n'a pas été envoyé.");
        setActionMsg(`Mot de passe pour ${cleanEmail}: ${data.password}. Un fichier txt a aussi été téléchargé.`);
      }

      setEmail("");
      setFullName("");
      setRole("medecin");
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

  return (
    <DashboardLayout allow="admin" title="Utilisateurs">
      <div className="mx-auto max-w-2xl rounded-2xl sm:rounded-3xl border bg-card p-4 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="size-11 rounded-2xl gradient-mint text-[color:var(--navy)] grid place-items-center shrink-0">
            <UserRound className="size-5" />
          </span>
          <div>
            <h3 className="text-xl font-bold text-[color:var(--navy)]">Créer un utilisateur</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Le mot de passe est généré automatiquement puis envoyé à l'adresse email renseignée.
            </p>
          </div>
        </div>

        <form onSubmit={createUser} className="mt-6 space-y-4">
          <Field label="Nom complet">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex: Dr Karim Cisse"
              className={inputClass}
              required
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nom@domaine.com"
              className={inputClass}
              required
            />
          </Field>
          <Field label="Rôle">
            <select value={role} onChange={(e) => setRole(e.target.value as RoleId)} className={inputClass}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {actionMsg ? (
            <div className="rounded-2xl border bg-muted/30 p-4 text-sm break-all">{actionMsg}</div>
          ) : null}

          <button
            type="submit"
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-4 shadow-mint hover:brightness-110 transition disabled:opacity-60"
          >
            {creating ? <Mail className="size-4 animate-pulse" /> : <Plus className="size-4" />}
            {creating ? "Création et envoi..." : "Créer et envoyer"}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}

const inputClass =
  "w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)]">{label}</span>
      {children}
    </label>
  );
}
