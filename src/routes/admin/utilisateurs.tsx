import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useMemo, useState } from "react";
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
  const roleOptions = useMemo(() => ROLES.filter((r) => r.id !== "patient"), []);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RoleId>("medecin");
  const [loading, setLoading] = useState(false);

  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    if (!cleanEmail || !cleanName) return;

    setLoading(true);
    try {
      const supabase = await getSupabaseAsync();
      const { data, error } = await supabase.functions.invoke<CreateUserResponse>("admin-create-user", {
        body: {
          email: cleanEmail,
          role,
          full_name: cleanName,
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

      setEmail("");
      setFullName("");
      setRole("medecin");
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de créer l'utilisateur.");
    } finally {
      setLoading(false);
    }
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
    </DashboardLayout>
  );
}
