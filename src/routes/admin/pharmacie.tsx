import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { type Medicine, useAuditLog } from "@/lib/store";
import { getSupabaseAsync } from "@/lib/supabase";
import { stockReorderAdvice } from "@/lib/ai";
import { toast } from "sonner";
import { formatFcfa } from "@/lib/currency";

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

type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
};

type MedicineOrder = {
  id: string;
  medicineId: string;
  medicineName: string;
  supplierId: string;
  supplierName: string;
  qty: number;
  unitPrice: number;
  status: "commandee" | "receptionnee";
  orderedAt: string;
  receivedAt?: string;
};

type Prescription = {
  id: string;
  created_at: string;
  status: string;
  patient?: { first_name: string; last_name: string } | null;
  practitioner?: { full_name: string | null } | null;
  items?: Array<{ id: string; medicine_name: string; dosage: string | null; frequency: string | null; duration: string | null }>;
};

type Movement = {
  id: string;
  moved_at: string;
  delta: number;
  reason: string | null;
  item?: { name: string } | null;
};

const seedSuppliers: Supplier[] = [
  { id: "sup-1", name: "CamPharma Distribution", phone: "693904197", email: "stock@campharma.cm", city: "Douala" },
  { id: "sup-2", name: "Sante Plus Grossiste", phone: "690000000", email: "contact@santeplus.cm", city: "Yaounde" },
];

function catalogAsMedicines(): Medicine[] {
  return MEDICINE_CATALOG.map((m) => ({
    id: `catalog-${m.name}`,
    ...m,
    image: DEFAULT_IMAGE,
  }));
}

function isPersistedId(id?: string) {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const maybe = err as { message?: string; error_description?: string; details?: string; hint?: string };
    return maybe.message || maybe.error_description || maybe.details || maybe.hint || fallback;
  }
  return fallback;
}

function money(x: number) {
  return formatFcfa(x);
}

function safeDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "-";
}

function readLocalArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function Pharmacie() {
  const auditAdd = useAuditLog((s) => s.add);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => readLocalArray("2kc-pharmacy-suppliers", seedSuppliers));
  const [orders, setOrders] = useState<MedicineOrder[]>(() => readLocalArray("2kc-pharmacy-orders", []));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [open, setOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [advice, setAdvice] = useState("");
  const locationSearch = useRouterState({ select: (s) => s.location.search });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const supabase = await getSupabaseAsync();
      const sb: any = supabase;
      const [stockRes, prescriptionRes, movementRes] = await Promise.all([
        sb
          .schema("app")
          .from("stock_items")
          .select("id, name, category, stock, threshold, unit_price, expiry_date")
          .eq("kind", "pharmacy")
          .order("name", { ascending: true }),
        sb
          .schema("app")
          .from("prescriptions")
          .select(
            "id, created_at, status, patient:patient_id(first_name,last_name), practitioner:practitioner_id(full_name), items:prescription_items(id, medicine_name, dosage, frequency, duration)",
          )
          .order("created_at", { ascending: false })
          .limit(12),
        sb
          .schema("app")
          .from("stock_movements")
          .select("id, moved_at, delta, reason, item:item_id(name)")
          .order("moved_at", { ascending: false })
          .limit(30),
      ]);

      if (stockRes.error) throw stockRes.error;

      const mapped: Medicine[] = (stockRes.data ?? []).map((r: any) => ({
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
      if (!prescriptionRes.error) setPrescriptions((prescriptionRes.data ?? []) as any);
      if (!movementRes.error) setMovements((movementRes.data ?? []) as any);
    } catch (err) {
      setMedicines(catalogAsMedicines());
      setError(errorMessage(err, "Stock Supabase indisponible. Le catalogue local reste utilisable."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    void load();

    let channel: any;
    getSupabaseAsync().then((supabase) => {
      if (!alive) return;
      channel = supabase
        .channel("admin_stock_realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "app", table: "stock_items" },
          (payload: any) => {
            if (!alive) return;
            const r = payload.new ?? payload.old;
            if (!r) return;
            if (payload.eventType === "DELETE") {
              setMedicines((prev) => prev.filter((m) => m.id !== r.id));
            } else {
              setMedicines((prev) => {
                const exists = prev.some((m) => m.id === r.id);
                const updated: Medicine = {
                  id: r.id,
                  name: r.name,
                  category: r.category ?? "Pharmacie",
                  stock: r.stock ?? 0,
                  threshold: r.threshold ?? 10,
                  price: Number(r.unit_price ?? 0),
                  expiry: r.expiry_date ?? "",
                  image: DEFAULT_IMAGE,
                };
                return exists
                  ? prev.map((m) => (m.id === r.id ? updated : m))
                  : [updated, ...prev];
              });
            }
          },
        )
        .subscribe();
    });

    return () => {
      alive = false;
      getSupabaseAsync().then((supabase) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("2kc-pharmacy-suppliers", JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("2kc-pharmacy-orders", JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    const params = new URLSearchParams(locationSearch ?? "");
    setQ(params.get("q") ?? "");
  }, [locationSearch]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return medicines;
    return medicines.filter((m) => `${m.name} ${m.category}`.toLowerCase().includes(needle));
  }, [medicines, q]);

  const categories = useMemo(() => {
    const map = new Map<string, { name: string; count: number; value: number }>();
    for (const m of medicines) {
      const key = m.category || "Pharmacie";
      const current = map.get(key) ?? { name: key, count: 0, value: 0 };
      current.count += 1;
      current.value += m.stock * m.price;
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [medicines]);

  const lowStock = useMemo(() => medicines.filter((m) => m.stock > 0 && m.stock < 10), [medicines]);
  const outOfStock = useMemo(() => medicines.filter((m) => m.stock <= 0), [medicines]);
  const stockValue = useMemo(() => medicines.reduce((s, m) => s + m.stock * m.price, 0), [medicines]);
  const consumedUnits = useMemo(
    () => movements.filter((m) => Number(m.delta) < 0).reduce((s, m) => s + Math.abs(Number(m.delta || 0)), 0),
    [movements],
  );
  const pendingOrders = orders.filter((o) => o.status === "commandee");

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
    if (!isPersistedId(id)) {
      setMedicines((s) => s.filter((x) => x.id !== id));
      return;
    }
    try {
      const supabase = await getSupabaseAsync();
      const before = medicines.find((x) => x.id === id) ?? null;
      const { error: delErr } = await (supabase as any).schema("app").from("stock_items").delete().eq("id", id);
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

      if (editing && isPersistedId(editing.id)) {
        const before = editing;
        const delta = data.stock - before.stock;
        const { error: upErr } = await (supabase as any)
          .schema("app")
          .from("stock_items")
          .update({
            name: data.name,
            category: data.category || "Pharmacie",
            stock: data.stock,
            threshold: data.threshold || before.threshold || 10,
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
        auditAdd({ actorEmail: null, actorRole: null, action: "pharmacy.update", target: editing.id, meta: { before, patch: data } });
      } else {
        const { data: created, error: crErr } = await (supabase as any)
          .schema("app")
          .from("stock_items")
          .insert({
            kind: "pharmacy",
            name: data.name,
            category: data.category || "Pharmacie",
            stock: data.stock,
            threshold: data.threshold || 10,
            unit_price: data.price,
            expiry_date: data.expiry || null,
          })
          .select("id")
          .single();
        if (crErr) throw crErr;

        const newMed: Medicine = { id: created.id, ...data, image: DEFAULT_IMAGE };
        setMedicines((s) => [newMed, ...s]);
        auditAdd({ actorEmail: null, actorRole: null, action: "pharmacy.add", target: created.id, meta: { name: newMed.name, category: newMed.category, stock: newMed.stock } });
      }

      setOpen(false);
      toast.success("Medicament enregistre.");
    } catch (err) {
      const newMed: Medicine = { id: editing?.id ?? `local-${crypto.randomUUID()}`, ...data, image: DEFAULT_IMAGE };
      setMedicines((s) => (editing ? s.map((x) => (x.id === editing.id ? newMed : x)) : [newMed, ...s]));
      setOpen(false);
      setError(`${errorMessage(err, "Enregistrement Supabase impossible.")} Le medicament reste affiche localement.`);
    }
  }

  function addSupplier(data: Omit<Supplier, "id">) {
    setSuppliers((s) => [{ id: crypto.randomUUID(), ...data }, ...s]);
    setSupplierOpen(false);
    toast.success("Fournisseur ajoute.");
  }

  function addOrder(data: { medicineId: string; supplierId: string; qty: number }) {
    const med = medicines.find((m) => m.id === data.medicineId);
    const supplier = suppliers.find((s) => s.id === data.supplierId);
    if (!med || !supplier) return;
    setOrders((s) => [
      {
        id: crypto.randomUUID(),
        medicineId: med.id,
        medicineName: med.name,
        supplierId: supplier.id,
        supplierName: supplier.name,
        qty: data.qty,
        unitPrice: med.price,
        status: "commandee",
        orderedAt: new Date().toISOString(),
      },
      ...s,
    ]);
    setOrderOpen(false);
    toast.success("Commande enregistree. Le pharmacien et le directeur recevront l'alerte via les notifications de stock.");
  }

  async function receiveOrder(order: MedicineOrder) {
    const med = medicines.find((m) => m.id === order.medicineId);
    if (!med) return;
    const nextStock = med.stock + order.qty;

    try {
      if (isPersistedId(order.medicineId)) {
        const supabase = await getSupabaseAsync();
        const authUser = (await supabase.auth.getUser()).data.user;
        const sb: any = supabase;
        const { error: upErr } = await sb.schema("app").from("stock_items").update({ stock: nextStock }).eq("id", order.medicineId);
        if (upErr) throw upErr;
        if (authUser?.id) {
          await sb.schema("app").from("stock_movements").insert({
            item_id: order.medicineId,
            moved_by: authUser.id,
            delta: order.qty,
            reason: "reception",
            meta: { order_id: order.id, supplier: order.supplierName },
          });
        }
      }

      setMedicines((s) => s.map((m) => (m.id === order.medicineId ? { ...m, stock: nextStock } : m)));
      setOrders((s) => s.map((o) => (o.id === order.id ? { ...o, status: "receptionnee", receivedAt: new Date().toISOString() } : o)));
      toast.success("Reception validee, stock mis a jour automatiquement.");
    } catch (err: any) {
      toast.error(err?.message ?? "Reception impossible.");
    }
  }

  async function runAdvice() {
    try {
      setAiLoading(true);
      const txt = await stockReorderAdvice(
        [...outOfStock, ...lowStock].map((m) => ({ name: m.name, stock: m.stock, threshold: m.threshold })),
      );
      setAdvice(txt);
    } catch (err: any) {
      toast.error(err?.message ?? "Service indisponible.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <DashboardLayout allow="admin" title="Pharmacie admin">
      

      <div className="mt-8 grid xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 rounded-3xl border bg-card p-5 sm:p-7">
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
            <button onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl gradient-mint text-[color:var(--navy)] font-semibold px-5 py-2.5 shadow-mint hover:brightness-110 transition">
              <Plus className="size-4" /> Nouveau medicament
            </button>
          </div>

          {error && <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
          {loading ? <p className="text-center text-muted-foreground mt-12">Chargement...</p> : null}

          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((m) => {
                const rupture = m.stock <= 0;
                const low = !rupture && m.stock < 10;
                return (
                  <motion.div key={m.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="rounded-2xl border bg-card overflow-hidden hover:shadow-glow transition">
                    <div className="relative aspect-[5/3] overflow-hidden bg-muted">
                      <img src={m.image} alt={m.name} className="size-full object-cover" />
                      {rupture || low ? (
                        <span className={`absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold rounded-full text-white px-2.5 py-1 ${rupture ? "bg-red-600" : "bg-amber-500"}`}>
                          {rupture ? "Rupture" : "Stock bas"}
                        </span>
                      ) : null}
                      <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider font-bold rounded-full glass px-2.5 py-1 text-[color:var(--navy)]">{m.category}</span>
                    </div>
                    <div className="p-4">
                      <p className="font-semibold text-[color:var(--navy)] truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Exp. {safeDate(m.expiry)}</p>
                      <div className="mt-4 flex items-center justify-between">
                        <div>
                          <p className={`text-2xl font-bold ${rupture ? "text-red-600" : low ? "text-amber-600" : "text-[color:var(--navy)]"}`}>{m.stock}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">seuil {m.threshold}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-[color:var(--navy)]">{money(m.price)}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unite</p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => openEdit(m)} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs rounded-lg border py-2 hover:bg-muted transition">
                          <Pencil className="size-3.5" /> Editer
                        </button>
                        <button onClick={() => void handleRemove(m.id)} className="inline-flex items-center justify-center rounded-lg border border-destructive/30 text-destructive p-2 hover:bg-destructive/10 transition">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {!loading && filtered.length === 0 ? <p className="text-center text-muted-foreground mt-12">Aucun medicament trouve.</p> : null}
        </section>

        
      </div>

      <AnimatePresence>
        {open ? <MedicineForm initial={editing ?? empty} medicines={medicines} onClose={() => setOpen(false)} onSave={(data) => void saveMedicine(data)} /> : null}
      </AnimatePresence>
    </DashboardLayout>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold text-[color:var(--navy)]">{value}</p>
    </div>
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
    for (const m of medicines) if (m.name && !seen.has(m.name)) seen.set(m.name, m);
    for (const m of MEDICINE_CATALOG) if (m.name && !seen.has(m.name)) seen.set(m.name, { id: `catalog-${m.name}`, ...m });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [medicines]);

  const [form, setForm] = useState({
    name: initial.name,
    category: initial.category,
    stock: "id" in initial ? String(initial.stock) : "",
    threshold: String(initial.threshold || 10),
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
      threshold: f.threshold || String(found?.threshold ?? 10),
      price: f.price || String(found?.price ?? ""),
      expiry: f.expiry || found?.expiry || "",
    }));
  }

  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name: form.name,
            category: form.category || "Pharmacie",
            stock: Number(form.stock),
            threshold: Number(form.threshold) || 10,
            price: Number(form.price),
            expiry: form.expiry,
            image: "id" in initial ? initial.image : DEFAULT_IMAGE,
          });
        }}
        className="w-full max-w-lg rounded-3xl bg-card border shadow-glow p-5 sm:p-7"
      >
        <ModalTitle title={"id" in initial ? "Modifier le medicament" : "Nouveau medicament"} onClose={onClose} />
        <div className="mt-6 space-y-4">
          <Field label="Nom">
            <select required value={form.name} onChange={(e) => chooseMedicine(e.target.value)} className={inp}>
              <option value="" disabled>Selectionner un medicament</option>
              {medicineOptions.map((m) => <option key={m.id} value={m.name}>{m.name} {m.category ? `- ${m.category}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Categorie">
            <input value={form.category} onChange={(e) => set("category", e.target.value)} className={inp} required />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date d'expiration">
              <input type="date" value={form.expiry} onChange={(e) => set("expiry", e.target.value)} className={inp} />
            </Field>
            <Field label="Stock disponible">
              <input type="number" min={0} placeholder="Quantite" value={form.stock} onChange={(e) => set("stock", e.target.value)} className={inp} required />
            </Field>
            <Field label="Seuil alerte">
              <input type="number" min={0} value={form.threshold} onChange={(e) => set("threshold", e.target.value)} className={inp} required />
            </Field>
            <Field label="Prix (FCFA)">
              <input type="number" min={0} step={1} placeholder="Prix unitaire" value={form.price} onChange={(e) => set("price", e.target.value)} className={inp} required />
            </Field>
          </div>
        </div>
        <FormActions onClose={onClose} />
      </form>
    </Modal>
  );
}

function SupplierForm({ onClose, onSave }: { onClose: () => void; onSave: (s: Omit<Supplier, "id">) => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "" });
  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
        className="w-full max-w-md rounded-3xl bg-card border shadow-glow p-5 sm:p-7"
      >
        <ModalTitle title="Nouveau fournisseur" onClose={onClose} />
        <div className="mt-6 space-y-4">
          <Field label="Nom"><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inp} /></Field>
          <Field label="Telephone"><input required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inp} /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inp} /></Field>
          <Field label="Ville"><input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={inp} /></Field>
        </div>
        <FormActions onClose={onClose} />
      </form>
    </Modal>
  );
}

function OrderForm({
  medicines, suppliers, onClose, onSave,
}: {
  medicines: Medicine[];
  suppliers: Supplier[];
  onClose: () => void;
  onSave: (o: { medicineId: string; supplierId: string; qty: number }) => void;
}) {
  const firstMed = medicines[0]?.id ?? "";
  const firstSup = suppliers[0]?.id ?? "";
  const [form, setForm] = useState({ medicineId: firstMed, supplierId: firstSup, qty: "1" });
  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ medicineId: form.medicineId, supplierId: form.supplierId, qty: Number(form.qty) || 1 });
        }}
        className="w-full max-w-md rounded-3xl bg-card border shadow-glow p-5 sm:p-7"
      >
        <ModalTitle title="Commander des medicaments" onClose={onClose} />
        <div className="mt-6 space-y-4">
          <Field label="Medicament">
            <select required value={form.medicineId} onChange={(e) => setForm((f) => ({ ...f, medicineId: e.target.value }))} className={inp}>
              {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} - stock {m.stock}</option>)}
            </select>
          </Field>
          <Field label="Fournisseur">
            <select required value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} className={inp}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Quantite commandee">
            <input type="number" min={1} required value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} className={inp} />
          </Field>
        </div>
        <FormActions onClose={onClose} submitLabel="Enregistrer la commande" />
      </form>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[color:var(--navy)]/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ type: "spring", stiffness: 240, damping: 22 }} onClick={(e) => e.stopPropagation()} className="w-full flex justify-center">
        {children}
      </motion.div>
    </motion.div>
  );
}

function ModalTitle({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xl font-bold text-[color:var(--navy)]">{title}</h3>
      <button type="button" onClick={onClose} className="size-9 rounded-xl border grid place-items-center hover:bg-muted">
        <X className="size-4" />
      </button>
    </div>
  );
}

function FormActions({ onClose, submitLabel = "Enregistrer" }: { onClose: () => void; submitLabel?: string }) {
  return (
    <div className="mt-7 flex gap-3 justify-end">
      <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border text-sm hover:bg-muted">Annuler</button>
      <button type="submit" className="px-5 py-2.5 rounded-xl gradient-mint text-[color:var(--navy)] font-semibold text-sm shadow-mint hover:brightness-110">{submitLabel}</button>
    </div>
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
