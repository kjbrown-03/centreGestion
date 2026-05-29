import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout, StatCard } from "@/components/dashboard/DashboardLayout";
import { Users, Calendar, Activity, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/directeur")({ component: DirecteurHome });

function DirecteurHome() {
  return (
    <DashboardLayout allow="directeur" title="Tableau de bord (lecture seule)">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="Patients / jour" value="86" icon={Users} accent />
        <StatCard label="RDV aujourd'hui" value="24" icon={Calendar} />
        <StatCard label="Taux d'occupation" value="78%" icon={Activity} />
        <StatCard label="Revenus (simu)" value="2 140 €" icon={TrendingUp} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 rounded-3xl border bg-card p-7"
      >
        <h3 className="text-lg font-bold text-[color:var(--navy)]">Indicateurs clés</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Vue synthétique (simulation) : pathologies fréquentes, volumes, tendance hebdomadaire.
        </p>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { k: "Pathologie #1", v: "Hypertension" },
            { k: "Pathologie #2", v: "Diabète" },
            { k: "Pathologie #3", v: "Infections ORL" },
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
