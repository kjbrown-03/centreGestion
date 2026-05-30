import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { Calendar, Stethoscope, Users, FileText, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getSupabaseAsync } from "@/lib/supabase";
import { suggestTreatment } from "@/lib/ai";
import { whatsappUrlFor } from "@/lib/contact";

export const Route = createFileRoute("/medecin")({ component: MedecinHome });

type ApptRow = {
  id: string;
  scheduled_at: string;
  status: string;
  reason: string | null;
  patient: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
};

type ConsultationRow = {
  id: string;
  started_at: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  notes: string | null;
};

type PrescriptionRow = {
  id: string;
  created_at: string;
  status: string;
  items: {
    id: string;
    medicine_name: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
  }[];
};

type ExamOrderRow = {
  id: string;
  created_at: string;
  exam_type: string;
  priority: string;
  status: string;
  result: {
    id: string;
    result_summary: string | null;
    file_url: string | null;
    created_at: string;
  } | null;
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfTomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfInDaysIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function MedecinHome() {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<ApptRow[]>([]);

  const [selectedAppt, setSelectedAppt] = useState<ApptRow | null>(null);
  const [patientConsultations, setPatientConsultations] = useState<ConsultationRow[]>([]);
  const [patientPrescriptions, setPatientPrescriptions] = useState<PrescriptionRow[]>([]);
  const [patientExamOrders, setPatientExamOrders] = useState<ExamOrderRow[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);

  const [creatingConsultation, setCreatingConsultation] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [query, setQuery] = useState("");

  const [selectedConsultationId, setSelectedConsultationId] = useState<string>("");
  const [prescItems, setPrescItems] = useState<
    { medicine_name: string; dosage: string; frequency: string; duration: string }[]
  >([{ medicine_name: "", dosage: "", frequency: "", duration: "" }]);
  const [creatingPrescription, setCreatingPrescription] = useState(false);
  const [medicineOptions, setMedicineOptions] = useState<string[]>([]);

  const [examType, setExamType] = useState("");
  const [examPriority, setExamPriority] = useState<"routine" | "urgent">("routine");
  const [examNotes, setExamNotes] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  const todayCount = appointments.length;

  const followedPatientsCount = useMemo(() => {
    const ids = new Set<string>();
    for (const a of appointments) {
      if (a.patient?.id) ids.add(a.patient.id);
    }
    return ids.size;
  }, [appointments]);

  // Track ?q= from router to filter agenda
  const locationSearch = useRouterState({ select: (s: any) => s.location.search });
  useEffect(() => {
    try {
      const params = new URLSearchParams(locationSearch ?? "");
      setQuery(params.get("q") ?? "");
    } catch {
      // ignore
    }
  }, [locationSearch]);

  useEffect(() => {
    let mounted = true;
    let channel: any;
    let supabaseForCleanup: any;
    async function run() {
      setLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        supabaseForCleanup = supabase;
        const authUser = (await supabase.auth.getUser()).data.user;
        if (!authUser?.id) {
          throw new Error("Session introuvable. Veuillez vous reconnecter.");
        }

        const start = startOfTodayIso();
        const end = startOfInDaysIso(7);

        // Build query with optional search on patient name or reason
        const sb: any = supabase;
        const q = (query ?? "").trim();
        let patientIds: string[] = [];
        if (q) {
          const p = await sb
            .schema("app")
            .from("patients")
            .select("id")
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
          if (!p.error) patientIds = (p.data ?? []).map((r: any) => r.id);
        }

        let qb = (supabase as any)
          .schema("app")
          .from("appointments")
          .select(
            "id, scheduled_at, status, reason, patient:patient_id (id, first_name, last_name, phone)",
          )
          .eq("practitioner_id", authUser.id)
          .gte("scheduled_at", start)
          .lt("scheduled_at", end);

        if (q) {
          if (patientIds.length > 0) {
            qb = qb.in("patient_id", patientIds);
          } else {
            qb = qb.ilike("reason", `%${q}%`);
          }
        }

        const { data, error } = await qb.order("scheduled_at", { ascending: true });
        if (error) throw error;

        if (!mounted) return;
        setAppointments(((data ?? []) as any[]).map((r) => r as ApptRow));
      } catch (err: any) {
        toast.error(err?.message ?? "Erreur lors du chargement des rendez-vous.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void run();
    void getSupabaseAsync().then((supabase) => {
      if (!mounted) return;
      supabaseForCleanup = supabase;
      channel = supabase
        .channel(`doctor_appointments_${Date.now()}`)
        .on("postgres_changes", { event: "*", schema: "app", table: "appointments" }, () => {
          void run();
        })
        .subscribe();
    });
    return () => {
      mounted = false;
      try {
        if (channel && supabaseForCleanup?.removeChannel) supabaseForCleanup.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [query]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = await getSupabaseAsync();
        const { data, error } = await (supabase as any)
          .schema("app")
          .from("stock_items")
          .select("name")
          .eq("kind", "pharmacy")
          .order("name", { ascending: true });
        if (error) throw error;
        if (alive) setMedicineOptions((data ?? []).map((r: any) => r.name as string));
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function openPatientFile(appt: ApptRow) {
    if (!appt.patient?.id) return;
    setSelectedAppt(appt);
    setPatientLoading(true);
    try {
      const supabase = await getSupabaseAsync();
      const authUser = (await supabase.auth.getUser()).data.user;
      if (!authUser?.id) throw new Error("Session introuvable. Veuillez vous reconnecter.");

      const patient = appt.patient;

      const [
        { data: consultations, error: cErr },
        { data: prescriptions, error: pErr },
        { data: orders, error: oErr },
      ] = await Promise.all([
        (supabase as any)
          .schema("app")
          .from("consultations")
          .select("id, started_at, chief_complaint, diagnosis, notes")
          .eq("patient_id", patient.id)
          .eq("practitioner_id", authUser.id)
          .order("started_at", { ascending: false })
          .limit(15),
        (supabase as any)
          .schema("app")
          .from("prescriptions")
          .select(
            "id, created_at, status, items:prescription_items(id, medicine_name, dosage, frequency, duration)",
          )
          .eq("patient_id", patient.id)
          .eq("practitioner_id", authUser.id)
          .order("created_at", { ascending: false })
          .limit(10),
        (supabase as any)
          .schema("app")
          .from("exam_orders")
          .select(
            "id, created_at, exam_type, priority, status, result:exam_results(id, result_summary, file_url, created_at)",
          )
          .eq("patient_id", patient.id)
          .eq("practitioner_id", authUser.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (cErr) throw cErr;
      if (pErr) throw pErr;
      if (oErr) throw oErr;

      setPatientConsultations(((consultations ?? []) as any[]).map((r) => r as ConsultationRow));
      setPatientPrescriptions(((prescriptions ?? []) as any[]).map((r) => r as PrescriptionRow));
      setPatientExamOrders(((orders ?? []) as any[]).map((r) => r as ExamOrderRow));

      const firstConsultationId = ((consultations ?? []) as any[])[0]?.id as string | undefined;
      setSelectedConsultationId(firstConsultationId ?? "");
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de charger le dossier patient.");
    } finally {
      setPatientLoading(false);
    }
  }

  const monthlyConsultationsCount = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let n = 0;
    for (const c of patientConsultations) {
      if (new Date(c.started_at).getTime() >= cutoff) n += 1;
    }
    return n;
  }, [patientConsultations]);

  async function createConsultation() {
    if (!selectedAppt?.patient?.id) return;
    setCreatingConsultation(true);
    try {
      const supabase = await getSupabaseAsync();
      const authUser = (await supabase.auth.getUser()).data.user;
      if (!authUser?.id) throw new Error("Session introuvable. Veuillez vous reconnecter.");

      const { data, error } = await (supabase as any)
        .schema("app")
        .from("consultations")
        .insert({
          patient_id: selectedAppt.patient.id,
          practitioner_id: authUser.id,
          appointment_id: selectedAppt.id,
          chief_complaint: chiefComplaint.trim() || null,
          symptoms: symptoms.trim() || null,
          diagnosis: diagnosis.trim() || null,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      try {
        const invoice = await (supabase as any)
          .schema("app")
          .from("invoices")
          .insert({
            patient_id: selectedAppt.patient.id,
            consultation_id: data?.id,
            created_by: authUser.id,
          })
          .select("id")
          .single();
        const invoiceId = invoice.data?.id;
        if (!invoice.error && invoiceId) {
          await (supabase as any).schema("app").from("invoice_items").insert({
            invoice_id: invoiceId,
            label: "Consultation medicale",
            qty: 1,
            unit_price: 5000,
          });
        }
      } catch {
        // La facturation peut etre restreinte par RLS selon le schema deploye.
      }

      try {
        await (supabase as any)
          .schema("app")
          .from("appointments")
          .update({ status: "termine" })
          .eq("id", selectedAppt.id);
      } catch {
        // ignore
      }

      toast.success("Consultation créée.");
      setChiefComplaint("");
      setSymptoms("");
      setDiagnosis("");
      setNotes("");
      if (data?.id) setSelectedConsultationId(String(data.id));
      await openPatientFile(selectedAppt);
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de créer la consultation.");
    } finally {
      setCreatingConsultation(false);
    }
  }

  async function runAiSuggestion() {
    try {
      if (!chiefComplaint && !symptoms && !notes) {
        toast.error("Renseigne motif/symptômes/notes pour une suggestion.");
        return;
      }
      setAiLoading(true);
      const text = await suggestTreatment({ chiefComplaint, symptoms, notes });
      setAiSuggestion(text);
      if (!diagnosis && text) setDiagnosis(text.split("\n").slice(0, 3).join(" \u2022 "));
    } catch (err: any) {
      toast.error(err?.message ?? "Orientation indisponible.");
    } finally {
      setAiLoading(false);
    }
  }

  async function createPrescription() {
    if (!selectedAppt?.patient?.id) return;
    if (!selectedConsultationId) {
      toast.error("Sélectionne une consultation.");
      return;
    }
    const items = prescItems
      .map((i) => ({
        medicine_name: i.medicine_name.trim(),
        dosage: i.dosage.trim() || null,
        frequency: i.frequency.trim() || null,
        duration: i.duration.trim() || null,
      }))
      .filter((i) => i.medicine_name);
    if (!items.length) {
      toast.error("Ajoute au moins un médicament.");
      return;
    }

    setCreatingPrescription(true);
    try {
      const supabase = await getSupabaseAsync();
      const authUser = (await supabase.auth.getUser()).data.user;
      if (!authUser?.id) throw new Error("Session introuvable. Veuillez vous reconnecter.");

      const { data: presc, error: pErr } = await (supabase as any)
        .schema("app")
        .from("prescriptions")
        .insert({
          consultation_id: selectedConsultationId,
          patient_id: selectedAppt.patient.id,
          practitioner_id: authUser.id,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      const prescId = String(presc.id);
      const { error: iErr } = await (supabase as any)
        .schema("app")
        .from("prescription_items")
        .insert(items.map((i) => ({ ...i, prescription_id: prescId })));
      if (iErr) throw iErr;

      toast.success("Prescription créée.");
      setPrescItems([{ medicine_name: "", dosage: "", frequency: "", duration: "" }]);
      await openPatientFile(selectedAppt);
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de créer la prescription.");
    } finally {
      setCreatingPrescription(false);
    }
  }

  async function createExamOrder() {
    if (!selectedAppt?.patient?.id) return;
    if (!selectedConsultationId) {
      toast.error("Sélectionne une consultation.");
      return;
    }
    if (!examType.trim()) {
      toast.error("Type dâ€™examen requis.");
      return;
    }

    setCreatingExam(true);
    try {
      const supabase = await getSupabaseAsync();
      const authUser = (await supabase.auth.getUser()).data.user;
      if (!authUser?.id) throw new Error("Session introuvable. Veuillez vous reconnecter.");

      const { error } = await (supabase as any)
        .schema("app")
        .from("exam_orders")
        .insert({
          consultation_id: selectedConsultationId,
          patient_id: selectedAppt.patient.id,
          practitioner_id: authUser.id,
          exam_type: examType.trim(),
          priority: examPriority,
          notes: examNotes.trim() || null,
        });
      if (error) throw error;

      toast.success("Examen demandé.");
      setExamType("");
      setExamPriority("routine");
      setExamNotes("");
      await openPatientFile(selectedAppt);
    } catch (err: any) {
      toast.error(err?.message ?? "Impossible de demander lâ€™examen.");
    } finally {
      setCreatingExam(false);
    }
  }

  return (
    <DashboardLayout allow="medecin" title="Mes consultations du jour">
      <div className="grid sm:grid-cols-3 gap-5">
        <StatCard
          label="RDV aujourd'hui"
          value={loading ? "..." : String(todayCount)}
          icon={Calendar}
          accent
        />
        <StatCard
          label="Patients suivis (aujourd'hui)"
          value={loading ? "..." : String(followedPatientsCount)}
          icon={Users}
        />
        <StatCard
          label="Consultations (dossier ouvert / 30j)"
          value={selectedAppt?.patient ? String(monthlyConsultationsCount) : "-"}
          icon={Stethoscope}
        />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 rounded-3xl border bg-card p-7"
        >
          <h3 className="text-lg font-bold text-[color:var(--navy)]">Agenda du jour</h3>
          <div className="mt-5 space-y-2">
            {(loading ? [] : appointments).map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-4 p-4 rounded-2xl border hover:border-[color:var(--mint)]/50 hover:bg-muted/40 transition cursor-pointer"
                onClick={() => (a.patient ? void openPatientFile(a) : undefined)}
              >
                <div className="flex flex-col items-center justify-center size-14 rounded-xl bg-[color:var(--navy)] text-white">
                  <span className="text-xs text-white/60">
                    {formatTime(a.scheduled_at).split(":")[0]}h
                  </span>
                  <span className="text-lg font-bold leading-none">
                    {formatTime(a.scheduled_at).split(":")[1]}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[color:var(--navy)]">
                    {a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : "Patient"}
                  </p>
                  <p className="text-sm text-muted-foreground">{a.reason ?? "Consultation"}</p>
                </div>
                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full ${
                    a.status === "confirme" || a.status === "confirmé"
                      ? "bg-[color:var(--mint)]/20 text-[color:var(--navy)]"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {a.status}
                </span>
              </motion.div>
            ))}

            {!loading && appointments.length === 0 ? (
              <div className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
                Aucun rendez-vous aujourdâ€™hui.
              </div>
            ) : null}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl border bg-card p-7"
        >
          <h3 className="text-lg font-bold text-[color:var(--navy)]">Notes rapides</h3>
          <div className="mt-5 space-y-3">
            {[
              { icon: FileText, text: "Renouveler protocole d'hypertension pour A. Benani" },
              { icon: Clock, text: "Synthèse hebdomadaire à finaliser avant 18h" },
              { icon: FileText, text: "Compte-rendu de J. Dubois en attente" },
            ].map((n, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl bg-muted/50">
                <n.icon className="size-4 text-[color:var(--mint)] mt-0.5 shrink-0" />
                <p className="text-sm text-[color:var(--navy)]">{n.text}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {selectedAppt?.patient ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
          onClick={() => setSelectedAppt(null)}
        >
          <div
            className="w-full max-w-4xl rounded-3xl border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-[color:var(--navy)]">
                  Dossier patient · {selectedAppt.patient.first_name}{" "}
                  {selectedAppt.patient.last_name}
                </h3>
                {selectedAppt.patient.phone ? (<a href={whatsappUrlFor(selectedAppt.patient.phone)} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-[color:var(--navy)] hover:underline">WhatsApp: {selectedAppt.patient.phone}</a>) : null}
              </div>
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm hover:bg-muted"
                onClick={() => setSelectedAppt(null)}
              >
                Fermer
              </button>
            </div>

            <div className="p-6 grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="rounded-3xl border bg-card p-6">
                  <h4 className="font-bold text-[color:var(--navy)]">Historique consultations</h4>
                  <div className="mt-4 space-y-3">
                    {patientLoading ? (
                      <div className="text-sm text-muted-foreground">Chargement...</div>
                    ) : patientConsultations.length ? (
                      patientConsultations.map((c) => (
                        <div
                          key={c.id}
                          className={`rounded-2xl border p-4 cursor-pointer ${
                            selectedConsultationId === c.id ? "border-[color:var(--mint)]" : ""
                          }`}
                          onClick={() => setSelectedConsultationId(c.id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-[color:var(--navy)]">
                              {new Date(c.started_at).toLocaleString()}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              #{c.id.slice(0, 8)}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            {c.chief_complaint ? `Motif: ${c.chief_complaint}` : ""}
                          </div>
                          <div className="mt-1 text-sm text-[color:var(--navy)]">
                            {c.diagnosis ? `Diagnostic: ${c.diagnosis}` : ""}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Aucune consultation trouvée.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border bg-card p-6">
                  <h4 className="font-bold text-[color:var(--navy)]">Examens</h4>
                  <div className="mt-4 space-y-3">
                    {patientLoading ? (
                      <div className="text-sm text-muted-foreground">Chargement...</div>
                    ) : patientExamOrders.length ? (
                      patientExamOrders.map((o) => (
                        <div key={o.id} className="rounded-2xl border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-[color:var(--navy)]">
                              {o.exam_type}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(o.created_at).toLocaleDateString()} · {o.status}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            Priorité: {o.priority}
                          </div>
                          {o.result?.result_summary ? (
                            <div className="mt-2 text-sm text-[color:var(--navy)]">
                              Résultat: {o.result.result_summary}
                            </div>
                          ) : (
                            <div className="mt-2 text-sm text-muted-foreground">
                              Résultat non disponible.
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">Aucun examen.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border bg-card p-6">
                  <h4 className="font-bold text-[color:var(--navy)]">Prescriptions</h4>
                  <div className="mt-4 space-y-3">
                    {patientLoading ? (
                      <div className="text-sm text-muted-foreground">Chargement...</div>
                    ) : patientPrescriptions.length ? (
                      patientPrescriptions.map((p) => (
                        <div key={p.id} className="rounded-2xl border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-[color:var(--navy)]">{p.status}</div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {(p.items ?? []).slice(0, 5).map((it) => (
                              <div key={it.id} className="text-sm text-muted-foreground">
                                {it.medicine_name}
                                {it.dosage ? ` · ${it.dosage}` : ""}
                                {it.frequency ? ` · ${it.frequency}` : ""}
                                {it.duration ? ` · ${it.duration}` : ""}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground">Aucune prescription.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border bg-card p-6">
                  <h4 className="font-bold text-[color:var(--navy)]">Actions</h4>
                  <div className="mt-4 space-y-5">
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center text-sm font-semibold text-[color:var(--navy)]">
                        <FileText className="size-4" /> Nouvelle consultation
                      </div>
                      <input
                        value={chiefComplaint}
                        onChange={(e) => setChiefComplaint(e.target.value)}
                        placeholder="Motif principal"
                        className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
                      />
                      <input
                        value={symptoms}
                        onChange={(e) => setSymptoms(e.target.value)}
                        placeholder="SymptÃ´mes"
                        className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
                      />
                      <input
                        value={diagnosis}
                        onChange={(e) => setDiagnosis(e.target.value)}
                        placeholder="Diagnostic"
                        className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
                      />
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notes"
                        className="w-full min-h-20 rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void runAiSuggestion()}
                          disabled={aiLoading}
                          className="rounded-2xl border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                        >
                          Suggérer orientation
                        </button>
                        {aiSuggestion ? (
                          <span className="text-[10px] text-muted-foreground">
                            Orientation prete (voir champ Diagnostic)
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void createConsultation()}
                        disabled={creatingConsultation}
                        className="w-full rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-3 disabled:opacity-60"
                      >
                        CrÃ©er consultation
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex gap-2 items-center text-sm font-semibold text-[color:var(--navy)]">
                        <Stethoscope className="size-4" /> Prescription (sur la consultation
                        sÃ©lectionnÃ©e)
                      </div>
                      {prescItems.map((it, idx) => (
                        <div key={idx} className="rounded-2xl border p-3 space-y-2">
                          <select
                            value={it.medicine_name}
                            onChange={(e) =>
                              setPrescItems((prev) =>
                                prev.map((p, i) =>
                                  i === idx ? { ...p, medicine_name: e.target.value } : p,
                                ),
                              )
                            }
                            className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                          >
                            <option value="">- Sélectionner un médicament -</option>
                            {medicineOptions.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={it.dosage}
                              onChange={(e) =>
                                setPrescItems((prev) =>
                                  prev.map((p, i) =>
                                    i === idx ? { ...p, dosage: e.target.value } : p,
                                  ),
                                )
                              }
                              placeholder="Dosage"
                              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                            />
                            <input
                              value={it.frequency}
                              onChange={(e) =>
                                setPrescItems((prev) =>
                                  prev.map((p, i) =>
                                    i === idx ? { ...p, frequency: e.target.value } : p,
                                  ),
                                )
                              }
                              placeholder="Fréquence"
                              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                            />
                            <input
                              value={it.duration}
                              onChange={(e) =>
                                setPrescItems((prev) =>
                                  prev.map((p, i) =>
                                    i === idx ? { ...p, duration: e.target.value } : p,
                                  ),
                                )
                              }
                              placeholder="Durée"
                              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none col-span-2"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPrescItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            disabled={prescItems.length <= 1}
                            className="text-xs underline text-muted-foreground disabled:opacity-40"
                          >
                            Retirer
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setPrescItems((p) => [
                            ...p,
                            { medicine_name: "", dosage: "", frequency: "", duration: "" },
                          ])
                        }
                        className="w-full rounded-2xl border py-2.5 text-sm hover:bg-muted"
                      >
                        Ajouter un médicament
                      </button>
                      <button
                        type="button"
                        onClick={() => void createPrescription()}
                        disabled={creatingPrescription}
                        className="w-full rounded-2xl border py-3 text-sm font-semibold hover:bg-muted disabled:opacity-60"
                      >
                        Enregistrer prescription
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex gap-2 items-center text-sm font-semibold text-[color:var(--navy)]">
                        <Clock className="size-4" /> Demande dâ€™examen
                      </div>
                      <input
                        value={examType}
                        onChange={(e) => setExamType(e.target.value)}
                        placeholder="Type (ex: NFS, Glycémie, Radio...)"
                        className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className={`rounded-2xl border py-2.5 text-sm ${examPriority === "routine" ? "bg-muted" : ""}`}
                          onClick={() => setExamPriority("routine")}
                        >
                          Routine
                        </button>
                        <button
                          type="button"
                          className={`rounded-2xl border py-2.5 text-sm ${examPriority === "urgent" ? "bg-muted" : ""}`}
                          onClick={() => setExamPriority("urgent")}
                        >
                          Urgent
                        </button>
                      </div>
                      <textarea
                        value={examNotes}
                        onChange={(e) => setExamNotes(e.target.value)}
                        placeholder="Notes / indications"
                        className="w-full min-h-16 rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void createExamOrder()}
                        disabled={creatingExam}
                        className="w-full rounded-2xl border py-3 text-sm font-semibold hover:bg-muted disabled:opacity-60"
                      >
                        Envoyer demande
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}



