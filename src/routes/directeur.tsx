import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { Users, Calendar, Activity, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseAsync } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { directorKpiInsights } from "@/lib/ai";

export const Route = createFileRoute("/directeur")({ component: DirecteurHome });

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfTomorrowIso() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}
function startOfMonthIso() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfNextMonthIso() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmt(x: number) {
  return new Intl.NumberFormat("fr-FR").format(x) + " XAF";
}

function DirecteurHome() {
  const [loading, setLoading] = useState(true);
  const [todayAppts, setTodayAppts] = useState<Array<{ id: string; patient_id: string }>>([]);
  const [stock, setStock] = useState<Array<{ stock: number; unit_price: number }>>([]);
  const [monthPayments, setMonthPayments] = useState<Array<{ amount: number }>>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");

  const todayStart = useMemo(() => startOfTodayIso(), []);
  const tomorrowStart = useMemo(() => startOfTomorrowIso(), []);
  const monthStart = useMemo(() => startOfMonthIso(), []);
  const nextMonthStart = useMemo(() => startOfNextMonthIso(), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const supabase = await getSupabaseAsync();
        const sb: any = supabase;
        const [ap, st, pay] = await Promise.all([
          sb
            .schema("app")
            .from("appointments")
            .select("id, patient_id")
            .gte("scheduled_at", todayStart)
            .lt("scheduled_at", tomorrowStart),
          sb
            .schema("app")
            .from("stock_items")
            .select("stock, unit_price")
            .eq("kind", "pharmacy"),
          sb
            .schema("app")
            .from("payments")
            .select("amount")
            .gte("received_at", monthStart)
            .lt("received_at", nextMonthStart),
        ]);
        if (ap.error) throw ap.error;
        if (st.error) throw st.error;
        if (pay.error) throw pay.error;
        if (alive) {
          setTodayAppts((ap.data ?? []) as any);
          setStock((st.data ?? []) as any);
          setMonthPayments((pay.data ?? []) as any);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [todayStart, tomorrowStart, monthStart, nextMonthStart]);

  const uniquePatients = new Set((todayAppts ?? []).map((a) => a.patient_id)).size;
  const apptCount = todayAppts.length;
  const stockValue = stock.reduce((s, x) => s + Number(x.stock || 0) * Number(x.unit_price || 0), 0);
  const monthRevenue = monthPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  async function runAiInsights() {
    try {
      setAiLoading(true);
      const text = await directorKpiInsights({
        uniquePatients,
        apptCount,
        stockValue,
        monthRevenue,
      });
      setAiText(text);
    } catch (err: any) {
      toast.error(err?.message ?? "Service indisponible.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <DashboardLayout allow="directeur" title="Tableau de bord (lecture seule)">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="Patients / jour" value={loading ? "â€¦" : String(uniquePatients)} icon={Users} accent />
        <StatCard label="RDV aujourd'hui" value={loading ? "â€¦" : String(apptCount)} icon={Calendar} />
        <StatCard label="Valeur stock (pharmacie)" value={loading ? "â€¦" : fmt(stockValue)} icon={Activity} />
        <StatCard label="Revenus (mois)" value={loading ? "â€¦" : fmt(monthRevenue)} icon={TrendingUp} />
      </div>

      <div className="mt-4 space-y-3">
        <button
          type="button"
          onClick={() => void runAiInsights()}
          disabled={aiLoading}
          className="rounded-2xl gradient-mint text-[color:var(--navy)] font-semibold px-5 py-3 border-none shadow-mint disabled:opacity-60"
        >
          Analyse des indicateurs
        </button>
        {aiText ? (
          <Card className="rounded-2xl border bg-muted/40">
            <CardContent className="pt-4">
              <pre className="whitespace-pre-wrap text-sm text-[color:var(--navy)]">{aiText}</pre>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 rounded-3xl border bg-card p-7"
      >
        <h3 className="text-lg font-bold text-[color:var(--navy)]">Indicateurs clÃ©s</h3>
        <p className="mt-2 text-sm text-muted-foreground">Vue synthÃ©tique.</p>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { k: "Patients uniques (jour)", v: loading ? "â€¦" : String(uniquePatients) },
            { k: "RDV planifiÃ©s", v: loading ? "â€¦" : String(apptCount) },
            { k: "Encaissements (mois)", v: loading ? "â€¦" : fmt(monthRevenue) },
          ].map((x) => (
            <div key={x.k} className="rounded-2xl border p-5 bg-muted/10">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{x.k}</p>
              <p className="mt-2 text-lg font-bold text-[color:var(--navy)]">{x.v}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </DashboardLayout>
  );
}


