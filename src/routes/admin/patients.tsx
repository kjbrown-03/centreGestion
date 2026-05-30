import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { getSupabase } from "@/lib/supabase";
import { whatsappUrlFor } from "@/lib/contact";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export const Route = createFileRoute("/admin/patients")({
  component: PatientsAdmin,
});

type PatientRow = {
  id: string;
  patient_code: string;
  first_name: string;
  last_name: string;
  sex: "M" | "F";
  birth_date: string;
  phone: string;
  address: string;
};

const empty: Omit<PatientRow, "id"> = {
  patient_code: "",
  first_name: "",
  last_name: "",
  sex: "M",
  birth_date: "",
  phone: "",
  address: "",
};

function PatientsAdmin() {
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRow | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabase();
        const sb: any = supabase;
        const { data, error: e } = await sb
          .schema("app")
          .from("patients")
          .select("id, patient_code, first_name, last_name, sex, birth_date, phone, address")
          .order("created_at", { ascending: false });
        if (e) throw e;
        const mapped: PatientRow[] = (data ?? []).map((r: any) => ({
          id: r.id,
          patient_code: r.patient_code,
          first_name: r.first_name,
          last_name: r.last_name,
          sex: r.sex,
          birth_date: r.birth_date,
          phone: r.phone ?? "",
          address: r.address ?? "",
        }));
        if (alive) setRows(mapped);
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
      const hay = `${r.patient_code} ${r.first_name} ${r.last_name} ${r.phone ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(r: PatientRow) {
    setEditing(r);
    setOpen(true);
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      const supabase = getSupabase();
      const sb: any = supabase;
      const { error: delErr } = await sb.schema("app").from("patients").delete().eq("id", id);
      if (delErr) throw delErr;
      setRows((s) => s.filter((x) => x.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setError(msg);
    }
  }

  return (
    <DashboardLayout allow="admin" title="Patients">
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="flex flex-1 gap-3 max-w-2xl">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (code, nom, tÃ©lÃ©phone)..."
              className="pl-9 pr-4 py-2.5 rounded-xl border bg-card text-sm w-full outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
            />
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl gradient-mint text-[color:var(--navy)] font-semibold px-5 py-2.5 shadow-mint hover:brightness-110 transition"
        >
          <Plus className="size-4" /> Nouveau patient
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
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Code</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Nom</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Sexe</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Naissance</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">TÃ©lÃ©phone</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]">Adresse</th>
                <th className="px-5 py-4 font-semibold text-[color:var(--navy)]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/20 transition">
                  <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{r.patient_code}</td>
                  <td className="px-5 py-4 font-semibold text-[color:var(--navy)]">{r.last_name} {r.first_name}</td>
                  <td className="px-5 py-4">{r.sex}</td>
                  <td className="px-5 py-4">{new Date(r.birth_date).toLocaleDateString("fr-FR")}</td>
                  <td className="px-5 py-4">{r.phone ? (<a href={whatsappUrlFor(r.phone)} target="_blank" rel="noreferrer" className="hover:underline">{r.phone}</a>) : ("-")}</td>
                  <td className="px-5 py-4">{r.address || "â€”"}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1.5 text-xs rounded-lg border px-3 py-2 hover:bg-muted transition"
                      >
                        <Pencil className="size-3.5" /> Ã‰diter
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
          <p className="text-center text-muted-foreground py-10">Aucun patient trouvÃ©.</p>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <PatientForm
            initial={editing ?? empty}
            onClose={() => setOpen(false)}
            onSave={(data) => {
              void (async () => {
                setError(null);
                try {
                  const supabase = getSupabase();
                  const sb: any = supabase;

                  if (editing) {
                    const { error: upErr } = await sb
                      .schema("app")
                      .from("patients")
                      .update({
                        patient_code: data.patient_code,
                        first_name: data.first_name,
                        last_name: data.last_name,
                        sex: data.sex,
                        birth_date: data.birth_date,
                        phone: data.phone || null,
                        address: data.address || null,
                      })
                      .eq("id", editing.id);
                    if (upErr) throw upErr;
                    setRows((s) => s.map((x) => (x.id === editing.id ? { ...x, ...data } : x)));
                  } else {
                    const { data: created, error: crErr } = await sb
                      .schema("app")
                      .from("patients")
                      .insert({
                        patient_code: data.patient_code,
                        first_name: data.first_name,
                        last_name: data.last_name,
                        sex: data.sex,
                        birth_date: data.birth_date,
                        phone: data.phone || null,
                        address: data.address || null,
                      })
                      .select("id")
                      .single();
                    if (crErr) throw crErr;
                    setRows((s) => [{ id: created.id, ...data }, ...s]);
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

function PatientForm({
  initial,
  onClose,
  onSave,
}: {
  initial: Omit<PatientRow, "id"> | PatientRow;
  onClose: () => void;
  onSave: (r: Omit<PatientRow, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<PatientRow, "id">>({
    patient_code: initial.patient_code,
    first_name: initial.first_name,
    last_name: initial.last_name,
    sex: initial.sex,
    birth_date: initial.birth_date,
    phone: initial.phone,
    address: initial.address,
  });

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
          <h3 className="text-xl font-bold text-[color:var(--navy)]">
            {"id" in initial ? "Modifier le patient" : "Nouveau patient"}
          </h3>
          <button type="button" onClick={onClose} className="size-9 rounded-xl border grid place-items-center hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code patient">
              <input required value={form.patient_code} onChange={(e) => set("patient_code", e.target.value)} className={inp} />
            </Field>
            <Field label="Sexe">
              <select value={form.sex} onChange={(e) => set("sex", e.target.value as any)} className={inp}>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom">
              <input required value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inp} />
            </Field>
            <Field label="PrÃ©nom">
              <input required value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inp} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date de naissance">
              <input type="date" required value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} className={inp} />
            </Field>
            <Field label="TÃ©lÃ©phone">
              <input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={inp} />
            </Field>
          </div>

          <Field label="Adresse">
            <input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} className={inp} />
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
