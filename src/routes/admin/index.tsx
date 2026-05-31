import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { Users, Calendar, Activity, Pill, ArrowUpRight, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { type Medicine } from "@/lib/store";
import { formatFcfa } from "@/lib/currency";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

function AdminHome() {
  const [meds, setMeds] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const supabase = getSupabase();
        const sb: any = supabase;
        const { data, error } = await sb
          .schema("app")
          .from("stock_items")
          .select("id, name, category, stock, threshold, unit_price, expiry_date")
          .eq("kind", "pharmacy");
        if (error) throw error;

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
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const lowStock = useMemo(() => meds.filter((m) => m.stock <= m.threshold), [meds]);
  const totalValue = useMemo(() => meds.reduce((acc, m) => acc + m.stock * m.price, 0), [meds]);

  const activity = [
    { time: "08:12", text: "Dr. Cissé a démarré sa première consultation", color: "bg-[color:var(--mint)]" },
    { time: "09:04", text: "Nouveau patient enregistré par Nadia", color: "bg-sky-400" },
    { time: "10:30", text: `Alerte stock bas : ${lowStock[0]?.name ?? "—"}`, color: "bg-amber-400" },
    { time: "11:15", text: "RDV du jour confirmés (24)", color: "bg-emerald-400" },
  ];

  return (
    <DashboardLayout allow="admin" title="Vue d'ensemble">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="Patients actifs" value="1 248" hint="+8% ce mois" icon={Users} accent />
        <StatCard label="RDV aujourd'hui" value="24" hint="6 en attente" icon={Calendar} />
        <StatCard label="Consultations" value="312" hint="cette semaine" icon={Activity} />
        <StatCard label="Stock pharmacie" value={loading ? "…" : meds.length} hint={`${lowStock.length} alertes`} icon={Pill} />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2 rounded-3xl border bg-card p-7">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[color:var(--navy)]">Activité récente</h3>
              <p className="text-sm text-muted-foreground">Dernières actions du centre</p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-[color:var(--mint)]/15 text-[color:var(--navy)] font-medium">en direct</span>
          </div>
          <ul className="mt-6 space-y-4">
            {activity.map((a, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className="flex gap-4 items-start"
              >
                <span className={`mt-1.5 size-2.5 rounded-full ${a.color} shadow-[0_0_0_4px_rgba(0,0,0,0.05)]`} />
                <div className="flex-1">
                  <p className="text-sm text-[color:var(--navy)]">{a.text}</p>
                  <p className="text-xs text-muted-foreground">{a.time}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-3xl gradient-hero p-7 text-white relative overflow-hidden">
          <div className="absolute -top-8 -right-8 size-40 rounded-full bg-[color:var(--mint)]/30 blur-3xl" />
          <h3 className="text-lg font-bold">Pharmacie</h3>
          <p className="text-white/70 text-sm">Valeur totale du stock</p>
          <p className="mt-4 font-display text-4xl font-bold text-gradient-mint">
            {formatFcfa(totalValue)}
          </p>
          {lowStock.length > 0 && (
            <div className="mt-5 rounded-2xl glass-dark p-4">
              <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
                <AlertTriangle className="size-4" /> {lowStock.length} référence(s) en seuil bas
              </div>
              <ul className="mt-2 text-xs text-white/70 space-y-1">
                {lowStock.slice(0, 3).map((m) => (
                  <li key={m.id}>· {m.name} — {m.stock} u.</li>
                ))}
              </ul>
            </div>
          )}
          <Link
            to="/admin/pharmacie"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--mint)] hover:gap-2.5 transition-all"
          >
            Gérer la pharmacie <ArrowUpRight className="size-4" />
          </Link>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
