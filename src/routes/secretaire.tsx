import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { Calendar, Users, Phone, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getSupabaseAsync } from "@/lib/supabase";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/secretaire")({ component: SecretaireHome });

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfTomorrowIso() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}
function startOfInDaysIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type Appt = {
  id: string;
  scheduled_at: string;
  status: string;
  reason: string | null;
  patient?: { first_name: string; last_name: string } | null;
  practitioner?: { full_name: string | null } | null;
};

function SecretaireHome() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [practitioners, setPractitioners] = useState<Array<{ user_id: string; full_name: string }>>(
    [],
  );
  const [assignSel, setAssignSel] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const todayStart = useMemo(() => startOfTodayIso(), []);
  const tomorrowStart = useMemo(() => startOfTomorrowIso(), []);
  const in7Days = useMemo(() => startOfInDaysIso(7), []);

  // Initialize from ?q=
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search ?? "");
      setQuery(params.get("q") ?? "");
    } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    let channel: any;
    let supabaseForCleanup: any;

    async function loadAppointments() {
      setLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        supabaseForCleanup = supabase;
        const sb: any = supabase;
        // If q provided, prefetch matching patients to filter appointments by patient_id
        let patientIds: string[] = [];
        const q = (query ?? "").trim();
        if (q) {
          const p = await sb
            .schema("app")
            .from("patients")
            .select("id")
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
          if (!p.error) patientIds = (p.data ?? []).map((r: any) => r.id);
        }

        let qb = sb
          .schema("app")
          .from("appointments")
          .select(
            `
            id, scheduled_at, status, reason,
            patient:patient_id (first_name, last_name),
            practitioner:practitioner_id (full_name)
          `,
          )
          .gte("scheduled_at", todayStart)
          .lt("scheduled_at", in7Days);

        if (q) {
          if (patientIds.length > 0) {
            qb = qb.in("patient_id", patientIds);
          } else {
            qb = qb.ilike("reason", `%${q}%`);
          }
        }

        const { data, error } = await qb.order("scheduled_at", { ascending: true });
        if (error) throw error;
        // load practitioners for assignment
        const profs = await sb
          .schema("app")
          .from("profiles")
          .select("user_id, full_name, role")
          .eq("role", "medecin");
        if (alive) {
          setAppts((data ?? []) as any);
          setPractitioners(
            ((profs.error ? [] : profs.data ?? []) as any).map((p: any) => ({
              user_id: p.user_id,
              full_name: p.full_name,
            })),
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadAppointments();

    void getSupabaseAsync().then((supabase) => {
      if (!alive) return;
      supabaseForCleanup = supabase;
      channel = supabase
        .channel(`secretary_appointments_${Date.now()}`)
        .on("postgres_changes", { event: "*", schema: "app", table: "appointments" }, () => {
          void loadAppointments();
        })
        .subscribe();
    });

    return () => {
      alive = false;
      try {
        if (channel && supabaseForCleanup?.removeChannel) supabaseForCleanup.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [todayStart, in7Days, query]);

  const queue = useMemo(
    () =>
      appts.filter((a) => a.status === "en_attente"),
    [appts],
  );
  const upcoming = useMemo(
    () =>
      appts.filter((a) => a.status !== "en_attente"),
    [appts],
  );
  const todayAppts = useMemo(
    () => appts.filter((a) => a.scheduled_at >= todayStart && a.scheduled_at < tomorrowStart),
    [appts, todayStart, tomorrowStart],
  );

  async function assignAndConfirm(apptId: string) {
    const practitioner_id = assignSel[apptId];
    if (!practitioner_id) {
      toast.error(t("Sélectionnez un médecin."));
      return;
    }
    try {
      const supabase = await getSupabaseAsync();
      const sb: any = supabase;
      const { error } = await sb
        .schema("app")
        .from("appointments")
        .update({ practitioner_id, status: "confirme" })
        .eq("id", apptId);
      if (error) {
        // Contrainte d'unicité: un médecin ne peut pas avoir 2 RDV au même horaire
        const msg: string = (error as any)?.message ?? t("Mise à jour impossible.");
        if (
          msg.toLowerCase().includes("unique") ||
          msg.includes("appointments_unique_practitioner_time")
        ) {
          toast.error(t("Ce médecin a déjà un rendez-vous à cette heure."));
          return;
        }
        throw error;
      }
      toast.success(t("Rendez-vous confirmé et assigné."));
      // refresh list
      const { data, error: rErr } = await sb
        .schema("app")
        .from("appointments")
        .select(
          `id, scheduled_at, status, reason, patient:patient_id (first_name, last_name), practitioner:practitioner_id (full_name)`,
        )
        .gte("scheduled_at", todayStart)
        .lt("scheduled_at", in7Days)
        .order("scheduled_at", { ascending: true });
      if (!rErr) setAppts((data ?? []) as any);
    } catch (err: any) {
      toast.error(err?.message ?? t("Mise à jour impossible."));
    }
  }

  return (
    <DashboardLayout allow="secretaire" title={t("Accueil & rendez-vous")}>
      <div className="grid sm:grid-cols-4 gap-5">
        <StatCard
          label={t("File d'attente")}
          value={loading ? "…" : String(queue.length)}
          icon={Users}
          accent
        />
        <StatCard
          label={t("RDV aujourd'hui")}
          value={loading ? "…" : String(todayAppts.length)}
          icon={Calendar}
        />
        <StatCard label={t("Appels traités")} value="0" icon={Phone} />
        <StatCard label={t("Messages")} value="0" icon={MessageSquare} />
      </div>

      <div className="mt-8 grid lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border bg-card p-7"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[color:var(--navy)]">{t("File d'attente")}</h3>
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Filtrer (nom patient / motif)")}
                className="text-xs rounded-xl border px-2 py-1"
              />
              <span className="text-xs px-3 py-1 rounded-full bg-[color:var(--mint)]/20 text-[color:var(--navy)] font-medium">
                {loading ? "…" : `${queue.length} ${t("personnes")}`}
              </span>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {!loading && queue.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                {t("Aucun patient en file d'attente.")}
              </div>
            ) : null}
            {(loading ? [] : queue).map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-4 p-4 rounded-2xl border hover:bg-muted/40 transition"
              >
                <div className="size-12 rounded-xl bg-[color:var(--navy)] text-[color:var(--mint)] grid place-items-center font-bold text-sm">
                  {formatTime(q.scheduled_at)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[color:var(--navy)]">
                    {q.patient ? `${q.patient.first_name} ${q.patient.last_name}` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{q.reason || t("Rendez-vous")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={assignSel[q.id] ?? ""}
                    onChange={(e) => setAssignSel((s) => ({ ...s, [q.id]: e.target.value }))}
                    className="text-xs rounded-xl border px-2 py-1"
                  >
                    <option value="">{t("— Médecin —")}</option>
                    {practitioners.length === 0 ? (
                      <option value="" disabled>
                        {t("Aucun médecin trouvé")}
                      </option>
                    ) : null}
                    {practitioners.map((p) => (
                      <option key={p.user_id} value={p.user_id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void assignAndConfirm(q.id)}
                    className="text-xs rounded-xl border px-2 py-1 hover:bg-muted"
                  >
                    {t("Confirmer")}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl border bg-card p-7"
        >
          <h3 className="text-lg font-bold text-[color:var(--navy)]">{t("Prochains rendez-vous")}</h3>
          <div className="mt-5 space-y-2">
            {!loading && upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                {t("Aucun rendez-vous à venir.")}
              </div>
            ) : null}
            {(loading ? [] : upcoming).map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="flex items-center gap-4 p-4 rounded-2xl bg-muted/40"
              >
                <div className="flex flex-col items-center justify-center size-14 rounded-xl gradient-mint text-[color:var(--navy)]">
                  <span className="text-xs">{formatTime(u.scheduled_at).split(":")[0]}h</span>
                  <span className="text-lg font-bold leading-none">
                    {formatTime(u.scheduled_at).split(":")[1]}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[color:var(--navy)]">
                    {u.patient ? `${u.patient.first_name} ${u.patient.last_name}` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("avec")} {u.practitioner?.full_name || "—"}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}

