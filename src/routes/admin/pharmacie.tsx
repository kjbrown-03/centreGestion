import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { type Medicine, useAuditLog } from "@/lib/store";
import { Plus, Pencil, Trash2, Search, AlertTriangle, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/pharmacie")({
  component: Pharmacie,
});

const CATEGORIES = ["Tous", "Antalgique", "Antibiotique", "Anti-inflammatoire", "Bronchodilatateur", "Endocrinologie", "Cardiologie", "Gastro", "Antihistaminique", "Soins", "Antiseptique", "Vitamines"];

const empty: Omit<Medicine, "id"> = {
  name: "", category: "Antalgique", stock: 0, threshold: 0, price: 0, expiry: "", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80",
};

function Pharmacie() {
  const auditAdd = useAuditLog((s) => s.add);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Tous");
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [open, setOpen] = useState(false);

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
          .from("stock_items")
          .select("id, name, category, stock, threshold, unit_price, expiry_date")
          .eq("kind", "pharmacy")
          .order("name", { ascending: true });

        if (e) throw e;
        const mapped: Medicine[] = (data ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          category: r.category ?? "Autre",
          stock: r.stock ?? 0,
          threshold: r.threshold ?? 0,
          price: Number(r.unit_price ?? 0),
          expiry: r.expiry_date ?? "",
          image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80",
        }));

        if (alive) setMedicines(mapped);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur lors du chargement du stock";
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
    return medicines.filter((m) => {
      const matchQ = m.name.toLowerCase().includes(q.toLowerCase());
      const matchC = cat === "Tous" || m.category === cat;
      return matchQ && matchC;
    });
  }, [medicines, q, cat]);

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(m: Medicine) { setEditing(m); setOpen(true); }

  async function handleRemove(id: string) {
    setError(null);
    try {
      const supabase = getSupabase();
      const sb: any = supabase;
      const before = medicines.find((x) => x.id === id) ?? null;
      const { error: delErr } = await sb.schema("app").from("stock_items").delete().eq("id", id);
      if (delErr) throw delErr;
      setMedicines((s) => s.filter((x) => x.id !== id));
      auditAdd({ actorEmail: null, actorRole: null, action: "pharmacy.remove", target: id, meta: { before } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setError(msg);
    }
  }

  return (
    <DashboardLayout allow="admin" title="Pharmacie">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="flex flex-1 gap-3 max-w-2xl">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un médicament..."
              className="pl-9 pr-4 py-2.5 rounded-xl border bg-card text-sm w-full outline-none focus:border-[color:var(--mint)] focus:ring-4 focus:ring-[color:var(--mint)]/20 transition"
            />
          </div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-xl border bg-card text-sm px-3 py-2.5 outline-none focus:border-[color:var(--mint)]"
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl gradient-mint text-[color:var(--navy)] font-semibold px-5 py-2.5 shadow-mint hover:brightness-110 transition"
        >
          <Plus className="size-4" /> Nouveau médicament
        </button>
      </div>

      {/* Grid */}
      {error && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-center text-muted-foreground mt-12">Chargement...</p>
      )}

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
                  {low && (
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold rounded-full bg-amber-500 text-white px-2.5 py-1">
                      <AlertTriangle className="size-3" /> Stock bas
                    </span>
                  )}
                  <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider font-bold rounded-full glass px-2.5 py-1 text-[color:var(--navy)]">
                    {m.category}
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-[color:var(--navy)] truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Exp. {new Date(m.expiry).toLocaleDateString("fr-FR")}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${low ? "text-amber-600" : "text-[color:var(--navy)]"}`}>{m.stock}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unités</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-[color:var(--navy)]">{m.price.toFixed(2)} €</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unité</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => openEdit(m)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs rounded-lg border py-2 hover:bg-muted transition"
                    >
                      <Pencil className="size-3.5" /> Éditer
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

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground mt-12">Aucun médicament trouvé.</p>
      )}

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <MedicineForm
            initial={editing ?? empty}
            onClose={() => setOpen(false)}
            onSave={(data) => {
              void (async () => {
                setError(null);
                try {
                  const supabase = getSupabase();
                  const sb: any = supabase;
                  const { data: auth } = await supabase.auth.getUser();
                  const actorId = auth.user?.id ?? null;

                  if (editing) {
                    const before = editing;
                    const delta = data.stock - before.stock;

                    const { error: upErr } = await sb
                      .schema("app")
                      .from("stock_items")
                      .update({
                        name: data.name,
                        category: data.category,
                        stock: data.stock,
                        threshold: data.threshold,
                        unit_price: data.price,
                        expiry_date: data.expiry || null,
                      })
                      .eq("id", editing.id);

                    if (upErr) throw upErr;

                    if (actorId && delta !== 0) {
                      const { error: mvErr } = await sb.schema("app").from("stock_movements").insert({
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
                    const { data: created, error: crErr } = await sb
                      .schema("app")
                      .from("stock_items")
                      .insert({
                        kind: "pharmacy",
                        name: data.name,
                        category: data.category,
                        stock: data.stock,
                        threshold: data.threshold,
                        unit_price: data.price,
                        expiry_date: data.expiry || null,
                      })
                      .select("id")
                      .single();
                    if (crErr) throw crErr;

                    const newMed: Medicine = {
                      id: created.id,
                      ...data,
                      image: data.image || "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80",
                    };
                    setMedicines((s) => [newMed, ...s]);
                    auditAdd({
                      actorEmail: null,
                      actorRole: null,
                      action: "pharmacy.add",
                      target: created.id,
                      meta: { name: newMed.name, category: newMed.category, stock: newMed.stock },
                    });
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Erreur";
                  setError(msg);
                  return;
                }

                setOpen(false);
              })();
            }}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

function MedicineForm({
  initial, onClose, onSave,
}: {
  initial: Omit<Medicine, "id"> | Medicine;
  onClose: () => void;
  onSave: (m: Omit<Medicine, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<Medicine, "id">>({
    name: initial.name, category: initial.category, stock: initial.stock,
    threshold: initial.threshold, price: initial.price, expiry: initial.expiry, image: initial.image,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[color:var(--navy)]/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.form
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave(form); }}
        className="w-full max-w-lg rounded-3xl bg-card border shadow-glow p-7"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-[color:var(--navy)]">
            {"id" in initial ? "Modifier le médicament" : "Nouveau médicament"}
          </h3>
          <button type="button" onClick={onClose} className="size-9 rounded-xl border grid place-items-center hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Nom">
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Catégorie">
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inp}>
                {CATEGORIES.filter((c) => c !== "Tous").map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Date d'expiration">
              <input type="date" required value={form.expiry} onChange={(e) => set("expiry", e.target.value)} className={inp} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Stock">
              <input type="number" min={0} value={form.stock} onChange={(e) => set("stock", +e.target.value)} className={inp} />
            </Field>
            <Field label="Seuil bas">
              <input type="number" min={0} value={form.threshold} onChange={(e) => set("threshold", +e.target.value)} className={inp} />
            </Field>
            <Field label="Prix (€)">
              <input type="number" min={0} step={0.01} value={form.price} onChange={(e) => set("price", +e.target.value)} className={inp} />
            </Field>
          </div>
          <Field label="URL image">
            <input value={form.image} onChange={(e) => set("image", e.target.value)} className={inp} />
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
