import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, type Role } from "@/lib/store";
import { roleLabel } from "@/lib/roles";
import { getSupabaseAsync } from "@/lib/supabase";
import {
  Activity, LayoutDashboard, Pill, Users, Calendar, HeartPulse,
  LogOut, Bell, Search, Stethoscope, ClipboardList, FileText,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { to: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
    { to: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
    { to: "/admin/pharmacie", label: "Pharmacie", icon: Pill },
  ],
  medecin: [
    { to: "/medecin", label: "Consultations", icon: Stethoscope },
  ],
  infirmier: [
    { to: "/infirmier", label: "Soins du jour", icon: HeartPulse },
  ],
  secretaire: [
    { to: "/secretaire", label: "Rendez-vous", icon: Calendar },
  ],
  comptable: [
    { to: "/comptable", label: "Facturation", icon: FileText },
  ],
  pharmacien: [
    { to: "/pharmacien", label: "Pharmacie", icon: Pill },
  ],
  directeur: [
    { to: "/directeur", label: "Tableau de bord", icon: LayoutDashboard },
  ],
  patient: [
    { to: "/patient", label: "Mon Espace", icon: LayoutDashboard },
  ],
};

export function DashboardLayout({
  allow,
  children,
  title,
}: {
  allow: Role;
  children: ReactNode;
  title: string;
}) {
  const user = useAuth((s: { user: Role extends never ? never : any }) => s.user);
  const logout = useAuth((s: { logout: () => void }) => s.logout);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s: any) => s.location.pathname });

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; at: string; text: string }>>([]);

  const canSeeAudit = useMemo(() => user?.role === "admin", [user?.role]);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (user.role !== allow) {
      navigate({ to: "/forbidden" });
    }
  }, [user, allow, navigate]);

  useEffect(() => {
    if (!notifOpen) return;
    if (!user) return;

    let alive = true;
    let channel: any;

    async function loadAndSubscribe() {
      setNotifError(null);
      if (!canSeeAudit) {
        setMessages([]);
        return;
      }

      setNotifLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        const sb: any = supabase;

        const { data, error } = await sb
          .schema("app")
          .from("audit_logs")
          .select(`
            id,
            created_at,
            action,
            target_table,
            actor_role,
            profiles:actor_user_id (
              full_name
            )
          `)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;

        const mapped = (data ?? []).map((r: any) => {
          const actorName = r.profiles?.full_name ?? r.actor_role ?? "Système";
          return {
            id: String(r.id),
            at: String(r.created_at ?? ""),
            text: `${actorName} · ${r.action ?? ""}${r.target_table ? ` [${r.target_table}]` : ""}`,
          };
        });

        if (alive) setMessages(mapped);

        channel = supabase
          .channel("audit_logs_notifications")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "app", table: "audit_logs" },
            (payload: any) => {
              const n = payload?.new;
              if (!n?.id) return;
              const next = {
                id: String(n.id),
                at: String(n.created_at ?? ""),
                text: `${n.actor_role ?? "Système"} · ${n.action ?? ""}${n.target_table ? ` [${n.target_table}]` : ""}`,
              };
              setMessages((prev) => [next, ...prev].slice(0, 20));
            },
          )
          .subscribe();
      } catch (e: any) {
        if (alive) setNotifError(e?.message ?? "Impossible de charger les notifications.");
      } finally {
        if (alive) setNotifLoading(false);
      }
    }

    void loadAndSubscribe();

    return () => {
      alive = false;
      try {
        if (channel) {
          const supabaseAny = (channel as any).supabase ?? null;
          // Best-effort: remove channel if possible
          if (supabaseAny?.removeChannel) supabaseAny.removeChannel(channel);
        }
      } catch {
        // ignore
      }
    };
  }, [notifOpen, user, canSeeAudit]);

  if (!user || user.role !== allow) return null;

  const items = NAV[allow];

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-[color:var(--navy)] text-white p-5 sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl mb-10">
          <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)]">
            <Activity className="size-5" strokeWidth={2.5} />
          </span>
          2KC
        </Link>

        <p className="text-xs uppercase tracking-widest text-white/40 mb-3">{roleLabel(user.role)}</p>
        <nav className="space-y-1">
          {items.map((it) => {
            const active = path === it.to;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="active-pill"
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-[color:var(--mint)]"
                  />
                )}
                <it.icon className="size-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="rounded-xl glass-dark p-3 flex items-center gap-3">
            <div className="size-9 rounded-full gradient-mint grid place-items-center text-[color:var(--navy)] font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-white/50 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate({ to: "/" }); }}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 py-2 text-sm transition"
          >
            <LogOut className="size-4" /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b">
          <div className="flex items-center justify-between gap-4 px-6 lg:px-10 py-4">
            <div>
              <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
              <h1 className="text-xl font-bold text-[color:var(--navy)]">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Rechercher..."
                  className="pl-9 pr-4 py-2 rounded-xl border bg-card text-sm w-64 outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                />
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="relative size-10 rounded-xl border bg-card grid place-items-center text-[color:var(--navy)] hover:bg-muted transition"
                >
                <Bell className="size-4" />
                <span className="absolute top-2 right-2 size-2 rounded-full bg-[color:var(--mint)]" />
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl border bg-card shadow-lg overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--navy)]">Notifications</p>
                          <p className="text-xs text-muted-foreground">
                            {canSeeAudit ? "Temps réel (audit)" : "Non disponible pour ce rôle"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNotifOpen(false)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Fermer
                        </button>
                      </div>

                      <div className="max-h-[420px] overflow-auto">
                        {notifLoading && <div className="px-4 py-3 text-sm text-muted-foreground">Chargement…</div>}
                        {notifError && <div className="px-4 py-3 text-sm text-red-600">{notifError}</div>}

                        {!notifLoading && !notifError && messages.length === 0 && (
                          <div className="px-4 py-6 text-sm text-muted-foreground">
                            {canSeeAudit ? "Aucun message." : "Aucun message pour ce rôle."}
                          </div>
                        )}

                        {!notifLoading && !notifError && messages.length > 0 && (
                          <ul className="divide-y">
                            {messages.map((m) => (
                              <li key={m.id} className="px-4 py-3">
                                <p className="text-sm text-[color:var(--navy)] break-words">{m.text}</p>
                                <p className="text-xs text-muted-foreground mt-1">{m.at}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={path}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="p-6 lg:p-10"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export function StatCard({
  label, value, hint, icon: Icon, accent,
}: { label: string; value: string | number; hint?: string; icon: React.ComponentType<{ className?: string }>; accent?: boolean; }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={`rounded-3xl p-6 border ${accent ? "bg-[color:var(--navy)] text-white" : "bg-card"} shadow-sm`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-sm ${accent ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
        <span className={`size-10 rounded-xl grid place-items-center ${accent ? "gradient-mint text-[color:var(--navy)]" : "bg-muted text-[color:var(--navy)]"}`}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className={`mt-4 font-display text-4xl font-bold ${accent ? "" : "text-[color:var(--navy)]"}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${accent ? "text-white/60" : "text-muted-foreground"}`}>{hint}</p>}
    </motion.div>
  );
}

export const cardIcons = { Users, Calendar, Activity, Pill, ClipboardList, FileText };
