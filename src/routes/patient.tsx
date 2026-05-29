// @ts-nocheck
"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseAsync } from "@/lib/supabase";
import { hasGemini, patientReminders } from "@/lib/ai";
import {
  User,
  Calendar,
  FileText,
  Droplet,
  AlertCircle,
  Heart,
  Clock,
  Plus,
  Download,
  Printer,
  FileHeart,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/patient")({
  component: PatientDashboard,
});

function PatientDashboard() {
  const [patient, setPatient] = useState<any | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  // Simulated form inputs for booking an appointment
  const [desiredDate, setDesiredDate] = useState("");
  const [desiredTime, setDesiredTime] = useState("");
  const [reason, setReason] = useState("");

  // Selected prescription for full detail preview modal
  const [activePresc, setActivePresc] = useState<any | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiText, setAiText] = useState<string>("");
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) throw new Error("Session introuvable. Veuillez vous reconnecter.");
        setAuthEmail(user.email ?? null);
        const sb: any = supabase;
        const { data: link, error: linkErr } = await sb
          .schema("app")
          .from("patient_accounts")
          .select(
            "patient_id, patient:patient_id (id, first_name, last_name, birth_date, phone, allergies, chronic_conditions)"
          )
          .eq("user_id", user.id)
          .single();
        if (linkErr) throw linkErr;
        const pid = link.patient_id;
        if (alive) setPatient(link.patient);
        const [ap, pr, inv] = await Promise.all([
          sb
            .schema("app")
            .from("appointments")
            .select("id, scheduled_at, status, reason, practitioner:practitioner_id (full_name)")
            .eq("patient_id", pid)
            .order("scheduled_at", { ascending: false }),
          sb
            .schema("app")
            .from("prescriptions")
            .select(
              "id, created_at, status, practitioner:practitioner_id (full_name), items:prescription_items (id, medicine_name, dosage, frequency, duration)"
            )
            .eq("patient_id", pid)
            .order("created_at", { ascending: false }),
          sb
            .schema("app")
            .from("invoices")
            .select("id, invoice_no, status, total, created_at, items:invoice_items (label, qty, unit_price, line_total)")
            .eq("patient_id", pid)
            .order("created_at", { ascending: false }),
        ]);
        if (ap.error) throw ap.error;
        if (pr.error) throw pr.error;
        if (inv.error) throw inv.error;
        if (alive) {
          setAppointments(ap.data ?? []);
          setPrescriptions(pr.data ?? []);
          setInvoices(inv.data ?? []);
        }
      } catch (err: any) {
        toast.error(err?.message ?? "Impossible de charger vos données.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const patientAppointments = useMemo(
    () =>
      [...appointments].sort(
        (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
      ),
    [appointments]
  );

  const upcomingAppointments = patientAppointments.filter(
    (apt) => new Date(apt.scheduled_at).getTime() >= Date.now()
  );

  const pastAppointments = patientAppointments.filter(
    (apt) => new Date(apt.scheduled_at).getTime() < Date.now()
  );

  const patientPrescriptions = prescriptions;

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desiredDate || !desiredTime || !reason.trim()) {
      toast.error("Veuillez remplir tous les champs du formulaire.");
      return;
    }
    if (!patient?.id) {
      toast.error("Votre compte patient n'est pas lié. Contactez l'administration.");
      return;
    }
    try {
      const supabase = await getSupabaseAsync();
      const whenIso = new Date(`${desiredDate}T${desiredTime}:00`).toISOString();
      const { error } = await (supabase as any)
        .schema("app")
        .from("appointments")
        .insert({ patient_id: patient.id, scheduled_at: whenIso, reason: reason.trim() || null });
      if (error) throw error;
      setDesiredDate("");
      setDesiredTime("");
      setReason("");
      toast.success("Rendez-vous demandé ! En attente de validation par l'accueil.");
      const { data, error: apErr } = await (supabase as any)
        .schema("app")
        .from("appointments")
        .select("id, scheduled_at, status, reason, practitioner:practitioner_id (full_name)")
        .eq("patient_id", patient.id)
        .order("scheduled_at", { ascending: false });
      if (!apErr) setAppointments(data ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la demande de rendez-vous.");
    }
  };

  const handleDownloadPrescription = (id: string) => {
    toast.success(`Ordonnance ${id} enregistrée sur votre appareil (PDF simulé).`);
  };

  const handlePrintPrescription = () => {
    window.print();
    toast.success("Impression de l'ordonnance lancée.");
  };

  const handlePrintInvoice = () => {
    window.print();
    toast.success("Impression de la facture lancée.");
  };

  async function runAiReminders() {
    try {
      if (!hasGemini()) {
        toast.error("Clé IA manquante (VITE_GEMINI_API_KEY). Ajoutez-la dans .env pour activer l'assistant.");
        return;
      }
      setAiLoading(true);
      const nextAptIso = upcomingAppointments[0]?.scheduled_at as string | undefined;
      const latestItems = ((patientPrescriptions?.[0]?.items ?? []) as any[]).map((i: any) => ({
        name: i.medicine_name,
        dosage: i.dosage ?? undefined,
        frequency: i.frequency ?? undefined,
      }));
      const text = await patientReminders({ nextAppointmentIso: nextAptIso, meds: latestItems });
      setAiText(text);
    } catch (err: any) {
      toast.error(err?.message ?? "Assistant IA indisponible.");
    } finally {
      setAiLoading(false);
    }
  }

function PatientMessaging({ patient }: { patient: any | null }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!patient?.id) return;
      setLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        const { data, error } = await (supabase as any)
          .schema("app")
          .from("messages")
          .select("id, body, sender, created_at, practitioner:practitioner_id(full_name)")
          .eq("patient_id", patient.id)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (alive) setMessages(data ?? []);
      } catch (err: any) {
        toast.error(err?.message ?? "Impossible de charger la messagerie.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [patient?.id]);

  async function send() {
    if (!patient?.id) return;
    const txt = body.trim();
    if (!txt) return;
    setSending(true);
    try {
      const supabase = await getSupabaseAsync();
      const { error } = await (supabase as any)
        .schema("app")
        .from("messages")
        .insert({ patient_id: patient.id, practitioner_id: null, sender: "patient", body: txt });
      if (error) throw error;
      setBody("");
      const { data, error: rErr } = await (supabase as any)
        .schema("app")
        .from("messages")
        .select("id, body, sender, created_at, practitioner:practitioner_id(full_name)")
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: true });
      if (!rErr) setMessages(data ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="rounded-3xl border bg-card p-7 shadow-sm max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="p-2 rounded-xl gradient-mint text-[color:var(--navy)]">
          <MessageSquare className="size-5" />
        </span>
        <div>
          <h3 className="text-lg font-bold text-[color:var(--navy)]">Messagerie sécurisée</h3>
          <p className="text-xs text-muted-foreground">Échangez avec le secrétariat et votre praticien.</p>
        </div>
      </div>

      <div className="mt-6 space-y-3 max-h-[380px] overflow-auto pr-1">
        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : (messages ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Aucun message.</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`px-4 py-3 rounded-2xl border ${
                m.sender === "patient" ? "bg-[color:var(--mint)]/10 ml-8" : "bg-muted/40 mr-8"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {m.sender === "patient" ? "Moi" : m.practitioner?.full_name || (m.sender === "secretaire" ? "Secrétariat" : "Praticien")}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-[color:var(--navy)] mt-1 whitespace-pre-wrap">{m.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Votre message…"
          className="flex-1 rounded-2xl border bg-background px-4 py-3 text-sm outline-none"
        />
        <Button onClick={() => void send()} disabled={sending || !body.trim()} className="rounded-2xl">
          Envoyer
        </Button>
      </div>
    </Card>
  );
}

  return (
    <DashboardLayout allow="patient" title="Mon Espace Santé">
      {/* Overview stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Groupe Sanguin"
          value={patient?.blood_type ?? "-"}
          hint="Données biologiques validées"
          icon={Droplet}
          accent
        />
        <StatCard
          label="Prochains RDV"
          value={upcomingAppointments.length}
          hint={upcomingAppointments.length > 0 ? "Consultez l'agenda" : "Aucun planifié"}
          icon={Calendar}
        />
        <StatCard
          label="Ordonnances Actives"
          value={patientPrescriptions.length}
          hint="Dernières prescriptions"
          icon={FileText}
        />
        <StatCard
          label="Allergies Identifiées"
          value={patient ? (patient.allergies?.length ?? 0) : 0}
          hint="Dossier médical unifié"
          icon={AlertCircle}
        />
      </div>

      {/* IA reminders */}
      <div className="mt-4 space-y-3">
        <Button
          onClick={() => void runAiReminders()}
          disabled={aiLoading}
          className="rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold px-5 py-3 border-none shadow-mint disabled:opacity-60"
        >
          Assistant IA: Rappels & Conseils
        </Button>
        {aiText ? (
          <Card className="rounded-2xl border bg-muted/40">
            <CardContent className="pt-4">
              <pre className="whitespace-pre-wrap text-sm text-[color:var(--navy)]">{aiText}</pre>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Tabs defaultValue="appointments" className="mt-8 space-y-6">
        <TabsList className="grid w-full grid-cols-5 max-w-3xl bg-muted/60 p-1 rounded-2xl">
          <TabsTrigger value="appointments" className="rounded-xl flex items-center gap-2">
            <Calendar className="size-4" />
            <span className="hidden sm:inline">Rendez-vous</span>
          </TabsTrigger>
          <TabsTrigger value="medical" className="rounded-xl flex items-center gap-2">
            <FileHeart className="size-4" />
            <span className="hidden sm:inline">Dossier Médical</span>
          </TabsTrigger>
          <TabsTrigger value="prescriptions" className="rounded-xl flex items-center gap-2">
            <FileText className="size-4" />
            <span className="hidden sm:inline">Ordonnances</span>
          </TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-xl flex items-center gap-2">
            <FileText className="size-4" />
            <span className="hidden sm:inline">Factures</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="rounded-xl flex items-center gap-2">
            <MessageSquare className="size-4" />
            <span className="hidden sm:inline">Messagerie</span>
          </TabsTrigger>
        </TabsList>

        {/* ================= rendez-vous content ================= */}
        <TabsContent value="appointments" className="space-y-6 outline-none">
          <div className="grid lg:grid-cols-3 gap-6">
            
            {/* Request Appointment Form */}
            <Card className="lg:col-span-1 rounded-3xl border bg-card p-6 shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="p-0 mb-5">
                  <CardTitle className="text-xl font-bold text-[color:var(--navy)] flex items-center gap-2">
                    <span className="p-2 rounded-xl gradient-mint text-[color:var(--navy)]">
                      <Plus className="size-5" />
                    </span>
                    Nouveau Rendez-vous
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm text-muted-foreground">
                    Planifiez une consultation de médecine générale ou de suivi.
                  </CardDescription>
                </CardHeader>
                
                <form onSubmit={handleBookAppointment} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)] mb-1.5">
                      Date souhaitée
                    </label>
                    <input
                      type="date"
                      value={desiredDate}
                      onChange={(e) => setDesiredDate(e.target.value)}
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)] mb-1.5">
                      Heure préférée
                    </label>
                    <input
                      type="time"
                      value={desiredTime}
                      onChange={(e) => setDesiredTime(e.target.value)}
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--navy)] mb-1.5">
                      Motif de visite
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      placeholder="Ex: Suivi tension, renouvellement ordonnance, consultation..."
                      className="w-full rounded-xl border bg-card px-4 py-3 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition resize-none"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold py-3.5 shadow-mint hover:brightness-110 transition border-none mt-2"
                  >
                    <Calendar className="size-4" /> Demander le rendez-vous
                  </Button>
                </form>
              </div>
            </Card>

            {/* Appointment Lists */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Upcoming */}
              <Card className="rounded-3xl border bg-card p-6 shadow-sm">
                <CardHeader className="p-0 mb-5">
                  <CardTitle className="text-lg font-bold text-[color:var(--navy)] flex items-center gap-2">
                    <Clock className="size-5 text-[color:var(--mint)]" />
                    Consultations planifiées
                  </CardTitle>
                </CardHeader>
                
                {upcomingAppointments.length === 0 ? (
                  <div className="text-center py-10 border border-dashed rounded-2xl">
                    <Calendar className="size-8 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground text-sm">Aucun rendez-vous planifié à venir.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingAppointments.map((apt) => (
                      <motion.div
                        key={apt.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border bg-muted/20 hover:border-[color:var(--mint)]/30 hover:bg-muted/40 transition duration-300"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center justify-center size-14 rounded-xl gradient-mint text-[color:var(--navy)] shadow-sm shrink-0">
                            <span className="text-[10px] uppercase font-bold text-[color:var(--navy)]/60">
                              {format(new Date(apt.scheduled_at), "MMM", { locale: fr })}
                            </span>
                            <span className="text-xl font-bold leading-none -mt-0.5">
                              {format(new Date(apt.scheduled_at), "dd")}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-[color:var(--navy)]">{apt.practitioner?.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Clock className="size-3" /> {format(new Date(apt.scheduled_at), "HH:mm")} • {apt.reason}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          {apt.status === "en_attente" ? (
                            <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs rounded-full font-medium">
                              En attente d'approbation
                            </span>
                          ) : apt.status === "confirme" ? (
                            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs rounded-full font-medium flex items-center gap-1">
                              <CheckCircle2 className="size-3" /> Confirmé
                            </span>
                          ) : (
                            <span className="px-3 py-1 bg-muted border text-muted-foreground text-xs rounded-full font-medium flex items-center gap-1">
                              {apt.status}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Past / History */}
              <Card className="rounded-3xl border bg-card p-6 shadow-sm">
                <CardHeader className="p-0 mb-5">
                  <CardTitle className="text-lg font-bold text-[color:var(--navy)] flex items-center gap-2">
                    <Activity className="size-5 text-[color:var(--mint)]" />
                    Historique des consultations
                  </CardTitle>
                </CardHeader>
                
                {pastAppointments.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">Aucun historique disponible.</p>
                ) : (
                  <div className="space-y-3">
                    {pastAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="p-4 rounded-2xl border border-border/80 bg-muted/5 flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-[color:var(--navy)]/80">{apt.practitioner?.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Le {format(new Date(apt.scheduled_at), "dd MMMM yyyy à HH:mm", { locale: fr })}
                            </p>
                          </div>
                          <span className="px-3 py-1 bg-muted border text-muted-foreground text-xs rounded-full font-medium">
                            {apt.status === "termine" ? "Complété" : apt.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-6 outline-none">
          <Card className="rounded-3xl border bg-card p-6 shadow-sm">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="text-xl font-bold text-[color:var(--navy)] flex items-center gap-2">
                <FileText className="size-5 text-[color:var(--mint)]" /> Mes factures
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Retrouvez vos factures et téléchargez-les au format PDF.
              </CardDescription>
            </CardHeader>

            <div className="space-y-2">
              {(loading ? [] : invoices).map((f: any) => (
                <div key={f.id} className="flex items-center gap-4 p-4 rounded-2xl border justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-[color:var(--navy)]">Facture {f.invoice_no}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(f.created_at), "dd/MM/yyyy", { locale: fr })} · Total {Number(f.total ?? 0).toFixed(2)} XAF
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full border ${f.status === "payee" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {f.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveInvoice(f)}
                    className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full border hover:bg-muted"
                  >
                    <Download className="size-4" /> Télécharger
                  </button>
                </div>
              ))}
              {!loading && invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune facture disponible.</p>
              ) : null}
            </div>
          </Card>
        </TabsContent>

        {/* ================= dossier medical content ================= */}
        <TabsContent value="medical" className="space-y-6 outline-none">
          <div className="grid md:grid-cols-3 gap-6">
            
            {/* IdentityCard */}
            <Card className="rounded-3xl border bg-card p-7 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 size-32 gradient-mint rounded-full blur-3xl opacity-10" />
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-2xl gradient-mint grid place-items-center text-[color:var(--navy)] font-bold text-2xl shadow-sm">
                  {patient ? `${(patient.first_name || "").slice(0,1)}${(patient.last_name || "").slice(0,1)}` : "?"}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[color:var(--navy)]">{patient ? `${patient.first_name} ${patient.last_name}` : "—"}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Dossier médical unifié 2KC</p>
                </div>
              </div>

              <div className="mt-8 space-y-4 border-t border-border/60 pt-6">
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Date de Naissance</p>
                  <p className="text-sm font-semibold text-[color:var(--navy)] mt-0.5">
                    {patient?.birth_date ? format(new Date(patient.birth_date), "dd MMMM yyyy", { locale: fr }) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">E-mail</p>
                  <p className="text-sm font-semibold text-[color:var(--navy)] mt-0.5">{authEmail ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Téléphone</p>
                  <p className="text-sm font-semibold text-[color:var(--navy)] mt-0.5">{patient?.phone ?? "—"}</p>
                </div>
              </div>
            </Card>

            {/* Allergies & Biological Info */}
            <div className="md:col-span-2 grid sm:grid-cols-2 gap-6">
              
              {/* Allergy Card */}
              <Card className="rounded-3xl border border-red-500/20 bg-card p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="p-2 rounded-xl bg-red-500/10 text-red-600">
                      <AlertTriangle className="size-4" />
                    </span>
                    <h3 className="font-bold text-[color:var(--navy)]">Allergies connues</h3>
                  </div>
                  <div className="space-y-2">
                    {(patient?.allergies ?? []).map((a: string) => (
                      <div key={a} className="px-3.5 py-2.5 bg-red-500/5 border border-red-500/10 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                        ⚠️ {a}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-4">Validé par l'équipe soignante</p>
              </Card>

              {/* Medical History */}
              <Card className="rounded-3xl border bg-card p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="p-2 rounded-xl bg-[color:var(--navy)]/5 text-[color:var(--navy)]">
                      <Heart className="size-4" />
                    </span>
                    <h3 className="font-bold text-[color:var(--navy)]">Antécédents médicaux</h3>
                  </div>
                  <ul className="space-y-2">
                    {(patient?.chronic_conditions ?? []).map((h: string, i: number) => (
                      <li key={i} className="text-xs text-[color:var(--navy)]/80 flex items-start gap-2 bg-muted/30 p-2.5 rounded-xl">
                        <span className="mt-0.5 size-1.5 rounded-full bg-[color:var(--mint)] shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-[10px] text-muted-foreground mt-4">Actualisé le 24 mai 2026</p>
              </Card>
            </div>
          </div>

          {/* Current treatments */}
          <Card className="rounded-3xl border bg-card p-6 shadow-sm mt-6">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="text-lg font-bold text-[color:var(--navy)] flex items-center gap-2">
                <Stethoscope className="size-5 text-[color:var(--mint)]" />
                Traitements de fond actuels
              </CardTitle>
            </CardHeader>
            <div className="grid sm:grid-cols-2 gap-4">
              {((patientPrescriptions?.[0]?.items ?? []) as any[]).map((m: any) => (
                <div key={m.id} className="p-4 border rounded-2xl bg-muted/10 hover:bg-muted/20 transition duration-300 flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-[color:var(--navy)] text-base">{m.medicine_name}</h4>
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Activity className="size-3.5" /> Posologie : {[m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-[color:var(--mint)]/20 border border-[color:var(--mint)]/30 text-[color:var(--navy)] text-[10px] rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm">
                    Actif
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* ================= ordonnances content ================= */}
        <TabsContent value="prescriptions" className="space-y-6 outline-none">
          <Card className="rounded-3xl border bg-card p-6 shadow-sm">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="text-xl font-bold text-[color:var(--navy)] flex items-center gap-2">
                <FileText className="size-5 text-[color:var(--mint)]" />
                Vos Ordonnances Médicales
              </CardTitle>
            </CardHeader>

            <div className="space-y-4">
              {patientPrescriptions.map((presc: any) => (
                <div
                  key={presc.id}
                  className="p-5 rounded-2xl border border-border bg-card hover:border-[color:var(--mint)]/40 hover:shadow-glow transition duration-300 flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-bold text-[color:var(--navy)] text-lg">Ordonnance du {format(new Date(presc.created_at), "dd MMM yyyy", { locale: fr })}</h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-muted text-muted-foreground rounded border">
                        #{presc.id}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Prescrit par {presc.practitioner?.full_name || "—"}</p>
                    
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(presc.items ?? []).map((m: any, idx: number) => (
                        <span key={idx} className="text-xs px-3 py-1 rounded-xl bg-muted/40 border text-[color:var(--navy)]/80 font-medium">
                          {m.medicine_name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActivePresc(presc)}
                      className="rounded-xl font-semibold border-border hover:border-[color:var(--mint)] hover:text-[color:var(--navy)]"
                    >
                      <User className="size-4 mr-1.5" /> Consulter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadPrescription(presc.id)}
                      className="rounded-xl text-muted-foreground border-border hover:border-[color:var(--mint)] hover:text-[color:var(--navy)]"
                    >
                      <Download className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* ================= messagerie content ================= */}
        <TabsContent value="messages" className="space-y-6 outline-none">
          <PatientMessaging patient={patient} />
        </TabsContent>
      </Tabs>

      {/* ================= prescription visual pad modal ================= */}
      <AnimatePresence>
        {activePresc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl bg-white text-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 sm:p-10 border border-slate-200"
            >
              {/* Official style header */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 pb-6 border-b-2 border-slate-200">
                <div>
                  <div className="flex items-center gap-2 font-display font-bold text-2xl text-slate-900">
                    <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)] shrink-0">
                      <Activity className="size-5" strokeWidth={2.5} />
                    </span>
                    2KC
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Centre de Santé Pluridisciplinaire</p>
                  <p className="text-xs text-slate-400 mt-1">12 Rue de la Santé, 75014 Paris • Tél: 01 40 40 40 40</p>
                </div>
                <div className="text-left sm:text-right text-xs text-slate-500">
                  <p className="font-bold text-slate-800">{activePresc.practitioner?.full_name || "—"}</p>
                  <p>Médecin Généraliste</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">RPPS: 10009876543</p>
                </div>
              </div>

              {/* Patient info on Rx */}
              <div className="mt-6 flex justify-between text-sm">
                <div>
                  <span className="text-slate-400">Patient : </span>
                  <span className="font-bold text-slate-800">{patient ? `${patient.first_name} ${patient.last_name}` : "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400">Date : </span>
                  <span className="font-medium text-slate-800">
                    {format(new Date(activePresc.created_at), "dd/MM/yyyy", { locale: fr })}
                  </span>
                </div>
              </div>

              {/* Rx prescription content */}
              <div className="mt-8 min-h-[160px] space-y-6">
                <div className="font-serif italic text-3xl text-slate-300 font-bold select-none">Rx</div>
                
                <div className="space-y-4 pl-4 sm:pl-8">
                  {(activePresc.items ?? []).map((m: any, idx: number) => (
                    <div key={idx} className="space-y-1">
                      <p className="font-bold text-slate-900 text-base">• {m.medicine_name}</p>
                      <p className="text-sm text-slate-600 pl-4 font-mono">
                        {[m.dosage, m.frequency, m.duration].filter(Boolean).join(" — ")}
                      </p>
                    </div>
                  ))}
                </div>

                {activePresc.notes && (
                  <p className="text-xs text-slate-500 border-t border-slate-100 pt-4 mt-6 leading-relaxed italic">
                    Note : {activePresc.notes}
                  </p>
                )}
              </div>

              {/* Footer signature and stamp */}
              <div className="mt-10 pt-6 border-t border-slate-200 flex justify-between items-end">
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                  <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
                  Ordonnance signée numériquement
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Signature & Cachet</p>
                  <div className="size-16 rounded-full border-2 border-emerald-600/30 text-emerald-700/60 flex items-center justify-center font-serif text-[10px] rotate-12 select-none border-dashed mx-auto mb-2 uppercase font-bold shrink-0">
                    2KC SANTE
                  </div>
                  <p className="text-[11px] font-bold text-slate-800">{activePresc.practitioner?.full_name || "—"}</p>
                </div>
              </div>

              {/* Close and actions overlay */}
              <div className="mt-8 flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setActivePresc(null)}
                  className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  Fermer
                </Button>
                <Button
                  onClick={handlePrintPrescription}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 border-none"
                >
                  <Printer className="size-4" /> Imprimer
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl bg-white text-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 sm:p-10 border border-slate-200"
            >
              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 pb-6 border-b-2 border-slate-200">
                <div>
                  <div className="flex items-center gap-2 font-display font-bold text-2xl text-slate-900">
                    <span className="size-9 rounded-xl gradient-mint grid place-items-center text-[color:var(--navy)] shrink-0">
                      <Activity className="size-5" strokeWidth={2.5} />
                    </span>
                    2KC
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">Centre de Santé Pluridisciplinaire</p>
                  <p className="text-xs text-slate-400 mt-1">12 Rue de la Santé, 75014 Paris • Tél: 01 40 40 40 40</p>
                </div>
                <div className="text-left sm:text-right text-xs text-slate-500">
                  <p className="font-bold text-slate-800">Facture {activeInvoice.invoice_no}</p>
                  <p>Date: {format(new Date(activeInvoice.created_at), "dd/MM/yyyy", { locale: fr })}</p>
                </div>
              </div>

              <div className="mt-6 text-sm">
                <div className="flex justify-between">
                  <div>
                    <span className="text-slate-400">Patient : </span>
                    <span className="font-bold text-slate-800">{patient ? `${patient.first_name} ${patient.last_name}` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Statut : </span>
                    <span className="font-semibold text-slate-800">{activeInvoice.status}</span>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border">
                  <div className="grid grid-cols-6 gap-2 px-4 py-2 text-[11px] text-slate-500 border-b bg-slate-50">
                    <div className="col-span-3">Désignation</div>
                    <div className="text-right">Qté</div>
                    <div className="text-right">PU</div>
                    <div className="text-right">Total</div>
                  </div>
                  <div className="divide-y">
                    {(activeInvoice.items ?? []).map((li: any, i: number) => (
                      <div key={i} className="grid grid-cols-6 gap-2 px-4 py-2 text-sm">
                        <div className="col-span-3">{li.label}</div>
                        <div className="text-right">{li.qty}</div>
                        <div className="text-right">{Number(li.unit_price ?? 0).toFixed(2)}</div>
                        <div className="text-right">{Number(li.line_total ?? 0).toFixed(2)}</div>
                      </div>
                    ))}
                    {(activeInvoice.items ?? []).length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">Aucun détail disponible.</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <div className="text-sm">
                    <div className="flex justify-between gap-8">
                      <span className="text-slate-500">Total</span>
                      <span className="font-bold text-slate-800">{Number(activeInvoice.total ?? 0).toFixed(2)} XAF</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setActiveInvoice(null)}
                  className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  Fermer
                </Button>
                <Button
                  onClick={handlePrintInvoice}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 border-none"
                >
                  <Printer className="size-4" /> Imprimer / Télécharger
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
