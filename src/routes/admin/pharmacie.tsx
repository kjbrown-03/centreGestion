import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { type Medicine, useAuditLog } from "@/lib/store";
import { getSupabaseAsync } from "@/lib/supabase";

export const Route = createFileRoute("/admin/pharmacie")({
  component: Pharmacie,
});

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80";

const MEDICINE_CATALOG: Array<Omit<Medicine, "id" | "image">> = [
  { name: "Paracetamol 500mg", category: "Antalgique", stock: 100, threshold: 50, price: 500, expiry: "" },
  { name: "Amoxicilline 1g", category: "Antibiotique", stock: 40, threshold: 40, price: 2500, expiry: "" },
  { name: "Ibuprofene 400mg", category: "Anti-inflammatoire", stock: 80, threshold: 40, price: 750, expiry: "" },
  { name: "Doliprane sirop", category: "Antalgique", stock: 50, threshold: 25, price: 1800, expiry: "" },
  { name: "Ventoline aerosol", category: "Bronchodilatateur", stock: 25, threshold: 20, price: 3500, expiry: "" },
  { name: "Insuline rapide", category: "Endocrinologie", stock: 20, threshold: 15, price: 9000, expiry: "" },
  { name: "Aspirine 100mg", category: "Cardiologie", stock: 120, threshold: 50, price: 400, expiry: "" },
  { name: "Omeprazole 20mg", category: "Gastro", stock: 70, threshold: 30, price: 1600, expiry: "" },
  { name: "Serum physiologique", category: "Soins", stock: 200, threshold: 80, price: 300, expiry: "" },
  { name: "Artemether/Lumefantrine", category: "Antipaludique", stock: 60, threshold: 25, price: 2200, expiry: "" },
  { name: "Ceftriaxone 1g", category: "Antibiotique", stock: 30, threshold: 20, price: 3000, expiry: "" },
  { name: "Metformine 500mg", category: "Diabetologie", stock: 90, threshold: 35, price: 600, expiry: "" },
];

const empty: Omit<Medicine, "id"> = {
  name: "",
  category: "Pharmacie",
  stock: 0,
  threshold: 10,
  price: 0,
  expiry: "",
  image: "",
};

function catalogAsMedicines(): Medicine[] {
  return MEDICINE_CATALOG.map((m) => ({
    id: `catalog-${m.name}`,
    ...m,
    image: DEFAULT_IMAGE,
  }));
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const maybe = err as { message?: string; error_description?: string; details?: string; hint?: string };
    return maybe.message || maybe.error_description || maybe.details || maybe.hint || fallback;
  }
  return fallback;
}

function Pharmacie() {
  const auditAdd = useAuditLog((s) => s.add);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const supabase = await getSupabaseAsync();
      const { data, error: e } = await (supabase as any)
        .schema("app")
        .from("stock_items")
        .select("id, name, category, stock, threshold, unit_price, expiry_date")
        .eq("kind", "pharmacy")
        .order("name", { ascending: true });

      if (e) throw e;
      const mapped: Medicine[] = (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        category: r.category ?? "Pharmacie",
        stock: r.stock ?? 0,
        threshold: r.threshold ?? 10,
        price: Number(r.unit_price ?? 0),
        expiry: r.expiry_date ?? "",
        image: DEFAULT_IMAGE,
      }));
      setMedicines(mapped.length ? mapped : catalogAsMedicines());
    } catch (err) {
      setMedicines(catalogAsMedicines());
      setError(errorMessage(err, "Stock Supabase indisponible. Le catalogue local reste utilisable."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return medicines;
    return medicines.filter((m) => `${m.name} ${m.category}`.toLowerCase().includes(needle));
  }, [medicines, q]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(m: Medicine) {
    setEditing(m);
    setOpen(true);
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      const supabase = await getSupabaseAsync();
      const before = medicines.find((x) => x.id === id) ?? null;
      const { error: delErr } = await (supabase as any)
        .schema("app")
        .from("stock_items")
        .delete()
        .eq("id", id);
      if (delErr) throw delErr;
      setMedicines((s) => s.filter((x) => x.id !== id));
      auditAdd({ actorEmail: null, actorRole: null, action: "pharmacy.remove", target: id, meta: { before } });
    } catch (err) {
      setError(errorMessage(err, "Suppression impossible."));
    }
  }

  async function saveMedicine(data: Omit<Medicine, "id">) {
    setError(null);
    try {
      const supabase = await getSupabaseAsync();
      const { data: auth } = await supabase.auth.getUser();
      const actorId = auth.user?.id ?? null;

      if (editing) {
        const before = editing;
        const delta = data.stock - before.stock;
        const { error: upErr } = await (supabase as any)
          .schema("app")
          .from("stock_items")
          .update({
            name: data.name,
            category: data.category || "Pharmacie",
            stock: data.stock,
            threshold: before.threshold || 10,
            unit_price: data.price,
            expiry_date: data.expiry || null,
          })
          .eq("id", editing.id);

        if (upErr) throw upErr;

        if (actorId && delta !== 0) {
          const { error: mvErr } = await (supabase as any).schema("app").from("stock_movements").insert({
            item_id: editing.id,
            moved_by: actorId,
            delta,
            reason: "adjust",
          });
          if (mvErr) throw mvErr;
        }

        setMedicines((s) => s.map((x) => (x.id === editing.id ? { ...x, ...data } : x)));
        auditAdd({
          actorEmail: null,
          actorRole: null,
          action: "pharmacy.update",
          target: editing.id,
          meta: { before, patch: data },
        });
      } else {
        const { data: created, error: crErr } = await (supabase as any)
          .schema("app")
          .from("stock_items")
          .insert({
            kind: "pharmacy",
            name: data.name,
            category: data.category || "Pharmacie",
            stock: data.stock,
            threshold: 10,
            unit_price: data.price,
            expiry_date: data.expiry || null,
          })
          .select("id")
          .single();
        if (crErr) throw crErr;

        const newMed: Medicine = { id: created.id, ...data, image: DEFAULT_IMAGE };
        setMedicines((s) => [newMed, ...s]);
        auditAdd({
          actorEmail: null,
          actorRole: null,
          action: "pharmacy.add",
          target: created.id,
          meta: { name: newMed.name, category: newMed.category, stock: newMed.stock },
        });
      }

      setOpen(false);
    } catch (err) {
      const newMed: Medicine = {
        id: editing?.id ?? `local-${crypto.randomUUID()}`,
        ...data,
        image: DEFAULT_IMAGE,
      };
      setMedicines((s) =>
        editing ? s.map((x) => (x.id === editing.id ? newMed : x)) : [newMed, ...s],
      );
      setOpen(false);
      setError(
        `${errorMessage(err, "Enregistrement Supabase impossible.")} Le médicament est affiché localement; reconnectez-vous avec une session admin Supabase pour le persister.`,
      );
    }
  }

  return (
    <DashboardLayout allow="admin" title="Pharmacie">
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="relative max-w-2xl flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un medicament..."
            className="pl-9 pr-4 py-2.5 rounded-xl border bg-card text-sm w-full outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
          />
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl gradient-mint text-[color:var(--navy)] font-semibold px-5 py-2.5 shadow-mint hover:brightness-110 transition"
        >
          <Plus className="size-4" /> Nouveau medicament
        </button>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? <p className="text-center text-muted-foreground mt-12">Chargement...</p> : null}

      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        <AnimatePresence mode="popLayout">
          {filtered.map((m) => {
            const low = m.stock <= m.threshold;
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 240, damping: 22 }}
                className="group rounded-2xl border bg-card overflow-hidden hover:shadow-glow transition"
              >
                <div className="relative aspect-[5/3] overflow-hidden bg-muted">
                  <img src={m.image} alt={m.name} className="size-full object-cover transition duration-500 group-hover:scale-110" />
                  {low ? (
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold rounded-full bg-amber-500 text-white px-2.5 py-1">
                      <AlertTriangle className="size-3" /> Stock bas
                    </span>
                  ) : null}
                  <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider font-bold rounded-full glass px-2.5 py-1 text-[color:var(--navy)]">
                    {m.category}
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-[color:var(--navy)] truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Exp. {m.expiry ? new Date(m.expiry).toLocaleDateString("fr-FR") : "-"}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${low ? "text-amber-600" : "text-[color:var(--navy)]"}`}>{m.stock}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unites</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-[color:var(--navy)]">{m.price.toLocaleString("fr-FR")} FCFA</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unite</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => openEdit(m)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs rounded-lg border py-2 hover:bg-muted transition"
                    >
                      <Pencil className="size-3.5" /> Editer
                    </button>
                    <button
                      onClick={() => void handleRemove(m.id)}
                      className="inline-flex items-center justify-center rounded-lg border border-destructive/30 text-destructive p-2 hover:bg-destructive/10 transition"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {!loading && filtered.length === 0 ? (
        <p className="text-center text-muted-foreground mt-12">Aucun medicament trouve.</p>
      ) : null}

      <AnimatePresence>
        {open ? (
          <MedicineForm
            initial={editing ?? empty}
            medicines={medicines}
            onClose={() => setOpen(false)}
            onSave={(data) => void saveMedicine(data)}
          />
        ) : null}
      </AnimatePresence>
    </DashboardLayout>
  );
}

function MedicineForm({
  initial, medicines, onClose, onSave,
}: {
  initial: Omit<Medicine, "id"> | Medicine;
  medicines: Medicine[];
  onClose: () => void;
  onSave: (m: Omit<Medicine, "id">) => void;
}) {
  const medicineOptions = useMemo(() => {
    const seen = new Map<string, Omit<Medicine, "image">>();
    for (const m of medicines) {
      if (m.name && !seen.has(m.name)) seen.set(m.name, m);
    }
    for (const m of MEDICINE_CATALOG) {
      if (m.name && !seen.has(m.name)) seen.set(m.name, { id: `catalog-${m.name}`, ...m });
    }
    if (initial.name && !seen.has(initial.name)) {
      seen.set(initial.name, { ...(initial as Medicine), id: "id" in initial ? initial.id : `initial-${initial.name}` });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [medicines, initial]);

  const [form, setForm] = useState({
    name: initial.name,
    category: initial.category,
    stock: "id" in initial ? String(initial.stock) : "",
    price: "id" in initial ? String(initial.price) : "",
    expiry: initial.expiry,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function chooseMedicine(name: string) {
    const found = medicineOptions.find((m) => m.name === name);
    setForm((f) => ({
      ...f,
      name,
      category: found?.category ?? "Pharmacie",
      stock: f.stock || String(found?.stock ?? ""),
      price: f.price || String(found?.price ?? ""),
      expiry: f.expiry || found?.expiry || "",
    }));
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
          onSave({
            name: form.name,
            category: form.category || "Pharmacie",
            stock: Number(form.stock),
            threshold: "id" in initial ? initial.threshold : 10,
            price: Number(form.price),
            expiry: form.expiry,
            image: "id" in initial ? initial.image : DEFAULT_IMAGE,
          });
        }}
        className="w-full max-w-lg rounded-3xl bg-card border shadow-glow p-5 sm:p-7"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-[color:var(--navy)]">
            {"id" in initial ? "Modifier le medicament" : "Nouveau medicament"}
          </h3>
          <button type="button" onClick={onClose} className="size-9 rounded-xl border grid place-items-center hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Nom">
            <select required value={form.name} onChange={(e) => chooseMedicine(e.target.value)} className={inp}>
              <option value="" disabled>
                Selectionner un medicament
              </option>
              {medicineOptions.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name} {m.category ? `- ${m.category}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date d'expiration">
              <input type="date" required value={form.expiry} onChange={(e) => set("expiry", e.target.value)} className={inp} />
            </Field>
            <Field label="Stock">
              <input type="number" min={0} placeholder="Quantite" value={form.stock} onChange={(e) => set("stock", e.target.value)} className={inp} required />
            </Field>
            <Field label="Prix (FCFA)">
              <input type="number" min={0} step={1} placeholder="Prix unitaire" value={form.price} onChange={(e) => set("price", e.target.value)} className={inp} required />
            </Field>
          </div>
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
