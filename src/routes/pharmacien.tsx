import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { type Medicine } from "@/lib/store";
import { Pill, AlertTriangle, Sparkles, CheckCircle2, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { toast } from "sonner";
import { hasGemini, stockReorderAdvice } from "@/lib/ai";

export const Route = createFileRoute("/pharmacien")({ component: PharmacienHome });

type Prescription = {
  id: string;
  created_at: string;
  status: string;
  patient?: { first_name: string; last_name: string } | null;
  practitioner?: { full_name: string | null } | null;
  items?: Array<{
    id: string;
    medicine_name: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
  }>;
};

function PharmacienHome() {
  const [meds, setMeds] = useState<Medicine[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [advice, setAdvice] = useState<string>("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabase();
        const sb: any = supabase;
        const [stockRes, prescRes] = await Promise.all([
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
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(30),
        ]);
        if (stockRes.error) throw stockRes.error;
        if (prescRes.error) throw prescRes.error;

        const mapped: Medicine[] = (stockRes.data ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          category: r.category ?? "Autre",
          stock: r.stock ?? 0,
          threshold: r.threshold ?? 0,
          price: Number(r.unit_price ?? 0),
          expiry: r.expiry_date ?? "",
          image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80",
        }));

        if (alive) {
          setMeds(mapped);
          setPrescriptions((prescRes.data ?? []) as any);
        }
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

  const lowStock = useMemo(() => meds.filter((m: Medicine) => m.stock <= m.threshold), [meds]);

  async function dispensePrescription(presc: Prescription) {
    try {
      const supabase = getSupabase();
      const authUser = (await supabase.auth.getUser()).data.user;
      const sb: any = supabase;
      if (!authUser?.id) throw new Error("Session introuvable.");

      const { error: dErr } = await sb.schema("app").from("dispensations").insert({
        prescription_id: presc.id,
        dispensed_by: authUser.id,
        notes: "Delivrance depuis l'ecran pharmacien",
      });
      if (dErr) throw dErr;

      await sb
        .schema("app")
        .from("prescriptions")
        .update({ status: "fulfilled" })
        .eq("id", presc.id);

      for (const item of presc.items ?? []) {
        const med = meds.find((m) => m.name.toLowerCase() === item.medicine_name.toLowerCase());
        if (!med) continue;
        const nextStock = Math.max(0, med.stock - 1);
        await sb.schema("app").from("stock_items").update({ stock: nextStock }).eq("id", med.id);
        await sb
          .schema("app")
          .from("stock_movements")
          .insert({
            item_id: med.id,
            moved_by: authUser.id,
            delta: -1,
            reason: "dispensation",
            meta: { prescription_id: presc.id, medicine_name: item.medicine_name },
          });
      }

      setPrescriptions((prev) => prev.filter((p) => p.id !== presc.id));
      setMeds((prev) =>
        prev.map((m) =>
          (presc.items ?? []).some((it) => it.medicine_name.toLowerCase() === m.name.toLowerCase())
            ? { ...m, stock: Math.max(0, m.stock - 1) }
            : m,
        ),
      );
      toast.success("Prescription delivree et stock mis a jour.");
    } catch (err: any) {
      toast.error(err?.message ?? "Delivrance impossible.");
    }
  }

  async function runAdvice() {
    try {
      if (!hasGemini()) {
        toast.error("Clé IA manquante (VITE_GEMINI_API_KEY). Ajoutez-la dans .env et relancez.");
        return;
      }
      setAiLoading(true);
      const txt = await stockReorderAdvice(
        lowStock.map((m) => ({ name: m.name, stock: m.stock, threshold: m.threshold })),
      );
      setAdvice(txt);
    } catch (err: any) {
      toast.error(err?.message ?? "Assistant IA indisponible.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <DashboardLayout allow="pharmacien" title="Pharmacie & délivrance">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        <StatCard
          label="Prescriptions actives"
          value={loading ? "..." : String(prescriptions.length)}
          icon={FileText}
          accent
        />
        <StatCard
          label="Alertes stock"
          value={loading ? "..." : String(lowStock.length)}
          icon={AlertTriangle}
        />
        <StatCard
          label="References pharmacie"
          value={loading ? "..." : String(meds.length)}
          icon={Pill}
        />
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-3xl border bg-card p-4 sm:p-7">
          <div>
            <h3 className="text-lg font-bold text-[color:var(--navy)] flex items-center gap-2">
              <FileText className="size-5 text-[color:var(--mint)]" /> Prescriptions actives
            </h3>
            <p className="text-sm text-muted-foreground">A delivrer puis marquer comme traitee.</p>
          </div>

          <div className="mt-5 space-y-3">
            {(loading ? [] : prescriptions).map((p) => (
              <div key={p.id} className="rounded-2xl border bg-muted/10 p-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-[color:var(--navy)]">
                      {p.patient ? `${p.patient.first_name} ${p.patient.last_name}` : "Patient"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()} -{" "}
                      {p.practitioner?.full_name ?? "Medecin"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(p.items ?? []).map((it) => (
                        <span
                          key={it.id}
                          className="rounded-xl border bg-card px-3 py-1 text-xs text-[color:var(--navy)]"
                        >
                          {it.medicine_name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void dispensePrescription(p)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-mint px-4 py-2.5 text-sm font-semibold text-[color:var(--navy)] shrink-0"
                  >
                    <CheckCircle2 className="size-4" /> Delivrer
                  </button>
                </div>
              </div>
            ))}
            {!loading && prescriptions.length === 0 ? (
              <div className="rounded-2xl border bg-muted/30 p-5 text-sm text-muted-foreground">
                Aucune prescription active.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-4 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-[color:var(--navy)] flex items-center gap-2">
                <Pill className="size-5 text-[color:var(--mint)]" /> Stock pharmacie
              </h3>
              <p className="text-sm text-muted-foreground">
                Consultation du stock (édition réservée à l'admin)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lowStock.length > 0 && (
                <span className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
                  <AlertTriangle className="size-4" /> {lowStock.length} alerte(s)
                </span>
              )}
              <button
                type="button"
                onClick={() => void runAdvice()}
                disabled={aiLoading}
                className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full border hover:bg-muted disabled:opacity-60"
              >
                <Sparkles className="size-4 text-[color:var(--mint)]" /> IA: Recommander
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading && <p className="text-center text-muted-foreground mt-10">Chargement...</p>}

          {advice ? (
            <div className="mt-6 rounded-2xl border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
              <p className="font-semibold text-[color:var(--navy)] mb-2">Recommandations IA</p>
              {advice}
            </div>
          ) : null}

          <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-1 gap-4">
            {meds.slice(0, 9).map((m) => (
              <div key={m.id} className="rounded-2xl border p-4 bg-muted/10">
                <p className="font-semibold text-[color:var(--navy)] truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{m.category}</p>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p
                      className={`text-2xl font-bold ${m.stock <= m.threshold ? "text-amber-600" : "text-[color:var(--navy)]"}`}
                    >
                      {m.stock}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      unités
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[color:var(--navy)]">
                    {m.price.toFixed(2)} €
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
