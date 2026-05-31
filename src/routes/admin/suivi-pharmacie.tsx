import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  FileText,
  Pill,
  Plus,
  Tags,
  Truck,
  X,
} from "lucide-react";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { type Medicine } from "@/lib/store";
import { getSupabaseAsync } from "@/lib/supabase";
import { toast } from "sonner";
import { formatFcfa } from "@/lib/currency";

export const Route = createFileRoute("/admin/suivi-pharmacie")({
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

//

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
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => readLocalArray("2kc-pharmacy-suppliers", seedSuppliers));
  const [orders, setOrders] = useState<MedicineOrder[]>(() => readLocalArray("2kc-pharmacy-orders", []));
  const [loading, setLoading] = useState(true);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  async function load() {
    setLoading(true);
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
      toast.error(errorMessage(err, "Stock Supabase indisponible. Le catalogue local reste utilisable."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("2kc-pharmacy-suppliers", JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("2kc-pharmacy-orders", JSON.stringify(orders));
  }, [orders]);

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

  const lowStock = useMemo(() => medicines.filter((m) => m.stock > 0 && m.stock <= m.threshold), [medicines]);
  const outOfStock = useMemo(() => medicines.filter((m) => m.stock <= 0), [medicines]);
  const stockValue = useMemo(() => medicines.reduce((s, m) => s + m.stock * m.price, 0), [medicines]);
  const consumedUnits = useMemo(
    () => movements.filter((m) => Number(m.delta) < 0).reduce((s, m) => s + Math.abs(Number(m.delta || 0)), 0),
    [movements],
  );
  const pendingOrders = orders.filter((o) => o.status === "commandee");

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

  //

  return (
    <DashboardLayout allow="admin" title="Suivi des stocks">
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-5">
        <StatCard label="Medicaments" value={loading ? "..." : medicines.length} icon={Pill} accent />
        <StatCard label="Stock faible" value={loading ? "..." : lowStock.length} icon={AlertTriangle} />
        <StatCard label="Rupture" value={loading ? "..." : outOfStock.length} icon={Boxes} />
        <StatCard label="Commandes" value={orders.length} hint={`En attente: ${pendingOrders.length}`} icon={Truck} />
        <StatCard label="Valeur stock" value={loading ? "..." : money(stockValue)} icon={ClipboardList} />
      </div>

      <div className="mt-8">
        <section className="rounded-3xl border bg-card p-5">
          <h3 className="font-bold text-[color:var(--navy)] flex items-center gap-2"><AlertTriangle className="size-5 text-amber-500" /> Alertes stock</h3>
          <div className="mt-4 space-y-2">
            {[...outOfStock, ...lowStock].slice(0, 6).map((m) => (
              <div key={m.id} className="rounded-xl border bg-muted/20 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground">Stock {m.stock} / seuil {m.threshold}</p>
                </div>
                <span className={`text-[10px] font-bold rounded-full px-2 py-1 ${m.stock <= 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{m.stock <= 0 ? "Rupture" : "Faible"}</span>
              </div>
            ))}
            {!outOfStock.length && !lowStock.length ? <p className="text-sm text-muted-foreground">Aucune alerte.</p> : null}
          </div>
        </section>
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <section className="rounded-3xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-[color:var(--navy)] flex items-center gap-2"><Tags className="size-5 text-[color:var(--mint)]" /> Categories</h3>
            <span className="text-xs rounded-full bg-muted px-3 py-1">{categories.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {categories.map((c) => (
              <div key={c.name} className="rounded-xl border bg-muted/20 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--navy)]">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.count} reference(s)</p>
                </div>
                <p className="text-sm font-semibold">{money(c.value)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-[color:var(--navy)] flex items-center gap-2"><Truck className="size-5 text-[color:var(--mint)]" /> Fournisseurs</h3>
            <button onClick={() => setSupplierOpen(true)} className="size-9 rounded-xl border grid place-items-center hover:bg-muted" aria-label="Ajouter fournisseur"><Plus className="size-4" /></button>
          </div>
          <div className="mt-4 space-y-2">
            {suppliers.map((s) => (
              <div key={s.id} className="rounded-xl border bg-muted/20 p-3">
                <p className="text-sm font-semibold text-[color:var(--navy)]">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.city} - {s.phone}</p>
                <p className="text-xs text-muted-foreground">{s.email}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-[color:var(--navy)] flex items-center gap-2"><ClipboardList className="size-5 text-[color:var(--mint)]" /> Commandes</h3>
            <button onClick={() => setOrderOpen(true)} className="inline-flex items-center gap-2 rounded-xl gradient-mint px-3 py-2 text-xs font-semibold text-[color:var(--navy)]"><Plus className="size-3.5" /> Commander</button>
          </div>
          <div className="mt-4 space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded-xl border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--navy)]">{o.medicineName}</p>
                    <p className="text-xs text-muted-foreground">{o.qty} unite(s) - {o.supplierName}</p>
                    <p className="text-xs text-muted-foreground">{money(o.qty * o.unitPrice)}</p>
                  </div>
                  {o.status === "commandee" ? (
                    <button onClick={() => void receiveOrder(o)} className="rounded-xl border px-3 py-2 text-xs hover:bg-muted">Recevoir</button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" /> Recu</span>
                  )}
                </div>
              </div>
            ))}
            {orders.length === 0 ? <p className="text-sm text-muted-foreground">Aucune commande enregistree.</p> : null}
          </div>
        </section>
      </div>

      <div className="mt-8 grid lg:grid-cols-2 gap-6">
        <section className="rounded-3xl border bg-card p-5">
          <h3 className="font-bold text-[color:var(--navy)] flex items-center gap-2"><FileText className="size-5 text-[color:var(--mint)]" /> Ordonnances emises</h3>
          <div className="mt-4 space-y-3">
            {prescriptions.map((p) => (
              <div key={p.id} className="rounded-2xl border bg-muted/10 p-4">
                <p className="font-semibold text-[color:var(--navy)]">{p.patient ? `${p.patient.first_name} ${p.patient.last_name}` : "Patient"}</p>
                <p className="text-xs text-muted-foreground">{safeDate(p.created_at)} - {p.practitioner?.full_name ?? "Medecin"} - {p.status}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(p.items ?? []).map((it) => (
                    <span key={it.id} className="rounded-xl border bg-card px-3 py-1 text-xs">{it.medicine_name}{it.dosage ? ` - ${it.dosage}` : ""}</span>
                  ))}
                </div>
              </div>
            ))}
            {!prescriptions.length ? <p className="text-sm text-muted-foreground">Aucune ordonnance visible.</p> : null}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5">
          <h3 className="font-bold text-[color:var(--navy)] flex items-center gap-2"><Boxes className="size-5 text-[color:var(--mint)]" /> Consommation et mouvements</h3>
          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <MiniStat label="Unites sorties" value={consumedUnits} />
            <MiniStat label="References" value={medicines.length} />
            <MiniStat label="Valeur stock" value={money(stockValue)} />
          </div>
          <div className="mt-4 space-y-2">
            {movements.slice(0, 8).map((m) => (
              <div key={m.id} className="rounded-xl border bg-muted/20 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{m.item?.name ?? "Article"}</p>
                  <p className="text-xs text-muted-foreground">{m.reason ?? "mouvement"} - {safeDate(m.moved_at)}</p>
                </div>
                <p className={`font-bold ${Number(m.delta) < 0 ? "text-red-600" : "text-emerald-700"}`}>{Number(m.delta) > 0 ? "+" : ""}{m.delta}</p>
              </div>
            ))}
            {!movements.length ? <p className="text-sm text-muted-foreground">Aucun mouvement de stock trouve.</p> : null}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {supplierOpen ? <SupplierForm onClose={() => setSupplierOpen(false)} onSave={addSupplier} /> : null}
        {orderOpen ? <OrderForm medicines={medicines} suppliers={suppliers} onClose={() => setOrderOpen(false)} onSave={addOrder} /> : null}
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

//

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
