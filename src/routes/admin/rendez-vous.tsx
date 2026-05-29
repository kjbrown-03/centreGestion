import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { getSupabase } from "@/lib/supabase";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Pencil, Search, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/admin/rendez-vous")({
  component: RendezVousAdmin,
});

type PatientMini = {
  id: string;
  patient_code: string;
  first_name: string;
  last_name: string;
};

type PractitionerMini = {
  user_id: string;
  full_name: string;
};

type AppointmentRow = {
  id: string;
  scheduled_at: string;
  status: string;
  reason: string | null;
  patient: PatientMini;
  practitioner: PractitionerMini | null;
};

const empty = {
  patient_id: "",
  practitioner_id: "",
  scheduled_at: "",
  status: "en_attente",
  reason: "",
};

function RendezVousAdmin() {
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [patients, setPatients] = useState<PatientMini[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentRow | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabase();
        const sb: any = supabase;

        const [{ data: pats, error: pErr }, { data: prats, error: prErr }, { data: appts, error: aErr }] =
          await Promise.all([
            sb.schema("app").from("patients").select("id, patient_code, first_name, last_name").order("created_at", { ascending: false }),
            sb.schema("app").from("profiles").select("user_id, full_name").in("role", ["medecin", "infirmier"]).order("full_name", { ascending: true }),
            sb
              .schema("app")
              .from("appointments")
              .select("id, scheduled_at, status, reason, patient:patients(id, patient_code, first_name, last_name), practitioner:profiles(user_id, full_name)")
              .order("scheduled_at", { ascending: false }),
          ]);

        if (pErr) throw pErr;
        if (prErr) throw prErr;
        if (aErr) throw aErr;

        if (!alive) return;
        setPatients((pats ?? []) as PatientMini[]);
        setPractitioners((prats ?? []) as PractitionerMini[]);
        setRows((appts ?? []) as AppointmentRow[]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur";
        if (alive) setError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const p = r.patient;
      const text = `${p.patient_code} ${p.first_name} ${p.last_name} ${r.reason ?? ""} ${r.practitioner?.full_name ?? ""}`.toLowerCase();
      return text.includes(needle);
    });
  }, [rows, q]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(r: AppointmentRow) {
    setEditing(r);
    setOpen(true);
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      const supabase = getSupabase();
      const sb: any = supabase;
      const { error: delErr } = await sb.schema("app").from("appointments").delete().eq("id", id);
      if (delErr) throw delErr;
      setRows((s) => s.filter((x) => x.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setError(msg);
    }
  }

  return (
    <DashboardLayout allow="admin" title="Rendez-vous">
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="flex flex-1 gap-3 max-w-2xl">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (patient, code, motif, praticien)..."
              className="pl-9 pr-4 py-2.5 rounded-xl border bg-card text-sm w-full outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
            />
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl gradient-mint text-[color:var(--navy)] font-semibold px-5 py-2.5 shadow-mint hover:brightness-110 transition"
        >
          <Plus className="size-4" /> Nouveau RDV
        </button>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-center text-muted-foreground mt-12">Chargement...</p>
      )}

      <div className="mt-8 rounded-3xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Date/Heure</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Patient</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Statut</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Praticien</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Motif</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/20 transition">
                  <td className="px-5 py-4 whitespace-nowrap">{new Date(r.scheduled_at).toLocaleString("fr-FR")}</td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-[color:var(--navy)]">{r.patient.last_name} {r.patient.first_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.patient.patient_code}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-3 py-1 rounded-full bg-muted border text-xs font-medium">{r.status}</span>
                  </td>
                  <td className="px-5 py-4">{r.practitioner?.full_name ?? "—"}</td>
                  <td className="px-5 py-4">{r.reason ?? "—"}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1.5 text-xs rounded-lg border px-3 py-2 hover:bg-muted transition"
                      >
                        <Pencil className="size-3.5" /> Éditer
                      </button>
                      <button
                        onClick={() => void handleRemove(r.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-destructive/30 text-destructive px-3 py-2 hover:bg-destructive/10 transition"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-10">Aucun rendez-vous trouvé.</p>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <RdvForm
            patients={patients}
            practitioners={practitioners}
            initial={
              editing
                ? {
                    patient_id: editing.patient.id,
                    practitioner_id: editing.practitioner?.user_id ?? "",
                    scheduled_at: editing.scheduled_at.slice(0, 16),
                    status: editing.status,
                    reason: editing.reason ?? "",
                  }
                : empty
            }
            title={editing ? "Modifier le RDV" : "Nouveau RDV"}
            onClose={() => setOpen(false)}
            onSave={(data) => {
              void (async () => {
                setError(null);
                try {
                  const supabase = getSupabase();
                  const sb: any = supabase;
                  const scheduledAt = new Date(data.scheduled_at).toISOString();

                  if (editing) {
                    const { error: upErr } = await sb
                      .schema("app")
                      .from("appointments")
                      .update({
                        patient_id: data.patient_id,
                        practitioner_id: data.practitioner_id || null,
                        scheduled_at: scheduledAt,
                        status: data.status,
                        reason: data.reason || null,
                      })
                      .eq("id", editing.id);
                    if (upErr) throw upErr;

                    const p = patients.find((x) => x.id === data.patient_id) ?? editing.patient;
                    const pr = data.practitioner_id
                      ? practitioners.find((x) => x.user_id === data.practitioner_id) ?? editing.practitioner
                      : null;

                    setRows((s) =>
                      s.map((x) =>
                        x.id === editing.id
                          ? {
                              ...x,
                              scheduled_at: scheduledAt,
                              status: data.status,
                              reason: data.reason || null,
                              patient: p,
                              practitioner: pr ?? null,
                            }
                          : x
                      )
                    );
                  } else {
                    const { data: created, error: crErr } = await sb
                      .schema("app")
                      .from("appointments")
                      .insert({
                        patient_id: data.patient_id,
                        practitioner_id: data.practitioner_id || null,
                        scheduled_at: scheduledAt,
                        status: data.status,
                        reason: data.reason || null,
                      })
                      .select("id")
                      .single();
                    if (crErr) throw crErr;

                    const p = patients.find((x) => x.id === data.patient_id);
                    if (!p) throw new Error("Patient introuvable");
                    const pr = data.practitioner_id ? practitioners.find((x) => x.user_id === data.practitioner_id) ?? null : null;

                    setRows((s) => [
                      {
                        id: created.id,
                        scheduled_at: scheduledAt,
                        status: data.status,
                        reason: data.reason || null,
                        patient: p,
                        practitioner: pr,
                      },
                      ...s,
                    ]);
                  }

                  setOpen(false);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Erreur";
                  setError(msg);
                }
              })();
            }}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

function RdvForm({
  title,
  patients,
  practitioners,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  patients: PatientMini[];
  practitioners: PractitionerMini[];
  initial: typeof empty;
  onClose: () => void;
  onSave: (v: typeof empty) => void;
}) {
  const [form, setForm] = useState<typeof empty>(initial);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[color:var(--navy)]/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.form
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
        className="w-full max-w-xl rounded-3xl bg-card border shadow-glow p-7"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-[color:var(--navy)]">{title}</h3>
          <button type="button" onClick={onClose} className="size-9 rounded-xl border grid place-items-center hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Patient">
            <select required value={form.patient_id} onChange={(e) => set("patient_id", e.target.value)} className={inp}>
              <option value="" disabled>
                Sélectionner...
              </option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.patient_code} — {p.last_name} {p.first_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Praticien (optionnel)">
            <select value={form.practitioner_id} onChange={(e) => set("practitioner_id", e.target.value)} className={inp}>
              <option value="">—</option>
              {practitioners.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date/Heure">
              <input type="datetime-local" required value={form.scheduled_at} onChange={(e) => set("scheduled_at", e.target.value)} className={inp} />
            </Field>
            <Field label="Statut">
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inp}>
                <option value="en_attente">en_attente</option>
                <option value="confirme">confirme</option>
                <option value="annule">annule</option>
                <option value="termine">termine</option>
              </select>
            </Field>
          </div>

          <Field label="Motif">
            <input value={form.reason} onChange={(e) => set("reason", e.target.value)} className={inp} />
          </Field>
        </div>

        <div className="mt-7 flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border text-sm hover:bg-muted">Annuler</button>
          <button type="submit" className="px-5 py-2.5 rounded-xl gradient-mint text-[color:var(--navy)] font-semibold text-sm shadow-mint hover:brightness-110">
            Enregistrer
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

const inp = "w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[color:var(--navy)] mb-1.5 block uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}
