import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { type Medicine } from "@/lib/store";
import { Pill, AlertTriangle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { toast } from "sonner";
import { hasGemini, stockReorderAdvice } from "@/lib/ai";

export const Route = createFileRoute("/pharmacien")({ component: PharmacienHome });

function PharmacienHome() {
  const [meds, setMeds] = useState<Medicine[]>([]);
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

        if (alive) setMeds(mapped);
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
    <DashboardLayout allow="pharmacien" title="Pharmacie & délivrance (simulation)">
      <div className="rounded-3xl border bg-card p-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[color:var(--navy)] flex items-center gap-2">
              <Pill className="size-5 text-[color:var(--mint)]" /> Stock pharmacie
            </h3>
            <p className="text-sm text-muted-foreground">Consultation du stock (édition réservée à l'admin)</p>
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

        {loading && (
          <p className="text-center text-muted-foreground mt-10">Chargement...</p>
        )}

        {advice ? (
          <div className="mt-6 rounded-2xl border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
            <p className="font-semibold text-[color:var(--navy)] mb-2">Recommandations IA</p>
            {advice}
          </div>
        ) : null}

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {meds.slice(0, 9).map((m) => (
            <div key={m.id} className="rounded-2xl border p-4 bg-muted/10">
              <p className="font-semibold text-[color:var(--navy)] truncate">{m.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.category}</p>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className={`text-2xl font-bold ${m.stock <= m.threshold ? "text-amber-600" : "text-[color:var(--navy)]"}`}>{m.stock}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unités</p>
                </div>
                <p className="text-sm font-semibold text-[color:var(--navy)]">{m.price.toFixed(2)} €</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
