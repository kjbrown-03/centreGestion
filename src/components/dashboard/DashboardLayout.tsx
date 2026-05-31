import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, type Role } from "@/lib/store";
import { roleLabel } from "@/lib/roles";
import { getSupabaseAsync } from "@/lib/supabase";
import { medicalChatbot } from "@/lib/ai";
import {
  Activity,
  Bell,
  Bot,
  Calendar,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Pill,
  Search,
  Send,
  Stethoscope,
  Users,
  X,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NotificationItem = { id: string; at: string; text: string };
type ChatMessage = { id: string; role: "assistant" | "user"; text: string };

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { to: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
    { to: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
    { to: "/admin/pharmacie", label: "Pharmacie", icon: Pill },
  ],
  medecin: [{ to: "/medecin", label: "Consultations", icon: Stethoscope }],
  infirmier: [{ to: "/infirmier", label: "Soins du jour", icon: HeartPulse }],
  secretaire: [{ to: "/secretaire", label: "Rendez-vous", icon: Calendar }],
  comptable: [{ to: "/comptable", label: "Facturation", icon: FileText }],
  pharmacien: [{ to: "/pharmacien", label: "Pharmacie", icon: Pill }],
  directeur: [{ to: "/directeur", label: "Tableau de bord", icon: LayoutDashboard }],
  patient: [{ to: "/patient", label: "Mon Espace Santé", icon: LayoutDashboard }],
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
  const user = useAuth((s: { user: any }) => s.user);
  const logout = useAuth((s: { logout: () => void }) => s.logout);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const locationSearch = useRouterState({ select: (s) => s.location.search });

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [messages, setMessages] = useState<NotificationItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [chatbotInput, setChatbotInput] = useState("");
  const [chatbotLoading, setChatbotLoading] = useState(false);
  const [chatbotMessages, setChatbotMessages] = useState<ChatMessage[]>([]);

  const subtitle = useMemo(() => {
    if (!user?.role) return "Activité récente";
    if (user.role === "admin") return "Nouveaux utilisateurs";
    if (user.role === "secretaire") return "Demandes de rendez-vous";
    if (user.role === "medecin") return "Rendez-vous assignés";
    if (user.role === "infirmier") return "Soins et rendez-vous du jour";
    if (user.role === "pharmacien") return "Ordonnances et stock";
    if (user.role === "comptable") return "Factures et paiements";
    if (user.role === "directeur") return "KPI et activité du centre";
    if (user.role === "patient") return "Votre dossier patient";
    return "Activité récente";
  }, [user?.role]);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (user.role !== allow) navigate({ to: "/forbidden" });
  }, [user, allow, navigate]);

  useEffect(() => {
    if (!user) return;
    setChatbotMessages([
      {
        id: "welcome",
        role: "assistant",
        text: proactiveIntro(user.role),
      },
    ]);
  }, [user?.role, user?.email]);

  async function sendChatbotMessage(message?: string) {
    if (!user || chatbotLoading) return;
    const text = (message ?? chatbotInput).trim();
    if (!text) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    setChatbotMessages((prev) => [...prev, userMessage]);
    setChatbotInput("");
    setChatbotLoading(true);
    try {
      const answer = await medicalChatbot({
        role: user.role,
        userName: user.name,
        message: text,
        context: messages.map((m) => m.text).slice(0, 5),
      });
      setChatbotMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: answer },
      ]);
    } catch (err: any) {
      setChatbotMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err?.message ?? "Chatbot médical indisponible pour le moment.",
        },
      ]);
    } finally {
      setChatbotLoading(false);
    }
  }

  useEffect(() => {
    try {
      const params = new URLSearchParams(locationSearch ?? "");
      setSearchText(params.get("q") ?? "");
    } catch {
      // ignore
    }
  }, [locationSearch]);

  function defaultSearchRouteForRole(r: Role): string {
    if (path?.startsWith("/admin/pharmacie")) return "/admin/pharmacie";
    if (path?.startsWith("/admin/utilisateurs")) return "/admin/utilisateurs";
    if (path?.startsWith("/admin/patients")) return "/admin/patients";
    if (path?.startsWith("/admin/rendez-vous")) return "/admin/rendez-vous";

    switch (r) {
      case "admin": return "/admin";
      case "secretaire": return "/secretaire";
      case "medecin": return "/medecin";
      case "pharmacien": return "/pharmacien";
      case "directeur": return "/directeur";
      case "comptable": return "/comptable";
      case "infirmier": return "/infirmier";
      case "patient": return "/patient";
      default: return "/";
    }
  }

  function runSearch() {
    if (!user) return;
    const q = searchText.trim();
    const dest = defaultSearchRouteForRole(user.role as Role);
    navigate({ to: `${dest}${q ? `?q=${encodeURIComponent(q)}` : ""}` });
  }

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const channels: any[] = [];
    let supabaseForCleanup: any;

    const pushMessage = (item: NotificationItem) => {
      setMessages((prev) => {
        const withoutDuplicate = prev.filter((m) => m.id !== item.id);
        if (withoutDuplicate.length >= 5) return [item];
        return [item, ...withoutDuplicate];
      });
    };

    async function loadAndSubscribe() {
      setNotifError(null);
      setNotifLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        supabaseForCleanup = supabase;
        const sb: any = supabase;
        const authUser = (await supabase.auth.getUser()).data.user;
        const role = user.role as Role;
        const authUserId = authUser?.id;

        if (role === "admin") {
          const { data, error } = await sb.schema("app").from("profiles").select("user_id, full_name, role, created_at").order("created_at", { ascending: false }).limit(5);
          if (error) throw error;
          if (alive) setMessages((data ?? []).map((r: any) => ({ id: `profile-${r.user_id}`, at: String(r.created_at ?? ""), text: `Nouvel utilisateur: ${r.full_name ?? "Utilisateur"} (${r.role})` })));
          channels.push(supabase.channel(`notify_profiles_${Date.now()}`).on("postgres_changes", { event: "INSERT", schema: "app", table: "profiles" }, (payload: any) => {
            const n = payload?.new;
            if (n?.user_id) pushMessage({ id: `profile-${n.user_id}`, at: String(n.created_at ?? ""), text: `Nouvel utilisateur: ${n.full_name ?? "Utilisateur"} (${n.role})` });
          }).subscribe());
        } else if (role === "secretaire") {
          const { data, error } = await sb.schema("app").from("appointments").select("id, created_at, scheduled_at, status, reason, patient:patient_id(first_name,last_name)").order("created_at", { ascending: false }).limit(5);
          if (error) throw error;
          if (alive) setMessages((data ?? []).map((r: any) => ({ id: `appt-${r.id}`, at: String(r.created_at ?? r.scheduled_at ?? ""), text: `RDV ${r.status}: ${r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : "Patient"} - ${r.reason ?? "Consultation"}` })));
          channels.push(supabase.channel(`notify_appointments_${Date.now()}`).on("postgres_changes", { event: "INSERT", schema: "app", table: "appointments" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `appt-${n.id}`, at: String(n.created_at ?? n.scheduled_at ?? ""), text: `Nouveau rendez-vous: ${n.reason ?? "Consultation"}` });
          }).subscribe());
        } else if (role === "medecin") {
          if (!authUserId) {
            if (alive) setMessages([]);
            return;
          }
          const { data, error } = await sb.schema("app").from("appointments").select("id, created_at, scheduled_at, status, reason, patient:patient_id(first_name,last_name)").eq("practitioner_id", authUserId).order("scheduled_at", { ascending: false }).limit(5);
          if (error) throw error;
          if (alive) setMessages((data ?? []).map((r: any) => ({ id: `doctor-appt-${r.id}`, at: String(r.scheduled_at ?? r.created_at ?? ""), text: `RDV assigné: ${r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : "Patient"} - ${r.status}` })));
          channels.push(supabase.channel(`notify_doctor_${Date.now()}`).on("postgres_changes", { event: "*", schema: "app", table: "appointments" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id && n.practitioner_id === authUserId) pushMessage({ id: `doctor-appt-${n.id}`, at: String(n.scheduled_at ?? ""), text: `RDV mis à jour: ${n.status}` });
          }).subscribe());
        } else if (role === "infirmier") {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const [appts, vitals] = await Promise.all([
            sb.schema("app").from("appointments").select("id, created_at, scheduled_at, status, reason").gte("scheduled_at", today.toISOString()).lt("scheduled_at", tomorrow.toISOString()).order("scheduled_at", { ascending: true }).limit(4),
            sb.schema("app").from("vitals").select("id, measured_at, comment").order("measured_at", { ascending: false }).limit(2),
          ]);
          if (appts.error) throw appts.error;
          if (vitals.error) throw vitals.error;
          if (alive) {
            setMessages([
              ...(appts.data ?? []).map((r: any) => ({ id: `nurse-appt-${r.id}`, at: String(r.scheduled_at ?? r.created_at ?? ""), text: `Soin/consultation du jour: ${r.reason ?? "Rendez-vous"} (${r.status})` })),
              ...(vitals.data ?? []).map((r: any) => ({ id: `nurse-vital-${r.id}`, at: String(r.measured_at ?? ""), text: `Constantes enregistrées${r.comment ? `: ${r.comment}` : ""}` })),
            ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5));
          }
          channels.push(supabase.channel(`notify_nurse_${Date.now()}`).on("postgres_changes", { event: "*", schema: "app", table: "appointments" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `nurse-appt-${n.id}`, at: String(n.scheduled_at ?? n.created_at ?? ""), text: `Rendez-vous/soin mis à jour: ${n.status}` });
          }).on("postgres_changes", { event: "INSERT", schema: "app", table: "vitals" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `nurse-vital-${n.id}`, at: String(n.measured_at ?? ""), text: "Nouvelles constantes patient enregistrées" });
          }).subscribe());
        } else if (role === "pharmacien") {
          const { data, error } = await sb.schema("app").from("prescriptions").select("id, created_at, status").order("created_at", { ascending: false }).limit(5);
          if (error) throw error;
          if (alive) setMessages((data ?? []).map((r: any) => ({ id: `presc-${r.id}`, at: String(r.created_at ?? ""), text: `Ordonnance ${r.status}` })));
          channels.push(supabase.channel(`notify_prescriptions_${Date.now()}`).on("postgres_changes", { event: "INSERT", schema: "app", table: "prescriptions" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `presc-${n.id}`, at: String(n.created_at ?? ""), text: "Nouvelle ordonnance à préparer" });
          }).subscribe());
        } else if (role === "comptable") {
          const { data, error } = await sb.schema("app").from("invoices").select("id, invoice_no, status, total, created_at").order("created_at", { ascending: false }).limit(5);
          if (error) throw error;
          if (alive) setMessages((data ?? []).map((r: any) => ({ id: `invoice-${r.id}`, at: String(r.created_at ?? ""), text: `Facture ${r.invoice_no ?? ""}: ${Number(r.total ?? 0).toLocaleString("fr-FR")} FCFA (${r.status})` })));
          channels.push(supabase.channel(`notify_invoices_${Date.now()}`).on("postgres_changes", { event: "INSERT", schema: "app", table: "invoices" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `invoice-${n.id}`, at: String(n.created_at ?? ""), text: `Nouvelle facture: ${n.invoice_no ?? ""}` });
          }).subscribe());
        } else if (role === "directeur") {
          const [appts, invoices, stock] = await Promise.all([
            sb.schema("app").from("appointments").select("id, created_at, scheduled_at, status, reason").order("created_at", { ascending: false }).limit(2),
            sb.schema("app").from("invoices").select("id, invoice_no, status, total, created_at").order("created_at", { ascending: false }).limit(2),
            sb.schema("app").from("stock_items").select("id, name, stock, threshold, updated_at").eq("kind", "pharmacy").order("updated_at", { ascending: false }).limit(20),
          ]);
          if (appts.error) throw appts.error;
          if (invoices.error) throw invoices.error;
          if (stock.error) throw stock.error;
          if (alive) {
            setMessages([
              ...(appts.data ?? []).map((r: any) => ({ id: `dir-appt-${r.id}`, at: String(r.created_at ?? r.scheduled_at ?? ""), text: `RDV ${r.status}: ${r.reason ?? "Consultation"}` })),
              ...(invoices.data ?? []).map((r: any) => ({ id: `dir-invoice-${r.id}`, at: String(r.created_at ?? ""), text: `Facture ${r.invoice_no ?? ""}: ${Number(r.total ?? 0).toLocaleString("fr-FR")} FCFA (${r.status})` })),
              ...(stock.data ?? [])
                .filter((r: any) => Number(r.stock ?? 0) <= Number(r.threshold ?? 0))
                .slice(0, 2)
                .map((r: any) => ({ id: `dir-stock-${r.id}`, at: String(r.updated_at ?? ""), text: `Stock faible: ${r.name} (${r.stock}/${r.threshold})` })),
            ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5));
          }
          channels.push(supabase.channel(`notify_director_${Date.now()}`).on("postgres_changes", { event: "*", schema: "app", table: "appointments" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `dir-appt-${n.id}`, at: String(n.created_at ?? n.scheduled_at ?? ""), text: `RDV ${n.status}: ${n.reason ?? "Consultation"}` });
          }).on("postgres_changes", { event: "INSERT", schema: "app", table: "invoices" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `dir-invoice-${n.id}`, at: String(n.created_at ?? ""), text: `Nouvelle facture: ${n.invoice_no ?? ""}` });
          }).on("postgres_changes", { event: "UPDATE", schema: "app", table: "stock_items" }, (payload: any) => {
            const n = payload?.new;
            if (n?.id && Number(n.stock ?? 0) <= Number(n.threshold ?? 0)) pushMessage({ id: `dir-stock-${n.id}`, at: String(n.updated_at ?? ""), text: `Stock faible: ${n.name} (${n.stock}/${n.threshold})` });
          }).subscribe());
        } else if (role === "patient") {
          if (!authUserId) {
            if (alive) setMessages([]);
            return;
          }
          let link = await sb.schema("app").from("patient_accounts").select("patient_id").eq("user_id", authUserId).maybeSingle();
          if (!link.data?.patient_id && !link.error) {
            const ensured = await sb.schema("app").rpc("ensure_patient_account_self");
            if (!ensured.error) {
              link = await sb.schema("app").from("patient_accounts").select("patient_id").eq("user_id", authUserId).maybeSingle();
            }
          }
          if (link.error) throw link.error;
          const pid = link.data?.patient_id;
          if (!pid) {
            if (alive) setMessages([]);
            return;
          }
          const [appts, prescs, invoices] = await Promise.all([
            sb.schema("app").from("appointments").select("id, created_at, scheduled_at, status, reason").eq("patient_id", pid).order("created_at", { ascending: false }).limit(3),
            sb.schema("app").from("prescriptions").select("id, created_at, status").eq("patient_id", pid).order("created_at", { ascending: false }).limit(2),
            sb.schema("app").from("invoices").select("id, invoice_no, status, total, created_at").eq("patient_id", pid).order("created_at", { ascending: false }).limit(2),
          ]);
          if (appts.error) throw appts.error;
          if (prescs.error) throw prescs.error;
          if (invoices.error) throw invoices.error;
          if (alive) {
            setMessages([
              ...(appts.data ?? []).map((r: any) => ({ id: `patient-appt-${r.id}`, at: String(r.created_at ?? r.scheduled_at ?? ""), text: `Rendez-vous ${r.status}: ${r.reason ?? "Consultation"}` })),
              ...(prescs.data ?? []).map((r: any) => ({ id: `patient-presc-${r.id}`, at: String(r.created_at ?? ""), text: `Ordonnance ${r.status ?? "créée"}` })),
              ...(invoices.data ?? []).map((r: any) => ({ id: `patient-invoice-${r.id}`, at: String(r.created_at ?? ""), text: `Facture ${r.invoice_no ?? ""}: ${Number(r.total ?? 0).toLocaleString("fr-FR")} FCFA (${r.status})` })),
            ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5));
          }
          channels.push(supabase.channel(`notify_patient_${pid}_${Date.now()}`).on("postgres_changes", { event: "*", schema: "app", table: "appointments", filter: `patient_id=eq.${pid}` }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `patient-appt-${n.id}`, at: String(n.created_at ?? n.scheduled_at ?? ""), text: `Rendez-vous ${n.status}: ${n.reason ?? "Consultation"}` });
          }).on("postgres_changes", { event: "INSERT", schema: "app", table: "prescriptions", filter: `patient_id=eq.${pid}` }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `patient-presc-${n.id}`, at: String(n.created_at ?? ""), text: "Nouvelle ordonnance disponible" });
          }).on("postgres_changes", { event: "INSERT", schema: "app", table: "invoices", filter: `patient_id=eq.${pid}` }, (payload: any) => {
            const n = payload?.new;
            if (n?.id) pushMessage({ id: `patient-invoice-${n.id}`, at: String(n.created_at ?? ""), text: `Nouvelle facture disponible: ${n.invoice_no ?? ""} — consultez l'onglet Factures` });
          }).on("postgres_changes", { event: "UPDATE", schema: "app", table: "invoices", filter: `patient_id=eq.${pid}` }, (payload: any) => {
            const n = payload?.new;
            if (n?.id && n.status === "payee") pushMessage({ id: `patient-invoice-paid-${n.id}`, at: new Date().toISOString(), text: `Facture ${n.invoice_no ?? ""} réglée ✓ — merci pour votre paiement` });
          }).subscribe());
        } else {
          if (alive) setMessages([]);
        }
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
        for (const channel of channels) {
          if (channel && supabaseForCleanup?.removeChannel) supabaseForCleanup.removeChannel(channel);
        }
      } catch {
        // ignore
      }
    };
  }, [notifOpen, user]);

  if (!user || user.role !== allow) return null;
  const items = NAV[allow];

  return (
    <div className="min-h-screen flex bg-muted/30">
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
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
              >
                {active ? <motion.span layoutId="active-pill" className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-[color:var(--mint)]" /> : null}
                <it.icon className="size-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="rounded-xl glass-dark p-3 flex items-center gap-3">
            <div className="size-9 rounded-full gradient-mint grid place-items-center text-[color:var(--navy)] font-bold">{user.name.charAt(0)}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-white/50 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/" });
            }}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 py-2 text-sm transition"
          >
            <LogOut className="size-4" /> Déconnexion
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setMobileNavOpen(false)}>
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="h-full w-[min(82vw,280px)] bg-[color:var(--navy)] text-white p-5 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl" onClick={() => setMobileNavOpen(false)}>
                  <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)]"><Activity className="size-5" strokeWidth={2.5} /></span>
                  2KC
                </Link>
                <button type="button" className="size-9 rounded-xl border border-white/10 grid place-items-center" onClick={() => setMobileNavOpen(false)}>
                  <X className="size-4" />
                </button>
              </div>
              <p className="text-xs uppercase tracking-widest text-white/40 mb-3">{roleLabel(user.role)}</p>
              <nav className="space-y-1">
                {items.map((it) => (
                  <Link key={it.to} to={it.to} onClick={() => setMobileNavOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${path === it.to ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}>
                    <it.icon className="size-4" />
                    {it.label}
                  </Link>
                ))}
              </nav>
              <button
                onClick={() => {
                  logout();
                  setMobileNavOpen(false);
                  navigate({ to: "/" });
                }}
                className="mt-auto w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 py-2 text-sm transition"
              >
                <LogOut className="size-4" /> Déconnexion
              </button>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-10 py-3 sm:py-4">
            <button type="button" onClick={() => setMobileNavOpen(true)} className="md:hidden size-10 rounded-xl border bg-card grid place-items-center text-[color:var(--navy)]" aria-label="Ouvrir le menu">
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
              <h1 className="text-base sm:text-xl font-bold text-[color:var(--navy)] truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative hidden sm:block">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Rechercher..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  className="pl-9 pr-4 py-2 rounded-xl border bg-card text-sm w-64 outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                />
              </div>
              <div className="relative">
                <button type="button" onClick={() => setNotifOpen((v) => !v)} className="relative size-10 rounded-xl border bg-card grid place-items-center text-[color:var(--navy)] hover:bg-muted transition" aria-label="Notifications">
                  <Bell className="size-4" />
                  {messages.length ? (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-[color:var(--mint)] px-1 text-[10px] font-bold text-[color:var(--navy)] grid place-items-center">
                      {Math.min(messages.length, 5)}
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 size-2 rounded-full bg-[color:var(--mint)]" />
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen ? (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }} className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-card shadow-lg overflow-hidden">
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--navy)]">Notifications</p>
                          <p className="text-xs text-muted-foreground">{subtitle}</p>
                        </div>
                        <button type="button" onClick={() => setNotifOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Fermer</button>
                      </div>
                      <div className="max-h-[420px] overflow-auto">
                        {notifLoading ? <div className="px-4 py-3 text-sm text-muted-foreground">Chargement...</div> : null}
                        {notifError ? <div className="px-4 py-3 text-sm text-red-600">{notifError}</div> : null}
                        {!notifLoading && !notifError && messages.length === 0 ? <div className="px-4 py-6 text-sm text-muted-foreground">Aucune notification.</div> : null}
                        {!notifLoading && !notifError && messages.length > 0 ? (
                          <ul className="divide-y">
                            {messages.map((m) => (
                              <li key={m.id} className="px-4 py-3">
                                <p className="text-sm text-[color:var(--navy)] break-words">{m.text}</p>
                                <p className="text-xs text-muted-foreground mt-1">{m.at}</p>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={path} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="p-4 sm:p-6 lg:p-10">
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <button
        type="button"
        onClick={() => setChatbotOpen(true)}
        className="fixed bottom-5 right-5 z-40 size-14 rounded-2xl gradient-mint text-[color:var(--navy)] shadow-mint grid place-items-center hover:brightness-110 transition"
        aria-label="Ouvrir le chatbot médical"
      >
        <MessageCircle className="size-6" />
      </button>

      <AnimatePresence>
        {chatbotOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[color:var(--navy)]/35 backdrop-blur-sm flex items-end justify-end p-3 sm:p-5"
            onClick={() => setChatbotOpen(false)}
          >
            <motion.section
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-[440px] h-[min(720px,calc(100vh-2rem))] rounded-2xl border bg-card shadow-lg flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="size-10 rounded-xl gradient-mint text-[color:var(--navy)] grid place-items-center shrink-0">
                    <Bot className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[color:var(--navy)] truncate">Assistant santé</p>
                    <p className="text-xs text-muted-foreground truncate">Connecté à Gemini via Supabase</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChatbotOpen(false)}
                  className="size-9 rounded-xl border grid place-items-center hover:bg-muted"
                  aria-label="Fermer le chatbot médical"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-3">
                {chatbotMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "ml-auto bg-[color:var(--navy)] text-white"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.text}
                  </div>
                ))}
                {chatbotLoading ? (
                  <div className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm bg-muted text-muted-foreground">
                    Réponse en cours...
                  </div>
                ) : null}
              </div>

              <div className="border-t p-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  {quickPromptsForRole(user.role).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendChatbotMessage(prompt)}
                      className="rounded-xl border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendChatbotMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={chatbotInput}
                    onChange={(e) => setChatbotInput(e.target.value)}
                    placeholder="Posez une question médicale..."
                    className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20"
                  />
                  <button
                    type="submit"
                    disabled={chatbotLoading || !chatbotInput.trim()}
                    className="size-10 rounded-xl gradient-mint text-[color:var(--navy)] grid place-items-center disabled:opacity-60"
                    aria-label="Envoyer"
                  >
                    <Send className="size-4" />
                  </button>
                </form>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function proactiveIntro(role: Role) {
  switch (role) {
    case "medecin":
      return "Je peux surveiller vos rendez-vous, repérer les résultats préoccupants et proposer des pistes de prise en charge selon les symptômes.";
    case "infirmier":
      return "Je peux prioriser les soins, rappeler les médicaments à administrer et signaler les patients à risque.";
    case "pharmacien":
      return "Je peux détecter les stocks faibles, proposer les commandes et aider à préparer les délivrances.";
    case "comptable":
      return "Je peux signaler les retards de paiement et générer un résumé financier rapide.";
    case "patient":
      return "Je peux vous rappeler vos consultations, vos médicaments et donner des conseils de santé simples.";
    case "secretaire":
      return "Je peux organiser les rendez-vous, repérer les demandes urgentes et préparer les relances.";
    case "directeur":
      return "Je peux résumer les indicateurs, les alertes et les priorités du centre.";
    default:
      return "Je peux vous aider à piloter les tâches importantes du centre.";
  }
}

function quickPromptsForRole(role: Role) {
  const prompts: Record<Role, string[]> = {
    admin: ["Résumé des alertes", "Aide création compte"],
    medecin: ["RDV importants", "Symptômes à analyser"],
    infirmier: ["Soins prioritaires", "Patients à risque"],
    secretaire: ["Prioriser les RDV", "Relances patients"],
    comptable: ["Paiements en retard", "Rapport financier"],
    pharmacien: ["Stocks faibles", "Commande recommandée"],
    directeur: ["Priorités du jour", "Analyse KPI"],
    patient: ["Mes rendez-vous", "Question santé"],
  };
  return prompts[role] ?? ["Aide-moi"];
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} className={`rounded-3xl p-6 border ${accent ? "bg-[color:var(--navy)] text-white" : "bg-card"} shadow-sm`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm ${accent ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
        <span className={`size-10 rounded-xl grid place-items-center ${accent ? "gradient-mint text-[color:var(--navy)]" : "bg-muted text-[color:var(--navy)]"}`}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className={`mt-4 font-display text-4xl font-bold ${accent ? "" : "text-[color:var(--navy)]"}`}>{value}</p>
      {hint ? <p className={`mt-1 text-xs ${accent ? "text-white/60" : "text-muted-foreground"}`}>{hint}</p> : null}
    </motion.div>
  );
}

export const cardIcons = { Users, Calendar, Activity, Pill, ClipboardList, FileText };
