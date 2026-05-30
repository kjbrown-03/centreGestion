import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save, Search, Trash2, KeyRound } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { getSupabaseAsync } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";

export const Route = createFileRoute("/admin/utilisateurs")({
  component: AdminUsers,
});

type RoleId = (typeof ROLES)[number]["id"];

type ProfileRow = {
  user_id: string;
  full_name: string;
  role: RoleId;
};

function AdminUsers() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleId | "">("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const roleById = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r.id, r.label])) as Record<RoleId, string>,
    [],
  );

  async function loadUsers() {
    setLoadingRows(true);
    try {
      const supabase = await getSupabaseAsync();
      const sb: any = supabase;
      let query = sb
        .schema("app")
        .from("profiles")
        .select("user_id, full_name, role")
        .order("full_name", { ascending: true });

      const needle = q.trim();
      if (needle) query = query.ilike("full_name", `%${needle}%`);
      if (roleFilter) query = query.eq("role", roleFilter);

      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []) as ProfileRow[]);
    } catch (err: any) {
      toast.error(err?.message ?? "Chargement des utilisateurs impossible.");
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => void loadUsers(), 250);
    return () => window.clearTimeout(id);
  }, [q, roleFilter]);

  async function saveRow(row: ProfileRow) {
    setSavingId(row.user_id);
    try {
      const supabase = await getSupabaseAsync();
      const { error } = await (supabase as any)
        .schema("app")
        .from("profiles")
        .update({ full_name: row.full_name.trim(), role: row.role })
        .eq("user_id", row.user_id);
      if (error) throw error;
      toast.success("Utilisateur modifie.");
    } catch (err: any) {
      toast.error(err?.message ?? "Sauvegarde impossible.");
    } finally {
      setSavingId(null);
    }
  }

  async function resetPassword(userId: string) {
    setActionMsg(null);
    try {
      const supabase = await getSupabaseAsync();
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { op: "reset_password", user_id: userId },
      });
      if (error) throw error;
      const pwd = (data as any)?.password as string | undefined;
      if (!pwd) throw new Error("Reponse invalide.");
      setActionMsg(`Nouveau mot de passe: ${pwd}`);
      toast.success("Mot de passe reinitialise.");
    } catch (err: any) {
      toast.error(err?.message ?? "Reinitialisation impossible.");
    }
  }

  async function deleteUser(userId: string) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      const supabase = await getSupabaseAsync();
      const { error } = await supabase.functions.invoke("admin-manage-user", {
        body: { op: "delete_user", user_id: userId },
      });
      if (error) throw error;
      setRows((prev) => prev.filter((row) => row.user_id !== userId));
      toast.success("Utilisateur supprime.");
    } catch (err: any) {
      toast.error(err?.message ?? "Suppression impossible.");
    }
  }

  return (
    <DashboardLayout allow="admin" title="Utilisateurs">
      <div className="rounded-2xl sm:rounded-3xl border bg-card p-4 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-xl font-bold text-[color:var(--navy)]">Utilisateurs et roles</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Modifiez le nom, changez le role, reinitialisez un mot de passe ou supprimez un compte.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] lg:w-[560px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher par nom..."
                className={inputClass + " pl-9"}
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleId | "")}
              className={inputClass}
            >
              <option value="">Tous les roles</option>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {actionMsg ? (
          <div className="mt-5 rounded-2xl border bg-muted/30 p-4 text-sm break-all">
            {actionMsg}
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {loadingRows ? <div className="text-sm text-muted-foreground">Chargement...</div> : null}
          {!loadingRows && rows.length === 0 ? (
            <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              Aucun utilisateur.
            </div>
          ) : null}

          {rows.map((row) => (
            <div key={row.user_id} className="rounded-2xl border bg-muted/20 p-3 sm:p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-center">
                <div>
                  <input
                    value={row.full_name}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x) =>
                          x.user_id === row.user_id ? { ...x, full_name: e.target.value } : x,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{row.user_id}</p>
                </div>
                <select
                  value={row.role}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((x) =>
                        x.user_id === row.user_id ? { ...x, role: e.target.value as RoleId } : x,
                      ),
                    )
                  }
                  className={inputClass}
                  aria-label={`Role de ${row.full_name}`}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <ActionButton disabled={savingId === row.user_id} onClick={() => void saveRow(row)}>
                    <Save className="size-3.5" /> Enregistrer
                  </ActionButton>
                  <ActionButton onClick={() => void resetPassword(row.user_id)}>
                    <KeyRound className="size-3.5" /> MDP
                  </ActionButton>
                  <button
                    type="button"
                    onClick={() => void deleteUser(row.user_id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" /> Supprimer
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Role actuel: <span className="font-medium text-[color:var(--navy)]">{roleById[row.role]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

const inputClass =
  "w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition";

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
    >
      {children}
    </button>
  );
}
